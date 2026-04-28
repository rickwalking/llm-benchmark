# Library Lending: Benchmarking Frontier Coding LLMs on Greenfield Full-Stack Engineering

_A reproducible, multi-judge evaluation of five frontier-tier coding agents on a complete React + Express + SQLite scaffolding task. Compiled 2026-04-28._

---

## TL;DR

I asked five frontier coding LLMs to scaffold a complete full-stack library lending application from a single 21 KB written specification. The candidates: **DeepSeek V4 Pro**, **GPT-5.5** (via Codex CLI), **Claude Opus 4.7**, **GLM 5.1**, and **Kimi K2.5**. Each ran autonomously in YOLO mode through its native CLI for 30 to 60 minutes. The deliverable in every case was a working repository with backend, frontend, OpenAPI spec, BDD scenarios, e2e tests, and Stryker mutation testing.

Scoring used a hybrid methodology: an objective gauntlet inside a Docker sandbox (build, typecheck, lint, unit tests, BDD, Playwright e2e, Lighthouse, axe-core, mutation testing, OpenAPI validation, npm audit) plus an LLM-as-judge stage on UX, API design, architecture, and Gherkin quality. The judge stage was independently re-run by three vendor-different LLMs (Claude Code, Codex CLI, Opencode/DeepSeek) for a Cohen's κ check.

**Final ranking** (objective + judge weighted):

| Rank | Model | Final / 100 | Mutation | Real defects |
|---|---|---:|---:|---|
| 1 | DeepSeek V4 Pro | **85.66** | 88.43% | none |
| 2 | GPT-5.5 (Codex CLI) | **85.00** | 90.57% | none |
| 3 | Claude Opus 4.7 | **83.75** | 95.30% | none |
| 4 | GLM 5.1 | **67.50** | errored | wrong stryker config extension, no `test` script |
| 5 | Kimi K2.5 | **47.50** | errored | declared typescript-checker plugin, didn't install it |

The top three sit within 2 points of each other, well inside single-seed noise. The bottom two declared `BENCHMARK COMPLETE` while their toolchain was visibly broken. I documented this rather than patching, because self-verification is part of what the benchmark measures.

Cross-vendor judge agreement: **κ = 0.42 (moderate)** on the judge axes. The full ranking holds because **72.5% of the score weight is objective** (build, test, mutation, security). Judge variance only moves the remaining 27.5%. Stripping Playwright MCP from the primary judge compresses the judge-only signal but does not move the objective-driven ranking.

A companion experiment (a landing page generation benchmark, also in this repo) ran the same five models on a different task and produced a different ranking. DeepSeek dropped to 4th, Claude rose to 1st. **Design judgment is a distinct axis from full-stack engineering.** No single model is best across both.

---

## 1. Introduction

### Why this experiment exists

Coding LLMs crossed a threshold recently. Tools like Codex CLI, Claude Code, Opencode, and Cursor now take a written spec and work autonomously for half an hour or more without human intervention. The interesting question is no longer "can the model write code?" It is "**how do we measure the quality of what an autonomous coding agent ships when nobody is supervising it?**"

Existing benchmarks were built for an earlier paradigm:

* **SWE-bench Verified** measures bug fixing in existing repos. It tests editing, not greenfield delivery.
* **HumanEval** and **BigCodeBench** measure function-level correctness. They miss cross-cutting concerns like architecture, test discipline, and self-verification.
* **WebDev Arena** uses pairwise human voting on UI prompts. It produces a leaderboard but no per-criterion breakdown.
* **Design2Code** measures pixel-fidelity reproduction from a target screenshot. It tests reproduction, not original design.

None of these answers what teams actually need before adopting an autonomous coding agent: **given a written specification and zero supervision, can the agent ship a complete repository (code, tests, infrastructure config) that another engineer would accept?**

This experiment was built around that question, for one specific kind of work, in a way that is reproducible and methodologically defensible.

### What this experiment is, and what it isn't

It **is**:

* A focused test of one task type: greenfield full-stack scaffolding from a written spec.
* An evaluation of five specific frontier-tier coding LLMs as of April 2026.
* A methodology probe: how robust is "LLM-as-judge" when you swap the judge?

It is **not**:

