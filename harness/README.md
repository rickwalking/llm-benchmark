# Harness

CLI-driven evaluation automation for the library-lending benchmark. No API SDKs.

- **Candidate generation** runs each configured CLI (Codex, Opencode, …) in
  non-interactive YOLO mode against a fresh worktree pre-loaded with the
  fixture. Generation happens **on the host** because each CLI carries its
  own auth context. Candidate output lands at `runs/<id>/candidate/`.
- **Objective gauntlet** runs **inside a Docker container**
  (`llm-bench-runner:dev`). Untrusted candidate code (npm install,
  postinstall scripts, the dev server, whatever the LLM wrote) cannot reach
  the host filesystem outside `runs/`.
- **Judging** uses Claude Code on the host, in `--print` mode with
  `--dangerously-skip-permissions` and Playwright MCP. The judge boots the
  candidate's app **inside the same container** with port-forwards to the
  host (`5173`, `3001`), then investigates via Playwright MCP and host-side
  Bash/Read/Glob. The host-side claude CLI keeps its auth; the candidate
  code stays sandboxed.

## Pipeline

```
fixture/        ───►  generate.sh  ───►  candidate/   (model's repo, YOLO output)
                       (CLI YOLO)              │
                                               ▼
                                       run-objective.sh
                                       (install, build, typecheck, lint,
                                        unit, BDD, e2e, mutation, lighthouse,
                                        axe, openapi-validate, npm-audit,
                                        madge, file-sizes)
                                               │
                                               ▼
                                       package_evidence.py
                                       (per-criterion bundles for the judge)
                                               │
                                               ▼
                                            judge.py
                                       (boots app; spawns claude --print
                                        with Playwright MCP; one invocation
                                        per criterion × N passes for variance)
                                               │
                                               ▼
                                            score.py
                                       (objective + judge-median aggregation,
                                        weighted final ×100, within-judge
                                        stdev, seed variance, article tables)
```

## Layout

```
harness/
├── README.md
├── Makefile
├── Dockerfile              sandbox image (Node 22 + Chromium + Playwright + tools)
├── .dockerignore
├── config.yaml             container, generators, judge, weights, thresholds
├── pyproject.toml          minimal Python deps (pyyaml, numpy)
├── mcp-judge.json          MCP config used by the judge (Playwright only)
├── playwright/
│   └── screenshots.spec.ts pre-judging screenshot snapshot (backup; judge takes own)
└── scripts/
    ├── generate.sh         run a CLI generator in YOLO mode → candidate/ (host)
    ├── docker-run.sh       wraps `docker run` for gauntlet and judge-phase boot
    ├── run-objective.sh    full objective gauntlet (executed inside container)
    ├── api_probe.sh        hits each documented endpoint (called by gauntlet)
    ├── package_evidence.py per-criterion evidence bundles
    ├── judge.py            Claude Code judge dispatcher (host); boots candidate in container
    └── score.py            score aggregation
```

## Container build

```bash
make docker-build           # builds llm-bench-runner:dev (~2GB, one-time)
```

The image is rebuilt automatically by `make objective` if it doesn't exist.
On the host, an `~/.npm-docker/` cache directory is created and bind-mounted
into the container for faster repeat installs.

## Run-directory layout

```
runs/<generator-name>-seed<n>/
├── candidate/                  the model's generated repo
├── _generation/                generation manifest, stdout/stderr, wall-clock
├── objective/                  tool outputs from the gauntlet
├── evidence/                   per-criterion bundles for the judge
├── judges/
│   └── claude-code/
│       ├── ui_ux-pass1.json
│       ├── ui_ux-pass1.raw.txt
│       ├── ui_ux-pass2.json
│       ├── ...
│       ├── api_design-pass1.json
│       ├── architecture-pass1.json
│       └── gherkin-pass1.json
└── score.json
```

## Quick start

```bash
# 0. Sanity-check the fixture and rubrics
make check

# 1. Generate a candidate with one of the configured CLIs
make generate GEN=codex-gpt55 SEED=1
# → runs/codex-gpt55-seed1/candidate/  (the model built it)

# 2. Run the objective gauntlet
make objective RUN=runs/codex-gpt55-seed1

# 3. Package per-criterion evidence
make evidence RUN=runs/codex-gpt55-seed1

# 4. Dispatch the Claude Code judge (boots the candidate's app, runs each
#    criterion N times, kills app)
make judge RUN=runs/codex-gpt55-seed1

# 5. Aggregate the score
make score RUN=runs/codex-gpt55-seed1

# Phases 2-5 in one shot:
make eval RUN=runs/codex-gpt55-seed1

# After running ≥3 seeds for a generator:
make leaderboard MODEL=codex-gpt55

# After running every generator × seeds:
make article-data
```

## Configuring CLIs

Each entry in `config.yaml > candidate_generators` is a generator. The
`cmd` template uses `${CANDIDATE_DIR}`, `${FIXTURE_DIR}`, `${PROMPT_FILE}` and
`${HARNESS_DIR}` substitutions. The harness writes a single `prompt.md` file
(concatenation of `START-HERE.md`, `REQUIREMENTS.md`, `TECH-CONSTRAINTS.md`,
`TASKS.md` in order) and feeds it to the CLI via stdin / arg / filearg
according to `prompt_input`.

The exact CLI flags shipped in `config.yaml` are educated guesses — verify
them against your installed Codex / Opencode versions before running for
real. The harness prints the resolved command line before executing.

## The judge

`judge` runs:

```
claude --print
       --dangerously-skip-permissions
       --allowedTools Read,Bash,Glob,Grep,mcp__playwright__*
       --mcp-config <harness>/mcp-judge.json
       --append-system-prompt "<persona from config>"
```

For each criterion the persona is concatenated with the rubric file and a
brief task description naming the live URL, the candidate path, and the
pre-packaged evidence directory. The judge is told to output ONLY JSON
matching the rubric's specified schema.

Because the judge is a single (Claude Code) judge, the harness reports
**within-judge variance** — `judge_passes_per_criterion` invocations per
criterion, stdev across passes — instead of Cohen's κ across vendors.
This is a known limitation; flag it as a threat to validity in the article.

## Reproducibility checklist

Before publishing the article:

- [ ] Pin candidate-generator model IDs in `config.yaml` (no "latest" aliases).
- [ ] Pin the judge's underlying Claude Code model with `--model <id>`.
- [ ] Pin `@playwright/mcp` to a specific version, not `@latest`, in `mcp-judge.json`.
- [ ] Pin tool versions (Stryker, Playwright, Lighthouse, axe-core, madge).
- [ ] Run the gauntlet on a fixed Docker image so OS-level differences don't leak.
- [ ] Record candidate-generation cost and wall-clock per run from `_generation/manifest.txt`.
- [ ] Sample 10% of judge JSONs for human spot-check; report agreement.
