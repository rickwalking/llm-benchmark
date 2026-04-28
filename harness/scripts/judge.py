#!/usr/bin/env python3
"""
Judge dispatcher — CLI-driven (Claude Code in --print mode).

For each criterion in config.judge_criteria:
  for pass in 1..judge_passes_per_criterion:
    1. Build a prompt = template + rubric + criterion-specific instructions.
    2. Spawn Claude Code with the persona system prompt and Playwright MCP.
    3. The judge investigates the candidate repo (read files, bash, browse the
       live app via Playwright MCP) and emits JSON to stdout.
    4. Parse, save raw + parsed under runs/<id>/judges/claude-code/<criterion>-pass<n>.json

Boots the candidate app once before judging and tears it down after.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import yaml


CRITERIA_TO_FILE = {
    "ui_ux":         "ui-ux.md",
    "api_design":    "api-design.md",
    "architecture":  "architecture.md",
    "gherkin":       "gherkin.md",
}
CRITERIA_TO_DIR = {
    "ui_ux":         "ui-ux",
    "api_design":    "api-design",
    "architecture":  "architecture",
    "gherkin":       "gherkin",
}


# ────────────────────────────────────────────────────────────────────────────
# substitutions
# ────────────────────────────────────────────────────────────────────────────


def substitute(text: str, mapping: dict[str, str]) -> str:
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text


def resolve_cmd(cmd_template: list[str], mapping: dict[str, str]) -> list[str]:
    return [substitute(arg, mapping) for arg in cmd_template]


# ────────────────────────────────────────────────────────────────────────────
# app lifecycle
# ────────────────────────────────────────────────────────────────────────────


def port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@dataclass
class AppHandle:
    """Either a host subprocess or a docker container ID; opaque to callers."""
    proc: subprocess.Popen | None = None
    container_id: str | None = None


def boot_candidate_host(candidate: Path, log_dir: Path) -> subprocess.Popen | None:
    log_dir.mkdir(parents=True, exist_ok=True)
    out = open(log_dir / "judge-app.log", "w")
    print(f"[judge] booting candidate app on host from {candidate}")
    return subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=candidate,
        stdout=out,
        stderr=subprocess.STDOUT,
        preexec_fn=os.setsid,
    )


def boot_candidate_container(harness_dir: Path, run_id: str, image: str, log_dir: Path) -> str | None:
    log_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(harness_dir / "scripts" / "docker-run.sh"),
        "boot-app", run_id, str(harness_dir), image,
    ]
    print(f"[judge] booting candidate app in container ({image})")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        print(f"[judge] docker run failed: {result.stderr.strip()}", file=sys.stderr)
        return None
    container_id = result.stdout.strip().splitlines()[-1]  # last line is the id
    (log_dir / "judge-app.container-id").write_text(container_id)
    return container_id


def boot_candidate(cfg: dict, candidate: Path, run_id: str, harness_dir: Path,
                   log_dir: Path, app_url: str, api_url: str) -> AppHandle | None:
    use_container = bool(cfg.get("container", {}).get("enabled"))
    handle = AppHandle()

    if use_container:
        image = cfg["container"].get("image", "llm-bench-runner:dev")
        cid = boot_candidate_container(harness_dir, run_id, image, log_dir)
        if cid is None:
            return None
        handle.container_id = cid
    else:
        proc = boot_candidate_host(candidate, log_dir)
        handle.proc = proc

    fe_host, fe_port = _split_url(app_url)
    be_host, be_port = _split_url(api_url)
    deadline = time.time() + 120  # containers are slower on first boot
    while time.time() < deadline:
        if port_open(fe_host, fe_port) and port_open(be_host, be_port):
            print(f"[judge] app up: {app_url} + {api_url}")
            return handle
        # Liveness: detect early exits
        if handle.proc and handle.proc.poll() is not None:
            print(f"[judge] dev process exited early; see {log_dir}/judge-app.log", file=sys.stderr)
            return None
        if handle.container_id:
            r = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", handle.container_id],
                               capture_output=True, text=True)
            if r.returncode != 0 or r.stdout.strip() != "true":
                print(f"[judge] container exited early: {handle.container_id[:12]}", file=sys.stderr)
                _capture_container_logs(handle.container_id, log_dir)
                return None
        time.sleep(2)

    print(f"[judge] timed out booting app — see {log_dir}/judge-app.log", file=sys.stderr)
    kill_app(handle, harness_dir)
    return None


def _capture_container_logs(container_id: str, log_dir: Path) -> None:
    try:
        subprocess.run(
            ["docker", "logs", container_id],
            stdout=open(log_dir / "judge-app.log", "w"),
            stderr=subprocess.STDOUT,
            check=False,
        )
    except Exception as e:
        print(f"[judge] failed to capture container logs: {e}", file=sys.stderr)


def kill_app(handle: AppHandle | None, harness_dir: Path | None = None) -> None:
    if handle is None:
        return
    if handle.proc is not None:
        try:
            os.killpg(os.getpgid(handle.proc.pid), signal.SIGTERM)
            handle.proc.wait(timeout=10)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(os.getpgid(handle.proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
    if handle.container_id is not None and harness_dir is not None:
        subprocess.run(
            [str(harness_dir / "scripts" / "docker-run.sh"), "stop", handle.container_id],
            capture_output=True,
        )


def _split_url(url: str) -> tuple[str, int]:
    # Trivial parser; assume http://host:port[/path]
    rest = url.split("://", 1)[1]
    hostport = rest.split("/", 1)[0]
    host, port = hostport.split(":")
    return host, int(port)


# ────────────────────────────────────────────────────────────────────────────
# prompt construction
# ────────────────────────────────────────────────────────────────────────────


def build_prompt(template: str, rubric: str, criterion: str, run: Path,
                 candidate: Path, app_url: str, api_url: str) -> str:
    evidence_dir = run / "evidence" / CRITERIA_TO_DIR[criterion]
    evidence_files = sorted(evidence_dir.rglob("*")) if evidence_dir.exists() else []
    evidence_listing = "\n".join(
        f"  - {p.relative_to(evidence_dir)}" for p in evidence_files if p.is_file()
    ) or "  (no pre-packaged evidence files)"

    return f"""{template}