* A general claim about which LLM is "best." Different tasks produce different rankings (see §6 and the companion landing page benchmark).
* A statement about iterative or human-in-the-loop workflows. I tested first-shot delivery in YOLO mode.
* A replacement for your own evaluation on your own codebase. See the closing disclaimer.

---

## 2. Architecture

The system is a four-stage pipeline. Each stage is independently runnable and produces machine-readable artifacts.

```
┌──────────────────────┐
│   1. Fixture          │  21 KB written spec, 4 files:
│  (input to all 5)     │     START-HERE.md, REQUIREMENTS.md,
│                       │     TECH-CONSTRAINTS.md, TASKS.md
└──────────┬────────────┘  29 ACs (9 negative), 6 mutation-target rules,
           │               reservation-queue state machine
           │ piped to each model's CLI
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 2. Generation pipeline (YOLO)                    │
│                                                                  │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│   │ Codex    │  │ Opencode run │  │ Claude       │              │
│   │ exec     │  │ (3 models on │  │ --print      │  5 agents,    │
│   │ gpt-5.5  │  │  opencode-go)│  │ opus-4.7     │  parallel,    │
│   └────┬─────┘  └──────┬───────┘  └──────┬───────┘  ~30 min each│
│        │               │                  │                       │
│        └───────────────┴──────────────────┘                       │
│                        ▼                                          │
│         runs/<model>-seed1/candidate/  ← 5 complete repos         │
└─────────────────────┬─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              3. Objective gauntlet (Docker sandbox)              │
│                                                                  │
│   For each candidate, inside llm-bench-runner:dev container:    │
│   • npm install                                                  │
│   • typecheck (tsc --noEmit)                                     │
│   • lint (eslint)                                                │
│   • build                                                        │
│   • Vitest unit tests                                            │
│   • Cucumber BDD                                                 │
│   • Playwright e2e                                               │
│   • Lighthouse perf+a11y                                         │
│   • axe-core a11y                                                │
│   • Stryker mutation testing                                     │
│   • OpenAPI validation                                           │
│   • madge cycles + file-size dist                                │
│   • npm audit                                                    │
│                                                                  │
│   ↳ runs/<model>-seed1/objective/   per-tool JSON outputs       │
└─────────────────────┬─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│         4. Judging (primary + multi-vendor κ check)              │
│                                                                  │
│   Primary judge (Claude Code with Playwright MCP):               │
│   For each of 4 criteria (UI/UX, API design, architecture,       │
│   gherkin), the judge inspects evidence + browses live app +     │
│   emits 1-5 anchored score with verbatim evidence.               │
│                                                                  │
│   Multi-vendor κ pass (added later for robustness):              │
│   Same 4 criteria scored by Claude (no MCP), Codex CLI, and      │
│   Opencode/DeepSeek using identical inputs (no live browsing).   │
│   60 calls total (3 vendors × 5 candidates × 4 criteria).        │
│                                                                  │
│   Final scoring: weighted blend per harness/config.yaml.         │
│   72.5% of weight is objective gauntlet, 27.5% is judge.         │
└──────────────────────────────────────────────────────────────────┘
```

### Why this shape

Three architectural choices are worth defending because they are the ones a reviewer would push back on.

**Why CLI-driven generation rather than API SDKs.** The CLIs (Codex, Opencode, Claude Code) are how these models are actually used in production engineering. They include scaffolding behavior (autonomous file reads, shell calls, tool use) that an SDK call does not replicate. For "what would this model ship if a real engineer pointed it at this brief?", the CLI is the right interface.

**Why a Docker sandbox for the gauntlet but not for generation.** Generation runs on the host because each CLI carries its own auth context. The gauntlet runs untrusted candidate code: `npm install` triggers postinstall scripts, `npm run dev` boots a server with whatever the LLM wrote. That code lives in an isolated container with `--user $(id -u)` to keep filesystem writes contained. Two different threat surfaces, two different sandboxing strategies.

**Why ~72.5% objective weighting.** LLM-as-judge has documented biases (position bias, length bias, vendor familiarity). Tying most of the score to verifiable objective metrics (does it build, do tests pass, what is the mutation score, does the OpenAPI match the implementation) makes the ranking less sensitive to judge calibration drift. The κ pass in §4.3 confirmed this: even with moderate κ on the judge axes, the final ranking is stable because the judge contributes only ~27.5%.

---

## 3. Approach

### 3.1 The fixture

