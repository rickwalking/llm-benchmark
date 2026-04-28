#!/usr/bin/env python3
"""Compute pairwise Cohen's κ across vendor judges for the library benchmark.

Loads runs/_kappa/<vendor>/<gen>-<criterion>.json files, computes κ for every
pair of vendors per criterion + aggregated. Writes runs/_kappa/_results.md.
"""
from __future__ import annotations
import json
from pathlib import Path
from itertools import combinations
from datetime import datetime

ROOT = Path("/home/pmarins/projects/llm-benchmark-library")
KAPPA = ROOT / "harness" / "runs" / "_kappa"

GENS = ["opencode-deepseek", "codex-gpt55", "claude-opus47",
        "opencode-glm", "opencode-kimi"]
CRITERIA = ["ui_ux", "api_design", "architecture", "gherkin"]


def cohen_kappa(a: list[int], b: list[int]) -> float:
    if len(a) != len(b) or not a:
        return float("nan")
    n = len(a)
    agree = sum(1 for x, y in zip(a, b) if x == y)
    p_o = agree / n
    cats = sorted(set(a) | set(b))
    p_e = 0.0
    for c in cats:
        p_a = sum(1 for x in a if x == c) / n
        p_b = sum(1 for x in b if x == c) / n
        p_e += p_a * p_b
    if p_e == 1.0:
        return 1.0 if p_o == 1.0 else 0.0
    return (p_o - p_e) / (1 - p_e)


def kappa_label(k: float) -> str:
    if k != k: return "n/a"
    if k < 0: return "worse than chance"
    if k < 0.20: return "slight"
    if k < 0.40: return "fair"
    if k < 0.60: return "moderate"
    if k < 0.80: return "substantial"
    return "almost perfect"


def get_score(parsed: dict) -> int | None:
    if not parsed:
        return None
    sc = parsed.get("final_score") or parsed.get("score")
    if isinstance(sc, int) and 1 <= sc <= 5:
        return sc
    return None


def load_vendor(vendor: str) -> dict | None:
    """Returns {gen: {criterion: score}} or None if data missing."""
    vdir = KAPPA / vendor
    if not vdir.exists():
        return None
    out = {}
    for gen in GENS:
        out[gen] = {}
        for crit in CRITERIA:
            f = vdir / f"{gen}-{crit}.json"
            if not f.exists():
                return None
            d = json.loads(f.read_text())
            out[gen][crit] = get_score(d.get("parsed"))
    return out


