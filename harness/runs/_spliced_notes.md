# Spliced (Namespace-Contaminated) Run Notes
_Captured before deletion of spliced dirs, 2026-04-27T10:19:06.106500_

## Background

Two of the original five candidates (Kimi K2.5 and GLM 5.1) had their generation runs
**split across two different inference backends**: started on `opencode/` namespace
(billing-cut at ~8 minutes), then resumed on `opencode-go/` namespace via `opencode run`.
Same display name in opencode's model picker — but the two namespaces appear to route through
**different backends** (different builds, fine-tunes, or providers).

This produced **Frankenstein candidates**: the partial work + final code is a splice
of two distinct model versions trying to extend each other's output. We captured these
notes before deleting the spliced runs in favour of the fresh same-backend reruns.

## Spliced scores (original)

| Model | First-attempt | After fix prompt | Notes |
|---|---:|---:|---|
| opencode-kimi | 64.75 | 63.5 | Wrote 82 unit tests; never made the trivial 1-line stryker config path fix it was specifically asked to make |
| opencode-glm | 43.75 | 42.5 | Diagnosed vitest version conflict correctly but couldn't resolve it. Tests had a copy-paste error in expected message. |

## Per-criterion (after-fix-attempt, last spliced state)

| Model | first_run | functional | mutation | ui_ux | api | arch | gherkin | security |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| opencode-kimi | 1.00 | 1.00 | 0.00 | 0.75 | 0.35 | 0.62 | 0.25 | 1.00 |
| opencode-glm | 1.00 | 0.00 | 0.00 | 0.50 | 0.75 | 0.75 | 0.00 | 1.00 |

## Key observations from the spliced runs

- **Both declared `BENCHMARK COMPLETE` while their toolchain was visibly broken** (Stryker failing). The second model in the splice didn't always know what state the first model left things in.
- **Kimi failed a focused fix prompt**: when explicitly told the exact 1-line bug to fix in `package.json`, it instead went off rewriting unit tests and never touched the script path. Fix prompt did nothing useful; final score went DOWN by 1.05 (functional regressed).
- **GLM diagnosed correctly**: in its log it identified the vitest version mismatch precisely, but couldn't resolve it programmatically. Score went DOWN by 1.25 (architecture judge dropped on no code change → judge variance evidence).

- **Manual surgery after fix prompts**: as a methodology probe we patched the trivial bugs ourselves (Kimi's path, GLM's test-typo). Kimi remained broken (no frontend tests → vitest exits 1 → Stryker can't run). GLM was patched fix-only-test-bugs, didn't help materially.

## Why we chose to delete and rerun

Splice contamination invalidates the comparison: the candidate is jointly authored by two backends.
DeepSeek's resume was within the same `opencode-go/` namespace and so didn't suffer this issue.
Kimi and GLM were rerun fresh on `opencode-go/` from start to BENCHMARK COMPLETE for fair comparison.
The fresh numbers diverge significantly from the spliced ones in both directions — see the main session summary.

## Why we kept these notes

The 'mid-run backend swap' is itself an interesting failure mode worth documenting.
Anyone running multi-model benchmarks on aggregator providers (LMArena, opencode.ai, openrouter)
should know that **same model name across namespaces ≠ same backend**.