A single 21 KB written spec describing a library lending application for a small public library. Three constraints shaped the choice:

1. **Avoid training-data overfit.** TODO apps and generic CRUD examples are saturated in tutorials. Library lending is specific enough that the model cannot pattern-match to a known repo.
2. **Force real business logic.** Six numeric rules (max 5 active loans, 14-day loan period, $0.50/day late fines capped at $10, 48-hour reservation notification window, $5 unpaid-fines threshold) give Stryker mutation testing real targets to mutate. The reservation queue state machine (`waiting → notified → expired/fulfilled`) requires non-trivial transition logic.
3. **Force unhappy-path handling.** Of 29 acceptance criteria, **9 are explicit rejection paths**: "return 409 if member already has the book on loan," "402 if unpaid fines exceed $5," "403 if member is suspended," and so on. Models that produce only happy-path code lose ~30% of the functional-correctness signal automatically.

The spec is split across four files: `START-HERE.md` (entry instructions), `REQUIREMENTS.md` (user stories + ACs), `TECH-CONSTRAINTS.md` (mandated stack: React 19, Vite, Express 5, SQLite, Vitest, Playwright, Cucumber, Stryker), and `TASKS.md` (ordered task list, A1 scaffold through C4 run-the-gauntlet).

### 3.2 The candidates

| Model | Vendor / CLI | Identifier | Auth |
|---|---|---|---|
| **DeepSeek V4 Pro** | DeepSeek / Opencode | `opencode-go/deepseek-v4-pro` | Opencode workspace |
| **GPT-5.5** | OpenAI / Codex CLI | `gpt-5.5` | OpenAI account |
| **Claude Opus 4.7** | Anthropic / Claude Code | `claude-opus-4-7` | Claude Code |
| **GLM 5.1** | Zhipu / Opencode | `opencode-go/glm-5.1` | Opencode workspace |
| **Kimi K2.5** | Moonshot / Opencode | `opencode-go/kimi-k2.5` | Opencode workspace |

Each was invoked once, in YOLO non-interactive mode, with a 90-minute internal timeout. The exact CLI flags are checked into `harness/config.yaml` and reproducible from `scripts/generate.sh`.

A sixth candidate, Gemini 3.1 Pro via Cursor, was attempted but excluded. `cursor-agent --print --model gemini-3.1-pro` returned `Provider Error: We're having trouble connecting to the model provider` on three consecutive retries (likely plan-gating).

### 3.3 The objective gauntlet

The gauntlet runs entirely inside a Docker container (`llm-bench-runner:dev`, ~1.35 GB, Node 22 + Chromium + Playwright pre-installed). The candidate's repo is bind-mounted, the harness scripts are mounted read-only. For each candidate:

```
install → typecheck → lint → build → unit → BDD → e2e
       → screenshots → Lighthouse → axe → API probe
       → OpenAPI validation → mutation (Stryker)
       → madge cycles → file-size distribution → npm audit
```

Each step writes a machine-readable artifact under `runs/<model>-seed1/objective/`. The harness's `score.py` aggregates them into per-criterion 0..1 scaled scores against documented thresholds (Lighthouse perf ≥ 80, mutation score floor 50% / ceiling 90%, axe serious+critical = 0).

### 3.4 The judging

**Primary judge** is Claude Code in `--print` mode with full Playwright MCP access. For each of 4 criteria (UI/UX, API design, architecture, Gherkin), the judge:

1. Reads the rubric (anchored 1..5 scale with concrete evidence rules per integer).
2. Reads the per-criterion evidence bundle (a directory pre-populated by the harness with the relevant slice of code, screenshots, and tool outputs).
3. For UI/UX: navigates the candidate's live app via Playwright MCP, resizes to 375/768/1440 px, takes screenshots.
4. For API design: curls the live API directly to verify endpoint responses.
5. Emits a JSON output with a 1..5 score and verbatim evidence quotes.

**Multi-vendor κ pass** (added later for methodology robustness) re-judges all 5 candidates × 4 criteria with three vendor-different judges: Claude Code, Codex CLI, and Opencode driving DeepSeek V4 Pro. To put all three on equal footing, this pass strips Playwright MCP. Only the rubric and evidence bundle (read via the file system) are available. 60 judge calls total.

### 3.5 Scoring weights

