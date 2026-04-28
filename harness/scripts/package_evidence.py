#!/usr/bin/env python3
"""
Package evidence for the four judge-scored criteria.

For each criterion, we copy / extract just the files and tool outputs the rubric
needs. The judges receive ONLY that bundle — never the whole candidate repo —
so cross-criterion leakage is impossible and token cost stays bounded.

Outputs:
  $RUN_DIR/evidence/ui-ux/
  $RUN_DIR/evidence/api-design/
  $RUN_DIR/evidence/architecture/
  $RUN_DIR/evidence/gherkin/
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from glob import glob
from pathlib import Path

CRITERIA = ["ui-ux", "api-design", "architecture", "gherkin"]

# ────────────────────────────────────────────────────────────────────────────
# helpers
# ────────────────────────────────────────────────────────────────────────────


def find_first(candidate: Path, patterns: list[str]) -> Path | None:
    for pat in patterns:
        hits = sorted(candidate.glob(pat))
        if hits:
            return hits[0]
    return None


def copy_into(src: Path | None, dest: Path) -> bool:
    if src and src.exists() and src.is_file():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        return True
    return False


def write_text(dest: Path, text: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text)


def read_safe(p: Path) -> str:
    try:
        return p.read_text()
    except Exception:
        return ""


def directory_tree(root: Path, max_depth: int = 3) -> str:
    """A compact tree, depth-limited, dirs first, common ignores stripped."""
    IGNORE = {"node_modules", ".git", "dist", "build", ".stryker-tmp", "reports", ".next", ".vite"}
    lines: list[str] = []

    def walk(p: Path, depth: int, prefix: str = ""):
        if depth > max_depth:
            return
        try:
            entries = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        except FileNotFoundError:
            return
        entries = [e for e in entries if e.name not in IGNORE and not e.name.startswith(".")]
        for i, e in enumerate(entries):
            last = i == len(entries) - 1
            branch = "└── " if last else "├── "
            lines.append(f"{prefix}{branch}{e.name}{'/' if e.is_dir() else ''}")
            if e.is_dir():
                walk(e, depth + 1, prefix + ("    " if last else "│   "))

    lines.append(f"{root.name}/")
    walk(root, 1, "")
    return "\n".join(lines)


def extract_ac_ids(requirements_md: Path) -> list[str]:
    """Pull AC-x.y identifiers from the requirements doc."""
    text = read_safe(requirements_md)
    return sorted(set(re.findall(r"AC-\d+\.\d+", text)))


# ────────────────────────────────────────────────────────────────────────────
# per-criterion packagers
# ────────────────────────────────────────────────────────────────────────────


def package_ui_ux(candidate: Path, objective: Path, evidence: Path) -> None:
    out = evidence / "ui-ux"
    out.mkdir(parents=True, exist_ok=True)

    # Screenshots
    shots_src = objective / "screenshots"
    if shots_src.exists():
        shutil.copytree(shots_src, out / "screenshots", dirs_exist_ok=True)

    # Axe + Lighthouse summaries (compact, not the raw blob)
    axe = read_safe(objective / "axe.json")
    lh = read_safe(objective / "lighthouse.json")
    write_text(out / "axe-summary.json", axe or "{}")
    write_text(out / "lighthouse-summary.json", lh or "[]")

    # Two representative rendered HTML pages — best-effort capture via curl at probe time
    for path_alias, fname in [("/books", "books.html"), ("/checkout", "checkout.html")]:
        try:
            r = subprocess.run(
                ["curl", "-s", "--max-time", "5", f"http://localhost:5173{path_alias}"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if r.returncode == 0 and r.stdout:
                write_text(out / fname, r.stdout)
        except Exception:
            pass  # app may not be running at packaging time; that's fine


def package_api_design(candidate: Path, objective: Path, evidence: Path) -> None:
    out = evidence / "api-design"
    out.mkdir(parents=True, exist_ok=True)

    # OpenAPI spec
    copy_into(candidate / "backend" / "openapi.yaml", out / "openapi.yaml")

    # Route registration — common conventions
    routes = find_first(candidate, [
        "backend/src/routes/index.ts",
        "backend/src/routes.ts",
        "backend/src/app.ts",
        "backend/src/server.ts",
    ])
    copy_into(routes, out / "routes.ts")

    # Two representative handlers / services
    for resource in ("loan", "reservation"):
        h = find_first(candidate, [
            f"backend/src/routes/{resource}*.ts",
            f"backend/src/handlers/{resource}*.ts",
            f"backend/src/services/{resource}*.ts",
        ])
        if h:
            copy_into(h, out / f"{resource}-handler.ts")

    # Error-handling middleware
    err = find_first(candidate, [
        "backend/src/middleware/error*.ts",
        "backend/src/errors.ts",
        "backend/src/middleware.ts",
    ])
    copy_into(err, out / "error-middleware.ts")

    # Tool outputs
    copy_into(objective / "openapi-validation.log", out / "openapi-validation.log")
    copy_into(objective / "api-probe.json", out / "api-probe.json")


def package_architecture(candidate: Path, objective: Path, evidence: Path) -> None:
    out = evidence / "architecture"
    out.mkdir(parents=True, exist_ok=True)

    # Trees
    if (candidate / "backend" / "src").exists():
        write_text(out / "backend-tree.txt", directory_tree(candidate / "backend" / "src"))
    if (candidate / "frontend" / "src").exists():
        write_text(out / "frontend-tree.txt", directory_tree(candidate / "frontend" / "src"))

    copy_into(objective / "file-sizes.csv", out / "file-sizes.csv")
    copy_into(objective / "madge.json", out / "madge.json")

    # policy/ contents in full (per the spec, all rules live here)
    policy_dir = candidate / "backend" / "src" / "policy"
    if policy_dir.exists():
        out_policy = out / "policy"
        shutil.copytree(policy_dir, out_policy, dirs_exist_ok=True)

    # One service + the matching HTTP handler
    for resource in ("loan",):
        for kind, dest in (("services", "service"), ("routes", "handler"), ("handlers", "handler")):
            h = find_first(candidate, [f"backend/src/{kind}/{resource}*.ts"])
            if h:
                copy_into(h, out / f"{resource}-{dest}.ts")

    # Frontend routes
    fe_routes = find_first(candidate, [
        "frontend/src/App.tsx",
        "frontend/src/routes.tsx",
        "frontend/src/main.tsx",
    ])
    copy_into(fe_routes, out / "frontend-routes.tsx")

    # One feature directory listing (whichever exists)
    for feat in ("checkout", "members", "books"):
        feat_dir = candidate / "frontend" / "src" / "features" / feat
        if feat_dir.exists():
            write_text(out / f"feature-{feat}-tree.txt", directory_tree(feat_dir, max_depth=4))
            break


def package_gherkin(candidate: Path, objective: Path, evidence: Path, repo_root: Path) -> None:
    out = evidence / "gherkin"
    out.mkdir(parents=True, exist_ok=True)

    # Feature files
    features_dir = candidate / "features"
    if features_dir.exists():
        shutil.copytree(features_dir, out / "features", dirs_exist_ok=True)

    # AC IDs from the canonical requirements doc
    ac_ids = extract_ac_ids(repo_root / "fixture" / "REQUIREMENTS.md")
    write_text(out / "ac-ids.txt", "\n".join(ac_ids))

    # Cucumber report
    copy_into(objective / "bdd.json", out / "bdd-report.json")


# ────────────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, help="path to runs/<id>/")
    parser.add_argument("--repo-root", required=True, help="path to repo root (contains fixture/)")
    args = parser.parse_args()

    run = Path(args.run).resolve()
    repo_root = Path(args.repo_root).resolve()
    candidate = run / "candidate"
    objective = run / "objective"
    evidence = run / "evidence"

    if not candidate.exists():
        print(f"ERROR: {candidate} not found", flush=True)
        return 2

    evidence.mkdir(parents=True, exist_ok=True)

    print(f"[evidence] candidate: {candidate}")
    print(f"[evidence] objective: {objective}")
    print(f"[evidence] writing to: {evidence}")

    package_ui_ux(candidate, objective, evidence)
    print("[evidence] ui-ux ✓")
    package_api_design(candidate, objective, evidence)
    print("[evidence] api-design ✓")
    package_architecture(candidate, objective, evidence)
    print("[evidence] architecture ✓")
    package_gherkin(candidate, objective, evidence, repo_root)
    print("[evidence] gherkin ✓")

    # Manifest of files in each bundle, for reproducibility
    manifest = {}
    for crit in CRITERIA:
        d = evidence / crit
        if d.exists():
            manifest[crit] = sorted(str(p.relative_to(d)) for p in d.rglob("*") if p.is_file())
    (evidence / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[evidence] manifest written → {evidence / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
