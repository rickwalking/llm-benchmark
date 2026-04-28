#!/usr/bin/env python3
"""Multi-vendor judging for library-lending Cohen's κ.

Each vendor receives identical inputs (rubric + path to evidence bundle for one
criterion). No Playwright MCP, no live app browsing — fair across vendors.

Usage:
  kappa-judge.py --vendor claude-opus47 [--only <gen>] [--criterion <c>]
  kappa-judge.py --vendor codex-gpt55
  kappa-judge.py --vendor opencode-deepseek

Outputs: runs/_kappa/<vendor>/<gen>-<criterion>.json
"""
from __future__ import annotations
import argparse, json, re, subprocess, sys
from pathlib import Path

ROOT = Path("/home/pmarins/projects/llm-benchmark-library")
HARNESS = ROOT / "harness"
RUNS = HARNESS / "runs"

GENS = ["opencode-deepseek", "codex-gpt55", "claude-opus47",
        "opencode-glm", "opencode-kimi"]
CRITERIA = ["ui_ux", "api_design", "architecture", "gherkin"]
RUBRIC_FILE = {
    "ui_ux": "ui-ux.md",
    "api_design": "api-design.md",
    "architecture": "architecture.md",
    "gherkin": "gherkin.md",
}
EVIDENCE_DIR = {
    "ui_ux": "ui-ux",
    "api_design": "api-design",
    "architecture": "architecture",
    "gherkin": "gherkin",
}

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


def build_prompt(gen: str, criterion: str) -> str:
    """Vendor-agnostic prompt: rubric + path to evidence bundle."""
    rubric = (ROOT / "rubrics" / RUBRIC_FILE[criterion]).read_text()
    evidence_dir = RUNS / f"{gen}-seed1" / "evidence" / EVIDENCE_DIR[criterion]
    return f"""{rubric}

---

## CANDIDATE TO SCORE

You are scoring the criterion **{criterion}** for an anonymous candidate. The
candidate's identity is irrelevant — score only the work shown.

**Evidence directory**: {evidence_dir}

This directory contains all the files the rubric asks you to look at — source
excerpts, tool outputs, file size distributions, screenshots (PNG), etc. Use
the Read / Glob / Grep tools to inspect the directory contents. Quote
specific evidence (file paths, code snippets, output values) in your scoring.

Limit yourself to inspecting that evidence directory. Do not browse the
internet, do not run shell commands, do not write files.

Output ONLY the JSON specified by the rubric, no prose before or after.
"""


def call_claude(prompt: str, evidence_dir: Path, timeout: int = 600) -> tuple[str, int]:
    cmd = [
        "claude", "--print", "--dangerously-skip-permissions",
        "--model", "claude-opus-4-7",
        "--allowedTools", "Read,Glob,Grep",
        "--add-dir", str(evidence_dir),
    ]
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
    return r.stdout, r.returncode


def call_codex(prompt: str, evidence_dir: Path, timeout: int = 600) -> tuple[str, int]:
    cmd = [
        "codex", "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "--cd", str(evidence_dir),
        "-m", "gpt-5.5",
    ]
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
    return r.stdout, r.returncode


def call_opencode(prompt: str, evidence_dir: Path, timeout: int = 600) -> tuple[str, int]:
    cmd = [
        "opencode", "run",
        "--dangerously-skip-permissions",
        "--dir", str(evidence_dir),
        "-m", "opencode-go/deepseek-v4-pro",
    ]
    r = subprocess.run(cmd + [prompt], capture_output=True, text=True, timeout=timeout)
    return r.stdout, r.returncode


VENDORS = {
    "claude-opus47": ("claude-opus-4-7", call_claude),
    "codex-gpt55": ("gpt-5.5", call_codex),
    "opencode-deepseek": ("opencode-go/deepseek-v4-pro", call_opencode),
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--vendor", required=True, choices=list(VENDORS.keys()))
    p.add_argument("--only", help="single candidate (debug)")
    p.add_argument("--criterion", help="single criterion (debug)")
    args = p.parse_args()

    out_dir = RUNS / "_kappa" / args.vendor
    out_dir.mkdir(parents=True, exist_ok=True)

    gens = [args.only] if args.only else GENS
    criteria = [args.criterion] if args.criterion else CRITERIA
    model_id, caller = VENDORS[args.vendor]

    for gen in gens:
        if gen not in GENS:
            print(f"unknown gen: {gen}", file=sys.stderr); continue
        for crit in criteria:
            if crit not in CRITERIA:
                print(f"unknown criterion: {crit}", file=sys.stderr); continue
            evidence_dir = RUNS / f"{gen}-seed1" / "evidence" / EVIDENCE_DIR[crit]
            if not evidence_dir.exists():
                print(f"  [{args.vendor}] SKIP {gen} {crit} — no evidence dir")
                continue

            print(f"[{args.vendor}] {gen} {crit}")
            prompt = build_prompt(gen, crit)
            try:
                raw, rc = caller(prompt, evidence_dir)
            except subprocess.TimeoutExpired:
                print(f"  TIMEOUT")
                raw, rc = "", -1
            except Exception as e:
                print(f"  ERROR: {e}")
                raw, rc = "", -2

            parsed = parse_json(raw)
            payload = {
                "vendor": args.vendor, "model": model_id,
                "gen": gen, "criterion": crit,
                "exit_code": rc, "raw": raw, "parsed": parsed,
                "parse_failed": parsed is None,
            }
            (out_dir / f"{gen}-{crit}.json").write_text(json.dumps(payload, indent=2))
            if parsed:
                # gherkin uses final_score; others use score
                sc = parsed.get("final_score") or parsed.get("score")
                print(f"  score={sc}")
            else:
                print(f"  parse_failed rc={rc}")


if __name__ == "__main__":
    raise SystemExit(main())