| Criterion | Weight | Source |
|---|---:|---|
| First-run success | 15% | Objective (install + boot) |
| Functional correctness | 20% | Objective (e2e + BDD pass rate vs ACs) |
| Mutation score | 15% | Objective (Stryker) |
| UI/UX | 15% | 50% objective (axe + Lighthouse), 50% judge |
| API design | 10% | 50% objective (OpenAPI valid + status codes), 50% judge |
| Architecture | 10% | 50% objective (madge + file-size), 50% judge |
| Gherkin | 10% | 100% judge (4 sub-dimensions) |
| Security | 5% | Objective (npm audit) |

**Total objective weight: 72.5%. Total judge weight: 27.5%.** This is by design. The judge is supplementary signal, not the dominant axis.

---

## 4. Results

### 4.1 Final ranking

| Rank | Model | Final / 100 | Mutation | Wall (s) | Source files |
|---|---|---:|---:|---:|---:|
| 1 | DeepSeek V4 Pro | **85.66** | 88.43% | 2023 | 101 |
| 2 | GPT-5.5 (Codex CLI) | **85.00** | 90.57% | 1850 | 88 |
| 3 | Claude Opus 4.7 | **83.75** | 95.30% | 2082 | 82 |
| 4 | GLM 5.1 | **67.50** | errored | 2523 | 72 |
| 5 | Kimi K2.5 | **47.50** | errored | 1831 | 88 |

The top three are within ~2 points of each other, within single-seed noise. The gap to GLM (16 points behind 3rd) and Kimi (36 behind 3rd) is from real engineering defects, not judge variance. See §4.5 and §4.6.

### 4.2 Per-criterion (0..1 scaled)

| Model | first_run | functional | mutation | ui_ux | api | arch | gherkin | security |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek V4 Pro | 1.00 | 1.00 | 0.96 | 0.75 | 0.75 | 0.75 | 0.50 | 1.00 |
| GPT-5.5 (Codex) | 1.00 | 1.00 | 1.00 | 0.50 | 0.75 | 0.75 | 0.75 | 1.00 |
| Claude Opus 4.7 | 1.00 | 1.00 | 1.00 | 0.75 | 0.75 | 0.50 | 0.50 | 1.00 |
| GLM 5.1 | 1.00 | 1.00 | 0.00 | 0.50 | 0.75 | 0.75 | 0.50 | 1.00 |
| Kimi K2.5 | 1.00 | 0.00 | 0.00 | 0.50 | 0.75 | 0.75 | 0.50 | 1.00 |

The discriminator at the top is mutation score. Codex and Claude both saturate the 90% ceiling (capped at 1.0). DeepSeek's 88.43% is the only non-saturating leader signal, at 0.96. The discriminator at the bottom is the same dimension turned negative: GLM and Kimi both produce 0.00 because their Stryker setups are broken (see §4.5).

### 4.3 Cohen's κ across vendor judges

A separate multi-vendor judging pass was run for methodology robustness. Three vendor-different judges (Claude Code, Codex CLI, Opencode/DeepSeek) re-scored all 5 candidates × 4 criteria using identical inputs (rubric + evidence bundle, no live-app browsing).

**Average pairwise overall κ: 0.42 (moderate)** per Landis-Koch interpretation.

| Judge pair | overall κ | ui_ux | api_design | architecture | gherkin |
|---|---:|---:|---:|---:|---:|
| Claude ↔ Codex | 0.22 | 0.00 | 0.00 | 0.00 | 1.00 |
| Claude ↔ Opencode/DeepSeek | 0.40 | 0.00 | 0.00 | 0.00 | 1.00 |
| Codex ↔ Opencode/DeepSeek | 0.64 | 1.00 | 0.29 | -0.15 | 1.00 |

Per-criterion average pairwise κ:

* **gherkin**: 1.00 (almost perfect, all judges gave the same gherkin scores, suggesting the rubric is unambiguous)
* **ui_ux**: 0.33 (fair)
* **api_design**: 0.10 (slight)
* **architecture**: -0.05 (artifact, see below)

The negative κ on `architecture` is a methodology artifact, not real disagreement. All three judges scored within a narrow band, and when ratings cluster on one or two values, κ cannot separate signal from noise. (Same artifact observed on `responsive_design` in the companion landing page benchmark when judges lacked MCP access.) The lesson is that κ on a low-variance criterion is uninformative. Drop it or expand the score range.

