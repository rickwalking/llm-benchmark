# Cohen's κ across vendor judges — Library-Lending Benchmark
_Compiled 2026-04-28._

## Three vendor judges

Each judge received identical inputs (rubric + path to per-criterion evidence bundle). No Playwright MCP, no live app browsing — same information level for all three vendors.

- `claude-opus47` ✓
- `codex-gpt55` ✓
- `opencode-deepseek` ✓

## Per-vendor average judge score per candidate

(Mean of 4 criterion scores per candidate, per vendor judge.)

| Candidate | claude-opus47 | codex-gpt55 | opencode-deepseek | **Consensus** |
|---|---:|---:|---:|---:|
| opencode-deepseek | 2.75 | 2.00 | 2.50 | **2.42** |
| codex-gpt55 | 3.00 | 2.50 | 2.33 | **2.64** |
| claude-opus47 | 2.75 | 2.25 | 2.50 | **2.50** |
| opencode-glm | 2.50 | 2.25 | 2.25 | **2.33** |
| opencode-kimi | 2.75 | 2.25 | 2.50 | **2.50** |

## Pairwise Cohen's κ

Landis & Koch interpretation: <0 worse than chance · 0–0.2 slight · 0.2–0.4 fair · 0.4–0.6 moderate · 0.6–0.8 substantial · 0.8–1.0 almost perfect.

| Judge pair | overall | ui_ux | api_design | architectur | gherkin |
|---|---:|---:|---:|---:|---:|
| claude-opus47↔codex-gpt55 | **0.22** (fair) | 0.00 | 0.00 | 0.00 | 1.00 |
| claude-opus47↔opencode-deepseek | **0.40** (fair) | 0.00 | 0.00 | 0.00 | 1.00 |
| codex-gpt55↔opencode-deepseek | **0.64** (substantial) | 1.00 | 0.29 | -0.15 | 1.00 |

**Average pairwise κ (overall)**: 0.42 (moderate)

Per-criterion average pairwise κ:

- **ui_ux**: avg κ 0.33 (fair)
- **api_design**: avg κ 0.10 (slight)
- **architecture**: avg κ -0.05 (worse than chance)
- **gherkin**: avg κ 1.00 (almost perfect)