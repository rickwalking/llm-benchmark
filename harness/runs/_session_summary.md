# Library Lending LLM Benchmark — Session Summary
_Generated 2026-04-27T10:20:06.929448_

Single-seed run. 5 generators, 1 spec, 1 judge (Claude Code Opus 4.7), 1 pass per criterion.

Kimi and GLM were re-run from scratch on `opencode-go/` namespace after the original
runs were namespace-spliced (started on `opencode/`, billing-cut, resumed on `opencode-go/`).
See `runs/_spliced_notes.md` for the contaminated-run findings preserved before deletion.

## Leaderboard

| Rank | Model | Final /100 | Mutation | Wall (s) | Files |
|------|-------|-----------:|---------:|---------:|------:|
| 1 | DeepSeek V4 Pro (opencode-go) | **85.66** | 88.43% | 2023 | 101 |
| 2 | GPT-5.5 (codex CLI) | **85.00** | 90.57% | 1850 | 88 |
| 3 | Claude Opus 4.7 (claude code) | **83.75** | 95.30% | 2082 | 82 |
| 4 | GLM 5.1 (opencode-go) | **67.50** | errored | 2523 | 72 |
| 5 | Kimi K2.5 (opencode-go) | **47.50** | errored | 1831 | 88 |

## Per-criterion (0.0 - 1.0 scaled)

| Model | first_run | functional | mutation | ui_ux | api | arch | gherkin | security |
|-------|----------:|-----------:|---------:|------:|----:|-----:|--------:|---------:|
| DeepSeek V4 Pro (opencode-go) | 1.00 | 1.00 | 0.96 | 0.75 | 0.75 | 0.75 | 0.50 | 1.00 |
| GPT-5.5 (codex CLI) | 1.00 | 1.00 | 1.00 | 0.50 | 0.75 | 0.75 | 0.75 | 1.00 |
| Claude Opus 4.7 (claude code) | 1.00 | 1.00 | 1.00 | 0.75 | 0.75 | 0.50 | 0.50 | 1.00 |
| GLM 5.1 (opencode-go) | 1.00 | 1.00 | 0.00 | 0.50 | 0.75 | 0.75 | 0.50 | 1.00 |
| Kimi K2.5 (opencode-go) | 1.00 | 0.00 | 0.00 | 0.50 | 0.75 | 0.75 | 0.50 | 1.00 |

## Notable observations

- **Top 3 within ~2 points** (DeepSeek 85.66, Codex 85.00, Claude 83.75). On a single-seed run with single-pass judging, this gap is within noise — top-tier models cluster very tightly on this fixture.
- **Codex and Claude saturated mutation_score (>90% caps at 1.0 scaled)**. DeepSeek's 88.43% is the only non-saturating leader signal. Lifting `mutation_score_ceiling` to 0.95 would re-spread.
- **Kimi and GLM both have broken Stryker setups** in their generated code. Kimi: no frontend tests means `npm run test:unit` exits 1, breaking Stryker's baseline. GLM: tests fail standalone (test bug). Mutation testing as a benchmark dimension correctly penalizes these toolchain failures.
- **Self-judging bias check passed**: Opus-judging-Opus did NOT inflate Claude's score (architecture 0.5, gherkin 0.5; placed 3rd). Single-vendor judge bias appears mild on this fixture.
- **Namespace contamination is real**: same model name across `opencode/` vs `opencode-go/` namespaces routes through different backends. Mid-run namespace switches produce splice candidates with score drift in either direction (GLM gained +23.75 by going clean; Kimi lost -17.25). Aggregator-routed benchmarks must pin namespace.

## Threats to validity

- **Single seed.** Real benchmarks need ≥3 seeds for confidence intervals.
- **Single judge pass.** No within-judge variance measured (we observed 0.13 swing on architecture score for the same code, run-to-run, on Kimi spliced reruns — single-pass judging is noisier than ideal).
- **Single-vendor judge.** Only Claude Code judges. No Cohen's κ across judges. Self-judging bias was checked but n=1.
- **Mutation ceiling capped at 90%.** Leaders saturate; raise to 0.95 to differentiate.
- **Cursor (Gemini 3.1 Pro) excluded** — Cursor's provider returned errors (likely plan-gating).
- **Bash background timeout** is nominally 10 min but in practice descendant processes survive the wrapper kill — verified empirically for 2.5+ hour generations. Document this for reproduction.

## Generators excluded

- `cursor-gemini` — Cursor provider error / plan-gated. 0 candidate files, run never produced output.

## Next steps for the article

1. Re-run with **3 seeds per generator** for confidence intervals.
2. Set **`judge_passes_per_criterion: 3`** to measure within-judge variance.
3. Add a **second judge** (e.g., Codex CLI in a judge-persona prompt) for Cohen's κ across vendors.
4. Raise **`mutation_score_ceiling: 0.95`** in `config.yaml` to spread the leaders.
5. **Pin tool versions** in the Dockerfile (Stryker, Playwright, Lighthouse, Chromium) for reproducibility.
6. **Spot-check 10% of judge JSONs** against human review (RULERS methodology) — surface judge unreliability.
7. **Pin namespace explicitly** in config.yaml comments — `opencode/` vs `opencode-go/` are not equivalent.