---

## RUBRIC FOR THIS CRITERION

{rubric}

---

## YOUR TASK

You are scoring the criterion **`{criterion}`** of the candidate repository at:
  {candidate}

A live candidate stack is running for you:
  - Frontend: {app_url}
  - Backend:  {api_url}

You also have a pre-packaged evidence bundle for this criterion at:
  {evidence_dir}

Files in the bundle:
{evidence_listing}

Use whatever combination of tools the rubric calls for:
  - Read / Glob / Grep / Bash for inspecting source files and tool outputs.
  - Playwright MCP (`mcp__playwright__*`) to navigate the running UI and take
    screenshots if the rubric requires visual evidence.
  - Bash + curl for direct API probes.

When you have collected enough evidence, output ONLY the JSON specified by the
rubric. No prose before or after. The benchmark harness will parse stdout
and ignore everything that is not the JSON object.
"""


# ────────────────────────────────────────────────────────────────────────────
# JSON parser
# ────────────────────────────────────────────────────────────────────────────


JSON_OBJ_RE = re.compile(r"\{[\s\S]*\}", re.MULTILINE)


def parse_json(raw: str) -> dict | None:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = JSON_OBJ_RE.search(s)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


# ────────────────────────────────────────────────────────────────────────────
# judge invocation
# ────────────────────────────────────────────────────────────────────────────


def invoke_judge(cmd: list[str], prompt: str, cwd: Path, timeout: int) -> tuple[str, int]:
    """Spawn the judge CLI, pipe the prompt to stdin, capture stdout."""
    print(f"[judge]   cmd: {' '.join(shlex.quote(a) for a in cmd[:4])} ... ({len(cmd)} args)")
    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            cwd=str(cwd),
            timeout=timeout,
        )
        return result.stdout, result.returncode
    except subprocess.TimeoutExpired:
        return "", -1


# ────────────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--criterion", help="run only one criterion (debug)")
    args = parser.parse_args()

    run = Path(args.run).resolve()
    repo_root = Path(args.repo_root).resolve()
    harness_dir = Path(args.config).parent.resolve()
    cfg = yaml.safe_load(Path(args.config).read_text())

    candidate = run / "candidate"
    if not candidate.exists():
        print(f"ERROR: {candidate} not found", file=sys.stderr)
        return 2

    judge_cfg = cfg["judge"]
    persona = substitute(
        judge_cfg["persona"],
        {"${APP_URL}": judge_cfg["app_url"], "${API_URL}": judge_cfg["api_url"]},
    )

    template = (repo_root / "rubrics" / "judge-prompt-template.md").read_text()

    # Boot the app if requested.
    app_handle: AppHandle | None = None
    judges_dir = run / "judges"
    judges_dir.mkdir(parents=True, exist_ok=True)
    if judge_cfg.get("boot_app"):
        app_handle = boot_candidate(
            cfg, candidate, run.name, harness_dir, judges_dir,
            judge_cfg["app_url"], judge_cfg["api_url"],
        )
        if app_handle is None:
            print("[judge] WARNING: app did not boot — UI/UX and api_design judging will be degraded", file=sys.stderr)

    judge_name = judge_cfg["name"]
    out_root = judges_dir / judge_name
    out_root.mkdir(parents=True, exist_ok=True)

    criteria = [args.criterion] if args.criterion else cfg["judge_criteria"]
    passes = int(cfg.get("judge_passes_per_criterion", 1))

    summary: dict = {"judge": judge_name, "passes": passes, "results": {}}

    try:
        for criterion in criteria:
            rubric = (repo_root / "rubrics" / CRITERIA_TO_FILE[criterion]).read_text()
            prompt = build_prompt(
                template, rubric, criterion, run, candidate,
                judge_cfg["app_url"], judge_cfg["api_url"],
            )
            cmd_mapping = {
                "${CANDIDATE_DIR}": str(candidate),
                "${HARNESS_DIR}":   str(harness_dir),
                "${PERSONA}":       persona,
            }
            cmd = resolve_cmd(judge_cfg["cmd"], cmd_mapping)
            cwd = Path(substitute(judge_cfg.get("cwd", "${CANDIDATE_DIR}"), cmd_mapping))
            timeout = int(judge_cfg.get("timeout_seconds", 1200))

            per_pass: list[dict] = []
            for p in range(1, passes + 1):
                print(f"[judge] {criterion} pass {p}/{passes}")
                raw, rc = invoke_judge(cmd, prompt, cwd, timeout)
                parsed = parse_json(raw)

                tag = f"{criterion}-pass{p}"
                (out_root / f"{tag}.raw.txt").write_text(raw or "")
                payload = {
                    "criterion": criterion,
                    "pass": p,
                    "judge": judge_name,
                    "exit_code": rc,
                    "parsed": parsed,
                    "parse_failed": parsed is None,
                }
                (out_root / f"{tag}.json").write_text(json.dumps(payload, indent=2))
                per_pass.append(payload)
                if parsed is None:
                    print(f"[judge]   ! pass {p}: no JSON parsed (raw saved)", file=sys.stderr)
                else:
                    score = parsed.get("final_score") or parsed.get("score")
                    print(f"[judge]   pass {p} → score={score}")

            summary["results"][criterion] = per_pass

    finally:
        kill_app(app_handle, harness_dir)

    (judges_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"[judge] complete → {judges_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