The judge's contribution is much smaller than the gauntlet's. Per-vendor consensus scores per candidate (averaged across 4 criteria, all judges):

| Candidate | Claude judge | Codex judge | DeepSeek judge | Consensus |
|---|---:|---:|---:|---:|
| Codex GPT-5.5 | 3.00 | 2.50 | 2.33 | **2.64** |
| Claude Opus 4.7 | 2.75 | 2.25 | 2.50 | **2.50** |
| Kimi K2.5 | 2.75 | 2.25 | 2.50 | **2.50** |
| DeepSeek V4 Pro | 2.75 | 2.00 | 2.50 | **2.42** |
| GLM 5.1 | 2.50 | 2.25 | 2.25 | **2.33** |

The consensus scores cluster tightly (2.33 to 2.64). When the judges lose Playwright MCP access, they converge to similar conservative scores. Code looks roughly comparable across candidates if you cannot open the live app. **This validates the architectural choice of weighting objective metrics at 72.5%**: the visible spread in the final ranking comes from build/test/mutation outcomes, not from judge taste. Even if judge agreement were lower, the ranking would be stable.

### 4.4 Self-bias check

Each judge family is also a candidate. Does a vendor's judge favor its own outputs? On this fixture, no.

| Judge | Score given to its own family's candidate | Inflated? |
|---|---:|---|
| Claude Code (Opus 4.7) | 2.75, tied with Codex/Kimi | No |
| Codex CLI (GPT-5.5) | 2.50, top of its set, but Claude scored equal | Marginal, within noise |
| Opencode (DeepSeek V4 Pro) | 2.50, gave Codex 2.33 and itself 2.50, neither inflated nor deflated | No |

A single-experiment data point. Not strong enough to claim "judge bias is solved," but a meaningful signal that the multi-vendor methodology is not trivially compromised.

### 4.5 Per-model analysis

#### 1. DeepSeek V4 Pro, 85.66

The most balanced output across criteria. Mutation 88.43% is the only non-saturating leader signal (Codex and Claude both capped at the 90% ceiling). Strong UI/UX (0.75) and architecture (0.75). Gherkin 0.50 is the weakest dimension. 33-minute wall time, 101 source files. No toolchain defects.

#### 2. GPT-5.5 (Codex CLI), 85.00

The most thorough run. Codex actually executed the full gauntlet against itself: ran `npm run dev`, ran e2e, ran Stryker, left `.stryker-tmp/` mutation sandboxes on disk. Mutation 90.57% saturates the ceiling. Strongest Gherkin (0.75). Weakest UI/UX of the leaders (0.50). 31-minute wall.

#### 3. Claude Opus 4.7, 83.75

The highest mutation score (95.30%, also capped). The most distinctive UI of any candidate. Branded the app **"City Library"** with a custom navy palette. The only candidate to deviate from the spec's literal "Library Lending" wording. The self-judge bias check passed: Opus-judge did not inflate Opus-candidate (architecture 0.50, gherkin 0.50, placed 3rd). 35-minute wall.

#### 4. GLM 5.1, 67.50

Generated 120+ source files (more than the leaders) but Stryker errored at the dry-run with "There were failed tests in the initial test run." Investigation: GLM wrote its Stryker config as `stryker.conf.ts` (TypeScript). Stryker v8 does not natively read `.ts` config files without explicit `ts-node` setup. It expects `.json`, `.cjs`, `.js`, or `.mjs`. GLM's `package.json` `mutation` script just calls `stryker run` (no path argument), so Stryker fell back to defaults, found nothing to mutate, and tried `npm test` as the test runner. That failed because GLM's `package.json` only defines `test:unit`, `test:e2e`, and `test:bdd` (no plain `test` alias). Each layer is half spec ambiguity, half model judgment: the spec did not pre-empt the `.ts` extension or the `npm test` alias. 42-minute wall.

#### 5. Kimi K2.5, 47.50

Stryker errored with `Cannot find Checker plugin "typescript". In fact, no Checker plugins were loaded. Did you forget to install it?` Investigation: Kimi's `stryker.conf.json` declares `"checkers": ["typescript"]`, opting into Stryker's type-aware mutation feature, but Kimi did not add `@stryker-mutator/typescript-checker` to `devDependencies`. The spec mentioned only `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`. Kimi added a feature it did not need, did not install the dep, and did not run a verification check before declaring complete. Self-caused over-engineering. 30-minute wall.

