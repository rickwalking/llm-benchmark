# Library Lending: Frontier Coding LLM Benchmark

A reproducible benchmark of frontier coding LLMs on a complete React + Express + SQLite scaffolding task. Each model receives an identical 21 KB written specification, works autonomously for 30 to 60 minutes through its native CLI in YOLO mode, and is scored by an objective gauntlet (build, test, mutation, accessibility, OpenAPI conformance, security) plus an LLM-as-judge stage on UX, API design, architecture, and Gherkin quality.

## Final ranking

| Rank | Model | Final / 100 | Mutation |
|---|---|---:|---:|
| 1 | DeepSeek V4 Pro | **85.66** | 88.43% |
| 2 | GPT-5.5 (via Codex CLI) | **85.00** | 90.57% |
| 3 | Claude Opus 4.7 | **83.75** | 95.30% |
| 4 | GLM 5.1 | **67.50** | errored |
| 5 | Kimi K2.5 | **47.50** | errored |

Cross-vendor judge agreement: **Cohen's κ = 0.42 (moderate)** across three vendor-different judges (Claude Code, Codex CLI, Opencode/DeepSeek). The full ranking holds because 72.5% of the score weight is objective (build, test, mutation, security), so judge variance only moves the remaining 27.5%.

The detailed results, per-criterion breakdowns, methodology, operational findings, threats to validity, and the discussion of "design vs engineering" axis differences are in **[`harness/runs/_final_report.md`](harness/runs/_final_report.md)**.

## Repository layout

```
llm-benchmark-library/
├── README.md                         this file
├── fixture/                          inputs handed to every LLM (the spec)
│   ├── START-HERE.md
│   ├── REQUIREMENTS.md               29 acceptance criteria, 9 negative
│   ├── TECH-CONSTRAINTS.md
│   └── TASKS.md
├── rubrics/                          per-criterion judge rubrics (anchored 1..5)
│   ├── ui-ux.md  api-design.md  architecture.md  gherkin.md
│   └── judge-prompt-template.md
└── harness/
    ├── README.md                     harness usage and design notes
    ├── config.yaml                   weights, thresholds, judges
    ├── Dockerfile                    sandbox image for the gauntlet
    ├── pyproject.toml                Python deps for the harness
    ├── mcp-judge.json                MCP config used by the primary judge
    ├── playwright/                   screenshot capture template
    ├── scripts/
    │   ├── generate.sh               CLI dispatcher per generator
    │   ├── docker-run.sh             gauntlet + boot-app wrapper
    │   ├── run-objective.sh          full objective gauntlet (in container)
    │   ├── api_probe.sh              API probe used during gauntlet
    │   ├── package_evidence.py       builds per-criterion evidence bundles
    │   ├── judge.py                  primary judge w/ Playwright MCP
    │   ├── kappa-judge.py            multi-vendor κ judge (no MCP)
    │   ├── kappa-compute.py          pairwise Cohen's κ aggregator
    │   └── score.py                  weighted final scoring
    └── runs/
        ├── _final_report.md          detailed article-style report
        ├── _session_summary.md       leaderboard + per-criterion + threats
        ├── _spliced_notes.md         pre-rerun namespace-contamination findings
        ├── _kappa/                   3-vendor cross-judge data + κ tables
        ├── _screenshots/             5 PNGs of running candidate apps
        └── <generator>-seed1/
            ├── candidate/            the model's full generated repo
            ├── _generation/          generation manifest, stdout, prompt
            ├── objective/            install/build/test/lint/lighthouse/...
            ├── evidence/             per-criterion bundles for the judge
            ├── judges/claude-code/   primary judge JSON judgments
            └── score.json            per-candidate aggregated final score
```

## Reproducing the experiment

The full pipeline is automated through a `Makefile` plus the scripts in `harness/scripts/`.

Required CLIs (with auth pre-configured):

- `codex` (OpenAI Codex CLI)
- `opencode` with the `opencode-go/` namespace funded
- `claude` (Claude Code)
- `docker` (Docker Desktop or Docker Engine)

```bash
cd harness

# 1. Build the sandbox image (one-time, ~10 min, ~1.35 GB)
make docker-build

# 2. Generate a candidate (one of: codex-gpt55, opencode-{deepseek,glm,kimi}, claude-opus47)
make generate GEN=opencode-deepseek SEED=1

# 3. Run the full eval pipeline (gauntlet + evidence + primary judge + score)
make eval RUN=runs/opencode-deepseek-seed1

# 4. (Optional) Multi-vendor Cohen's κ pass for inter-judge agreement
python3 scripts/kappa-judge.py --vendor claude-opus47
python3 scripts/kappa-judge.py --vendor codex-gpt55
python3 scripts/kappa-judge.py --vendor opencode-deepseek
python3 scripts/kappa-compute.py

# 5. After all 5 generators are done, aggregate the leaderboard
make article-data
```

Tested on Linux + Docker Desktop 29.4.1.

## Key methodology choices

**CLI-driven generation, not API SDKs.** The CLIs (Codex, Opencode, Claude Code) are how these models are actually used in production engineering. They include scaffolding behavior (autonomous file reads, shell calls, tool use) that an SDK call does not replicate.

**Docker sandbox for the gauntlet but not for generation.** Generation runs on the host because each CLI carries its own auth context. The gauntlet runs untrusted candidate code in an isolated container with `--user $(id -u)` to keep filesystem writes contained.

**~72.5% objective weighting.** LLM-as-judge has documented biases. Tying most of the score to verifiable objective metrics (does it build, do tests pass, what is the mutation score) makes the ranking less sensitive to judge calibration drift. The Cohen's κ pass confirmed this empirically.

## Limitations and disclaimer

This is one use case of spec-driven development with autonomous coding agents. It is intentionally narrow.

It does **not** measure: iterative workflows where a human reviews and redirects, long-running agent sessions over multiple days, tasks outside greenfield full-stack scaffolding, models other than the five evaluated, or operating modes other than YOLO with each model's native CLI.

The methodology is reproducible and the artifacts here are public, but the conclusions are about this brief, these five models, in this configuration, on the day they were tested. Treat the rankings as one well-instrumented data point. **Run your own brief** before adopting an autonomous coding agent for your team's actual work.

For a deeper discussion of methodology, threats to validity, and operational findings, see [`harness/runs/_final_report.md`](harness/runs/_final_report.md).