def main():
    vendors = sorted([d.name for d in KAPPA.iterdir() if d.is_dir()])
    data = {v: load_vendor(v) for v in vendors}
    incomplete = [v for v, d in data.items() if d is None]
    complete = [v for v, d in data.items() if d is not None]

    if len(complete) < 2:
        print(f"Not enough complete vendors. Have: {complete}")
        return

    pairs = list(combinations(complete, 2))
    per_pair = {}
    for a, b in pairs:
        per_crit = {}
        for c in CRITERIA:
            sa = [data[a][g][c] for g in GENS]
            sb = [data[b][g][c] for g in GENS]
            sa = [x if isinstance(x, int) else 0 for x in sa]
            sb = [x if isinstance(x, int) else 0 for x in sb]
            per_crit[c] = cohen_kappa(sa, sb)
        # overall = κ on flattened (gen, criterion)
        all_a, all_b = [], []
        for g in GENS:
            for c in CRITERIA:
                all_a.append(data[a][g][c] if isinstance(data[a][g][c], int) else 0)
                all_b.append(data[b][g][c] if isinstance(data[b][g][c], int) else 0)
        per_crit["_overall"] = cohen_kappa(all_a, all_b)
        per_pair[f"{a}↔{b}"] = per_crit

    avg_per_candidate_per_vendor = {}
    for v in complete:
        avg_per_candidate_per_vendor[v] = {}
        for gen in GENS:
            vals = [data[v][gen][c] for c in CRITERIA]
            vals = [x for x in vals if isinstance(x, int)]
            avg_per_candidate_per_vendor[v][gen] = round(sum(vals)/len(vals), 2) if vals else None

    consensus_per_candidate = {}
    for gen in GENS:
        all_scores = []
        for v in complete:
            for c in CRITERIA:
                s = data[v][gen][c]
                if isinstance(s, int):
                    all_scores.append(s)
        consensus_per_candidate[gen] = round(sum(all_scores)/len(all_scores), 2) if all_scores else None

    out = []
    out.append("# Cohen's κ across vendor judges — Library-Lending Benchmark")
    out.append(f"_Compiled {datetime.now().strftime('%Y-%m-%d')}._\n")

    out.append("## Three vendor judges\n")
    out.append("Each judge received identical inputs (rubric + path to per-criterion evidence "
               "bundle). No Playwright MCP, no live app browsing — same information level for "
               "all three vendors.\n")
    for v in complete:
        out.append(f"- `{v}` ✓")
    if incomplete:
        for v in incomplete:
            out.append(f"- `{v}` — incomplete or unparseable")

    out.append("\n## Per-vendor average judge score per candidate\n")
    out.append("(Mean of 4 criterion scores per candidate, per vendor judge.)\n")
    out.append("| Candidate | " + " | ".join(complete) + " | **Consensus** |")
    out.append("|---|" + "|".join(["---:"]*len(complete)) + "|---:|")
    for gen in GENS:
        row = [gen]
        for v in complete:
            val = avg_per_candidate_per_vendor[v][gen]
            row.append(f"{val:.2f}" if val is not None else "—")
        cv = consensus_per_candidate[gen]
        row.append(f"**{cv:.2f}**" if cv is not None else "—")
        out.append("| " + " | ".join(row) + " |")

    out.append("\n## Pairwise Cohen's κ\n")
    out.append("Landis & Koch interpretation: <0 worse than chance · 0–0.2 slight · 0.2–0.4 "
               "fair · 0.4–0.6 moderate · 0.6–0.8 substantial · 0.8–1.0 almost perfect.\n")
    out.append("| Judge pair | overall | " + " | ".join(c[:11] for c in CRITERIA) + " |")
    out.append("|---|---:|" + "|".join(["---:"]*len(CRITERIA)) + "|")
    for pair_name, vals in per_pair.items():
        row = [pair_name, f"**{vals['_overall']:.2f}** ({kappa_label(vals['_overall'])})"]
        for c in CRITERIA:
            row.append(f"{vals[c]:.2f}")
        out.append("| " + " | ".join(row) + " |")

    overalls = [v["_overall"] for v in per_pair.values()]
    avg_overall = sum(overalls) / len(overalls) if overalls else float("nan")
    out.append(f"\n**Average pairwise κ (overall)**: {avg_overall:.2f} ({kappa_label(avg_overall)})\n")

    out.append("Per-criterion average pairwise κ:\n")
    for c in CRITERIA:
        ks = [v[c] for v in per_pair.values() if v[c] == v[c]]
        if ks:
            avg_c = sum(ks) / len(ks)
            out.append(f"- **{c}**: avg κ {avg_c:.2f} ({kappa_label(avg_c)})")

    out_path = KAPPA / "_results.md"
    out_path.write_text("\n".join(out))

    raw = {
        "complete_vendors": complete,
        "incomplete_vendors": incomplete,
        "per_pair_kappa": per_pair,
        "avg_per_candidate_per_vendor": avg_per_candidate_per_vendor,
        "consensus_per_candidate": consensus_per_candidate,
        "data": data,
    }
    (KAPPA / "_results.json").write_text(json.dumps(raw, indent=2, default=str))

    print(f"wrote {out_path}")
    print(f"avg overall κ = {avg_overall:.2f} ({kappa_label(avg_overall)})")


if __name__ == "__main__":
    main()