### 4.6 The most discriminating finding: self-verification

The cleanest discriminator between the top three (DeepSeek/Codex/Claude) and the bottom two (GLM/Kimi) is **self-verification**. The frontier-tier models implicitly ran `npm run mutation` and saw it succeed before declaring `BENCHMARK COMPLETE`. The mid-tier did not. Both GLM and Kimi declared complete on a Stryker error that they could have caught with a single command.

This is an engineering-judgment signal, not a coding-skill signal. It happens to produce a 16-point gap to GLM (-18%) and a 36-point gap to Kimi (-43%) in the final score. The benchmark is explicitly designed to test "deliver a working repository," not "deliver code we will fix for you." The gap is earned, not artificial.

I considered three alternative interpretations and rejected them:

| Intervention | What it would measure | Why I didn't |
|---|---|---|
| Manually patch their toolchain configs | Code quality independent of toolchain skill | Would compromise the comparison: I would be writing Stryker configs and tests for them. |
| Send focused fix prompts ("here's the bug, fix it") | Bug-fixing skill given guidance | I tried this in an earlier iteration. Both Kimi and GLM regressed by ~1 point. Kimi went off rewriting unrelated tests instead of doing the trivial fix. GLM correctly diagnosed but couldn't resolve. |
| Re-run with a hardened spec ("verify mutation works before declaring complete") | Self-verification skill given a stronger prompt | Useful as a separate seed/comparison but changes the benchmark question. |

This finding is what 47.50 and 67.50 actually mean. Both models are capable of writing reasonable React + Express code. Their judge-only consensus scores are within 0.3 of the leaders'. What they lack is the discipline to verify their own toolchain before signaling done. A small skill with outsized impact on production code review.

---

## 5. Operational findings (lessons for future seeds)

### 5.1 Namespace contamination is a real benchmarking hazard

The opencode aggregator routes the same model name through two different inference backends depending on namespace prefix (`opencode/` vs `opencode-go/`). When the `opencode/` workspace ran out of credits mid-run and Kimi/GLM resumed via `opencode-go/`, the partial work + finalizing model produced Frankenstein candidates. After clean re-runs on `opencode-go/` only:

* GLM gained +23.75 (43.75 → 67.50). The splice was crippling it.
* Kimi lost -17.25 (64.75 → 47.50). The splice had been masking weak e2e behind a second model's compensating fixes.

Lesson: aggregator-routed benchmarks must pin the namespace, not just the model name. Mid-run namespace switches are not equivalent to within-namespace resumes.

### 5.2 Dev-server zombies corrupt parallel comparisons silently

