#!/usr/bin/env python3
"""
Score aggregator. Four modes:

  --run <path>                  per-run aggregation → runs/<id>/score.json
  --leaderboard --model <name>  aggregate seeds for one model
  --article                     aggregate all models → article tables
  --check                       structural sanity check on fixture + rubrics

Math:
  • Objective sub-scores normalize to 0..1 per criterion (rules in `_objective_scores`).
  • Judge sub-scores: median of judge integers, scaled (5→1.0, 1→0.0).
  • Hybrid criteria mix per config.hybrid_split.
  • Final = sum(weight * score) × 100.
  • Cohen's κ computed pairwise per criterion across judges and averaged.
  • Variance across seeds reported per model.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path

import numpy as np
import yaml

# With a single judge run multiple times per criterion, we report within-judge
# variance (stdev across passes) rather than Cohen's κ across judges. κ would
# require ≥2 independent judges; the harness no longer assumes that.


# ────────────────────────────────────────────────────────────────────────────
# objective scoring
# ────────────────────────────────────────────────────────────────────────────


def _read_json(p: Path) -> dict | list | None:
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _score_first_run(obj: Path) -> tuple[float, dict]:
    fr = _read_json(obj / "first_run.json") or {}
    install = bool(fr.get("install_succeeded"))
    booted = bool(fr.get("app_booted"))
    s = (0.5 if install else 0.0) + (0.5 if booted else 0.0)
    return s, {"install": install, "booted": booted}


def _score_functional(obj: Path) -> tuple[float, dict]:
    """Pass rate over e2e + bdd tests. Both must exist; missing files → 0."""
    e2e = _read_json(obj / "e2e.json") or {}
    bdd = _read_json(obj / "bdd.json") or {}
    # Playwright JSON: {stats: {expected, unexpected, ...}}; Cucumber: list of features → list of scenarios
    e2e_total = e2e.get("stats", {}).get("expected", 0) + e2e.get("stats", {}).get("unexpected", 0)
    e2e_pass  = e2e.get("stats", {}).get("expected", 0)
    bdd_total = bdd_pass = 0
    if isinstance(bdd, list):
        for feat in bdd:
            for el in feat.get("elements", []):
                if el.get("type") == "scenario":
                    bdd_total += 1
                    steps = el.get("steps", [])
                    if all(s.get("result", {}).get("status") == "passed" for s in steps):
                        bdd_pass += 1
    total = e2e_total + bdd_total
    if total == 0:
        return 0.0, {"reason": "no tests found"}
    return (e2e_pass + bdd_pass) / total, {
        "e2e_pass": e2e_pass, "e2e_total": e2e_total,
        "bdd_pass": bdd_pass, "bdd_total": bdd_total,
    }


def _score_mutation(obj: Path, cfg: dict) -> tuple[float, dict]:
    """Try in order: structured Stryker JSON → mutants walk → log scrape."""
    score_pct = None
    source = None
    detail: dict = {}

    rep = _read_json(obj / "mutation.json") or {}
    if not rep.get("missing"):
        score_pct = rep.get("mutationScore")
        if score_pct is not None:
            source = "json.mutationScore"
        else:
            killed = survived = 0
            for f in (rep.get("files") or {}).values():
                for m in f.get("mutants", []):
                    st = m.get("status")
                    if st == "Killed": killed += 1
                    elif st == "Survived": survived += 1
            if killed + survived > 0:
                score_pct = 100.0 * killed / (killed + survived)
                source = f"json.walk(killed={killed},survived={survived})"

    # Fallback: scrape Stryker's stdout log for "Final mutation score of XX.XX"
    if score_pct is None:
        log = obj / "mutation.log"
        if log.exists():
            import re as _re
            m = _re.search(r"Final mutation score of (\d+(?:\.\d+)?)", log.read_text(errors="replace"))
            if m:
                score_pct = float(m.group(1))
                source = "mutation.log scrape"
            else:
                # Detect Stryker errored before producing a score
                txt = log.read_text(errors="replace")
                if "ERROR Stryker" in txt or "failed tests in the initial test run" in txt:
                    detail["reason"] = "stryker errored before producing score"

    if score_pct is None:
        detail.setdefault("reason", "no mutation score available")
        return 0.0, detail

    floor = cfg["thresholds"]["mutation_score_floor"] * 100
    ceil  = cfg["thresholds"]["mutation_score_ceiling"] * 100
    s = max(0.0, min(1.0, (score_pct - floor) / (ceil - floor)))
    return s, {"mutation_score_pct": score_pct, "source": source, "floor": floor, "ceil": ceil}


def _score_security(obj: Path, cfg: dict) -> tuple[float, dict]:
    audit = _read_json(obj / "npm-audit.json") or {}
    counts = audit.get("metadata", {}).get("vulnerabilities", {})
    hi = counts.get("high", 0)
    crit = counts.get("critical", 0)
    if hi > cfg["thresholds"]["npm_audit_high_max"] or crit > cfg["thresholds"]["npm_audit_critical_max"]:
        return 0.0, {"high": hi, "critical": crit, "fail": True}
    return 1.0, {"high": hi, "critical": crit}


def _score_ui_ux_objective(obj: Path, cfg: dict) -> tuple[float, dict]:
    axe = _read_json(obj / "axe.json") or {}
    lh  = _read_json(obj / "lighthouse.json") or []
    serious = critical = 0
    if isinstance(axe, dict) and not axe.get("skipped"):
        # Playwright-axe report shape varies; assume {violations: [{impact, ...}]}
        for v in axe.get("violations", []) or []:
            if v.get("impact") == "serious": serious += 1
            elif v.get("impact") == "critical": critical += 1
    a11y_ok = serious == 0 and critical == 0
    perf_ok = True
    if isinstance(lh, list) and lh:
        perfs = [r.get("performance") or 0 for r in lh]
        perf_ok = (min(perfs) * 100) >= cfg["thresholds"]["lighthouse_perf_floor"]
    s = (0.5 if a11y_ok else 0.0) + (0.5 if perf_ok else 0.0)
    return s, {"axe_serious": serious, "axe_critical": critical, "lighthouse_min_perf": min([r.get("performance") or 0 for r in lh]) if lh else None}


def _score_api_design_objective(obj: Path) -> tuple[float, dict]:
    val = (obj / "openapi-validation.log").read_text() if (obj / "openapi-validation.log").exists() else ""
    valid = "valid" in val.lower() and "error" not in val.lower()
    probe = _read_json(obj / "api-probe.json") or []
    # Heuristic: count probes whose status is not 5xx and not 0
    if isinstance(probe, list) and probe:
        non5xx = sum(1 for p in probe if 200 <= int(p.get("status", 0)) < 500)
        probe_ok = non5xx / len(probe)
    else:
        probe_ok = 0.0
    s = (0.5 if valid else 0.0) + 0.5 * probe_ok
    return s, {"openapi_valid": valid, "probe_non5xx_rate": probe_ok}


def _score_architecture_objective(obj: Path, cfg: dict) -> tuple[float, dict]:
    madge = _read_json(obj / "madge.json") or {}
    cycles = madge.get("circular") or []
    cycle_ok = len(cycles) <= cfg["thresholds"]["cyclic_imports_max"]
    # File-size p95
    sizes_csv = obj / "file-sizes.csv"
    p95 = None
    size_ok = True
    if sizes_csv.exists():
        nums = []
        for line in sizes_csv.read_text().splitlines()[1:]:
            try: nums.append(int(line.rsplit(",", 1)[1]))
            except (ValueError, IndexError): pass
        if nums:
            nums.sort()
            p95 = nums[max(0, math.ceil(len(nums) * 0.95) - 1)]
            size_ok = p95 <= cfg["thresholds"]["file_size_p95_max_lines"]
    s = (0.5 if cycle_ok else 0.0) + (0.5 if size_ok else 0.0)
    return s, {"cycles": len(cycles), "file_size_p95": p95}


# ────────────────────────────────────────────────────────────────────────────
# judge aggregation
# ────────────────────────────────────────────────────────────────────────────


def _judge_score_for(run: Path, criterion: str) -> tuple[float | None, dict]:
    """Aggregate judge passes for one criterion.

    File layout: runs/<id>/judges/<judge_name>/<criterion>-pass<n>.json
    Returns median across passes, scaled to 0..1 (1→0.0, 5→1.0), with detail
    that includes per-pass scores and the within-judge stdev (variance proxy).
    """
    judges_dir = run / "judges"
    integers: list[int] = []
    by_pass: list[dict] = []
    judge_name: str | None = None

    if not judges_dir.exists():
        return None, {"reason": "no judges/ dir"}

    for jd in judges_dir.iterdir():
        if not jd.is_dir():
            continue
        judge_name = jd.name
        for f in sorted(jd.glob(f"{criterion}-pass*.json")):
            parsed = (_read_json(f) or {}).get("parsed") or {}
            sc = parsed.get("final_score") or parsed.get("score")
            if isinstance(sc, int) and 1 <= sc <= 5:
                integers.append(sc)
                by_pass.append({"file": f.name, "score": sc})
        # Backward-compat: support legacy files without -pass suffix
        legacy = jd / f"{criterion}.json"
        if legacy.exists():
            parsed = (_read_json(legacy) or {}).get("parsed") or {}
            sc = parsed.get("final_score") or parsed.get("score")
            if isinstance(sc, int) and 1 <= sc <= 5:
                integers.append(sc)
                by_pass.append({"file": legacy.name, "score": sc})

    if not integers:
        return None, {"judge": judge_name, "passes": by_pass, "reason": "no usable judge outputs"}

    median = statistics.median(integers)
    stdev = statistics.stdev(integers) if len(integers) > 1 else 0.0
    scaled = (median - 1) / 4.0
    return scaled, {
        "judge": judge_name,
        "passes": by_pass,
        "median": median,
        "within_judge_stdev": round(stdev, 3),
        "scaled": round(scaled, 4),
    }


# ────────────────────────────────────────────────────────────────────────────
# per-run aggregation
# ────────────────────────────────────────────────────────────────────────────


def aggregate_run(run: Path, cfg: dict) -> dict:
    obj = run / "objective"
    weights = cfg["weights"]
    hybrid = cfg["hybrid_split"]

    objective_scores: dict[str, tuple[float, dict]] = {
        "first_run_success":      _score_first_run(obj),
        "functional_correctness": _score_functional(obj),
        "mutation_score":         _score_mutation(obj, cfg),
        "security":               _score_security(obj, cfg),
        "ui_ux":                  _score_ui_ux_objective(obj, cfg),
        "api_design":             _score_api_design_objective(obj),
        "architecture":           _score_architecture_objective(obj, cfg),
    }

    judge_criteria = cfg["judge_criteria"]
    judge_scores: dict[str, tuple[float | None, dict]] = {
        c: _judge_score_for(run, c) for c in judge_criteria
    }

    final_per_criterion: dict[str, float] = {}
    for crit, w in weights.items():
        if crit in hybrid:
            o = objective_scores[crit][0]
            j = judge_scores.get(crit, (None, {}))[0]
            if j is None:
                final_per_criterion[crit] = o  # judge unavailable → fall back to objective half
            else:
                split = hybrid[crit]
                final_per_criterion[crit] = split["objective"] * o + split["judge"] * j
        elif crit == "gherkin":
            j = judge_scores.get("gherkin", (None, {}))[0]
            final_per_criterion[crit] = j if j is not None else 0.0
        else:
            final_per_criterion[crit] = objective_scores.get(crit, (0.0, {}))[0]

    final_0_100 = 100.0 * sum(final_per_criterion[c] * w for c, w in weights.items())

    return {
        "run": str(run),
        "final_score": round(final_0_100, 2),
        "per_criterion": {c: round(s, 4) for c, s in final_per_criterion.items()},
        "objective_detail": {c: {"score": round(s, 4), "detail": d} for c, (s, d) in objective_scores.items()},
        "judge_detail": {c: {"score": (None if s is None else round(s, 4)), "detail": d} for c, (s, d) in judge_scores.items()},
    }


# ────────────────────────────────────────────────────────────────────────────
# leaderboard / article aggregation
# ────────────────────────────────────────────────────────────────────────────


def aggregate_seeds(model: str, runs_root: Path) -> dict:
    seed_runs = sorted(runs_root.glob(f"{model}-seed*"))
    finals: list[float] = []
    per_seed: list[dict] = []
    for r in seed_runs:
        sf = r / "score.json"
        if sf.exists():
            payload = json.loads(sf.read_text())
            finals.append(payload["final_score"])
            per_seed.append(payload)
    if not finals:
        return {"model": model, "n": 0, "mean": None, "stdev": None, "seeds": []}
    return {
        "model": model,
        "n": len(finals),
        "mean": round(statistics.mean(finals), 2),
        "stdev": round(statistics.stdev(finals), 2) if len(finals) > 1 else 0.0,
        "min": min(finals), "max": max(finals),
        "seeds": per_seed,
    }


def article_data(runs_root: Path, cfg: dict) -> dict:
    """Aggregate everything into a structure ready for article tables."""
    by_model: dict[str, dict] = {}
    for r in runs_root.iterdir() if runs_root.exists() else []:
        if not r.is_dir() or "-seed" not in r.name: continue
        model = r.name.rsplit("-seed", 1)[0]
        by_model.setdefault(model, {})
    rows = [aggregate_seeds(m, runs_root) for m in sorted(by_model.keys())]
    rows.sort(key=lambda x: (x["mean"] or -1), reverse=True)
    return {"models": rows}


# ────────────────────────────────────────────────────────────────────────────
# fixture sanity check
# ────────────────────────────────────────────────────────────────────────────


def check_fixture(repo_root: Path) -> int:
    expected = [
        "fixture/START-HERE.md",
        "fixture/REQUIREMENTS.md",
        "fixture/TECH-CONSTRAINTS.md",
        "fixture/TASKS.md",
        "rubrics/judge-prompt-template.md",
        "rubrics/ui-ux.md",
        "rubrics/api-design.md",
        "rubrics/architecture.md",
        "rubrics/gherkin.md",
    ]
    bad = [p for p in expected if not (repo_root / p).exists()]
    if bad:
        for p in bad:
            print(f"MISSING: {p}", file=sys.stderr)
        return 2
    # AC IDs present?
    req = (repo_root / "fixture" / "REQUIREMENTS.md").read_text()
    import re
    acs = sorted(set(re.findall(r"AC-\d+\.\d+", req)))
    if len(acs) < 15:
        print(f"WARN: only {len(acs)} AC IDs found in REQUIREMENTS.md (expected ~25)", file=sys.stderr)
    print(f"check ok — {len(acs)} AC IDs in REQUIREMENTS.md")
    return 0


# ────────────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run")
    parser.add_argument("--config", required=True)
    parser.add_argument("--leaderboard", action="store_true")
    parser.add_argument("--article", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--model")
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())

    if args.check:
        return check_fixture(Path(args.repo_root).resolve())

    if args.leaderboard:
        if not args.model:
            print("--leaderboard requires --model", file=sys.stderr); return 2
        runs_root = Path(args.config).parent / "runs"
        out = aggregate_seeds(args.model, runs_root)
        print(json.dumps(out, indent=2))
        return 0

    if args.article:
        runs_root = Path(args.config).parent / "runs"
        out = article_data(runs_root, cfg)
        article_path = runs_root.parent / "article-data.json"
        article_path.write_text(json.dumps(out, indent=2))
        print(f"article data → {article_path}")
        print(json.dumps(out, indent=2))
        return 0

    if args.run:
        run = Path(args.run).resolve()
        out = aggregate_run(run, cfg)
        (run / "score.json").write_text(json.dumps(out, indent=2))
        print(json.dumps(out, indent=2))
        return 0

    print("nothing to do — pass --run, --leaderboard, --article, or --check", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