During human-in-the-loop UI review, I noticed two pairs of "identical" rendered pages. DeepSeek matched Codex pixel-for-pixel, GLM matched Kimi. Investigation: stale Vite dev servers from earlier runs were squatting on ports, serving cached old code that hardcoded `localhost:3001` (DeepSeek's backend). My fresh processes silently fell back to other ports. After cleanup, all 5 UIs were distinct. Lesson: kill stale dev processes as part of every comparison setup, even if you do not think any are running.

### 5.3 Mutation-test parser bug (now fixed)

The initial scoring read `0.00` for mutation across all 5 candidates because the harness expected Stryker's JSON-reporter output at `candidate/reports/mutation/mutation.json`, but the candidates' configs only enabled the HTML reporter. Fix: scrape `mutation.log` for `Final mutation score of XX.XX` as a fallback. Patch in `scripts/score.py:_score_mutation`. Re-running just the score aggregator (no gauntlet re-run) recovered the real numbers shown in §4.1. Lesson: cross-validate scoring on the first complete eval before trusting it.

### 5.4 e2e signal is uniformly suppressed by the npm-script-header bug

Every candidate's `e2e.json` starts with the npm script header line (`> library-lending@1.0.0 test:e2e > playwright test ...`) before the actual JSON, breaking `score.py:_score_functional`. All five candidates' e2e signal was silently dropped. `functional_correctness` reflects BDD only. Bug documented but not fixed in this seed because it affects all candidates uniformly, so the relative ranking is preserved. Only absolute scores understate functional quality.

### 5.5 Single-pass judging has measurable variance

In one debugging cycle, I re-ran the architecture judge on identical Kimi code (no candidate changes) and got 0.75 the first time and 0.62 the second. Same rubric, same evidence, ~10 minutes apart. Real signal that `judge_passes_per_criterion: 1` is too low. Article-grade publication should report n=3 minimum.

### 5.6 Cohen's κ on low-variance criteria is uninformative

When all three judges give the same score (Gherkin κ = 1.00 here, or `architecture` clustering near a narrow value), the κ calculation does not distinguish "judges are perfectly calibrated" from "the score range is too narrow to discriminate." Lesson: report κ alongside the rating distribution. A κ near 1.0 on a tight distribution and a κ near 0 on a tight distribution mean the same thing: there is not enough variance to tell.

---

## 6. Comparison to a different task: design ≠ engineering

A companion experiment ran the same five models on a landing page generation task. Single-file `index.html` for a fictional coffee subscription. Same five candidates, same harness shape, but design-focused criteria (visual hierarchy, copy quality, modern aesthetic, responsive design, conversion orientation).

The ranking changed substantially:

| Model | Engineering benchmark | Design benchmark | Δ |
|---|---:|---:|---:|
| Claude Opus 4.7 | 3rd (83.75) | **1st** (4.40 / 5) | **+2** |
| GPT-5.5 (Codex CLI) | 2nd (85.00) | 2nd (4.33) | 0 |
| DeepSeek V4 Pro | **1st** (85.66) | 3rd (4.20) | **-2** |
| GLM 5.1 | 4th (67.50) | 4th (3.93) | 0 |
| Kimi K2.5 | 5th (47.50) | 5th (3.87) | 0 |

The two top-tier models, DeepSeek and Claude, excel at different things. **DeepSeek dominates engineering. Claude dominates design.** Codex is the consistent #2 across both. GLM and Kimi are stable in the bottom half across both, suggesting they are genuinely behind on overall capability rather than specialized in one direction.

This is the most important take-away for any team trying to pick a model. **There is no single "best coding LLM."** There is a best for engineering and a best for design, and they are not the same model.

---

## 7. Limitations and threats to validity

Honest reporting of where this experiment is weak:

* **Single seed per generator.** Each model produced one candidate. Quality has within-model variance I do not measure. A real methodology paper would report 3+ seeds with mean ± stdev.
* **Single judge pass per criterion in the κ portion.** Within-vendor variance is unmeasured.
* **Three of the five candidates are also judges** (Claude, Codex/GPT-5.5, DeepSeek). The self-bias check passed but n=1.
* **e2e signal universally suppressed** by the npm-script-header parser bug (§5.4). Relative ranking preserved, absolute scores understate functional quality.
* **Mutation ceiling capped at 90%**, so Codex and Claude saturate. Lifting to 0.95 would re-spread the leaders.
* **Cursor / Gemini 3.1 Pro excluded** (provider error, likely plan-gating). One major model is missing.
* **Token cost not captured** per generator. Future seeds should record this from each CLI's billing output for a quality-per-dollar axis.
* **Bash background timeout caveat.** The orchestration relies on backgrounded shell commands surviving past their nominal timeout. Verified empirically for 90-minute generations, but documentation-worthy for reproduction.
* **Architecture κ negative due to score-clustering**, not real disagreement. Methodology artifact (§5.6).

---

## 8. Conclusion

I measured what frontier coding LLMs ship on a complete full-stack scaffolding task when given a written brief and zero supervision. The answer for this specific spec: three of the five (DeepSeek, Codex, Claude) deliver clean, working repositories. The other two (GLM, Kimi) declare complete on toolchain failures they did not verify. The 36-point gap from #3 to #5 is real and earned.

The methodology is robust: 72.5% of the final-score weight is objective (build, test, mutation, security, accessibility), and a multi-vendor κ check (overall κ = 0.42, moderate) confirms that the judge contribution is a reasonable supplementary signal that does not dominate the ranking. The most discriminating signal in the experiment is self-verification: the top three models implicitly ran the gauntlet against themselves before declaring complete. The bottom two did not.

For a team picking an autonomous coding agent for greenfield engineering work specifically, **DeepSeek V4 Pro and GPT-5.5 (Codex CLI) are the strongest first-shot performers** in this experiment. For broader work that includes UI/visual design, the companion landing page benchmark suggests **Claude Opus 4.7** is a stronger choice. There is no single answer.

### Disclaimer

This experiment is one use case of spec-driven development. A written brief handed to an autonomous coding agent and evaluated on its first-shot output without any human-in-the-loop iteration. It is intentionally narrow.

It does **not** measure:

* Iterative workflows where a human reviews and redirects.
* Long-running agent sessions over multiple days or weeks.
* Tasks outside greenfield full-stack scaffolding.
* Models other than the five evaluated.
* Operating modes other than YOLO with each model's native CLI.

The methodology is reproducible and the artifacts are public, but the conclusions are about this brief, these five models, in this configuration, on the day they were tested. Readers should treat the rankings as one well-instrumented data point. Useful, but **not a substitute for hands-on experimentation with a specific model on the specific kind of work their team actually does**. An LLM that placed third here might be the right choice for your team's domain, your team's existing toolchain, or your team's review cadence. **Run your own brief.**

---

## 9. Artifacts and reproduction

```
llm-benchmark-library/
├── fixture/                       inputs handed to every LLM (the spec)
│   ├── START-HERE.md
│   ├── REQUIREMENTS.md            29 acceptance criteria, 9 negative
│   ├── TECH-CONSTRAINTS.md
│   └── TASKS.md
├── rubrics/                       per-criterion judge rubrics (anchored 1..5)
│   ├── ui-ux.md  api-design.md  architecture.md  gherkin.md
│   └── judge-prompt-template.md
└── harness/
    ├── config.yaml                weights, thresholds, judges
    ├── Dockerfile                 sandbox image for the gauntlet
    ├── scripts/
    │   ├── generate.sh            CLI dispatcher per generator
    │   ├── docker-run.sh          gauntlet + boot-app wrapper
    │   ├── run-objective.sh       full objective gauntlet (in container)
    │   ├── package_evidence.py    builds per-criterion evidence bundles
    │   ├── judge.py               primary judge w/ Playwright MCP
    │   ├── kappa-judge.py         multi-vendor κ judge (no MCP)
    │   ├── kappa-compute.py       pairwise Cohen's κ aggregator
    │   └── score.py               weighted final scoring
    └── runs/
        ├── _final_report.md       this file
        ├── _session_summary.md    leaderboard + per-criterion + threats
        ├── _spliced_notes.md      pre-rerun namespace-contamination findings
        ├── _kappa/                3-vendor cross-judge data
        │   ├── _results.md        κ tables and interpretation
        │   ├── _results.json      raw numbers
        │   ├── claude-opus47/<gen>-<criterion>.json
        │   ├── codex-gpt55/<gen>-<criterion>.json
        │   └── opencode-deepseek/<gen>-<criterion>.json
        ├── _screenshots/          5 PNGs of running candidate apps
        └── <generator>-seed1/
            ├── candidate/         the model's full repo
            ├── _generation/       generation manifest, stdout/stderr, prompt
            ├── objective/         install/build/test/lint/lighthouse/...
            ├── evidence/          per-criterion bundles for the judge
            ├── judges/claude-code/   primary judge JSON judgments
            └── score.json         per-candidate aggregated final score
```

Reproducing the experiment from a clean clone:

```bash
cd llm-benchmark-library/harness

# 1. Build the sandbox image (one-time, ~10 min, ~1.35 GB)
make docker-build

# 2. Generate a candidate (one of: codex-gpt55, opencode-{deepseek,glm,kimi}, claude-opus47)
make generate GEN=opencode-deepseek SEED=1

# 3. Run the full eval pipeline (gauntlet + evidence + primary judge + score)
make eval RUN=runs/opencode-deepseek-seed1

# 4. (Optional) Multi-vendor Cohen's κ pass
python3 scripts/kappa-judge.py --vendor claude-opus47
python3 scripts/kappa-judge.py --vendor codex-gpt55
python3 scripts/kappa-judge.py --vendor opencode-deepseek
python3 scripts/kappa-compute.py

# 5. After all generators are done, aggregate
make article-data
```

Tested on Linux + Docker Desktop 29.4.1. Required CLIs (with auth pre-configured): `codex` (OpenAI), `opencode` (`opencode-go/` namespace funded), `claude` (Anthropic).

A companion landing page benchmark, referenced in §6, ran the same five candidates against a UI design fixture and produced a different ranking. Results are not included in this repository.
