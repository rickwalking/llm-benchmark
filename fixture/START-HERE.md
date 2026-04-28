# START HERE

You are an autonomous engineer. Your task is to build a **library lending application**
from scratch in a single working session, following the four documents in this directory:

1. `REQUIREMENTS.md` — what the app must do (user stories + acceptance criteria)
2. `TECH-CONSTRAINTS.md` — required stack, versions, project layout, and runtime contracts
3. `TASKS.md` — ordered task list. Work through it top to bottom.
4. (this file) — meta instructions

## Working agreement

- Produce a **single repository** rooted at the current working directory. Do not assume
  any pre-existing files; create everything you need.
- Follow `TECH-CONSTRAINTS.md` exactly for versions, ports, and layout. Deviations cost
  points even if the result works.
- Do not stub. Every acceptance criterion in `REQUIREMENTS.md` must be implemented end-to-end:
  database → API → UI. **Negative ACs (rejection paths) are mandatory and scored equally
  to happy paths.**
- Write production-grade code, not demo code. Other engineers will read it.
- Tests are not optional. `TASKS.md` bucket B and bucket C are weighted equally to bucket A.
- When you finish, output a single block that reads exactly: `BENCHMARK COMPLETE`.
  Do not write any prose summary after that line.

## What you can assume

- `npm` is on PATH. Node 22 LTS is installed.
- The grader will run `npm install` from the repo root, then `npm run dev` to start the
  app, then `npm run test:all` to run every test suite, then `npm run mutation` for
  mutation testing. These scripts MUST exist and work without manual setup.
- No internet access is required at runtime. If you need seed data, generate it.
- No authentication. The `member_id` is passed explicitly in API calls and selected in
  the UI. Do not implement login screens.

## What you must not do

- Do not pull in heavy starter templates, admin dashboards, or component libraries that
  ship a complete UI. You are being evaluated on the UX *you* design.
- Do not invent acceptance criteria beyond what is in `REQUIREMENTS.md`. Implementing
  unspecified features does not earn points and may lose them by adding surface area to
  test.
- Do not skip negative cases ("the unhappy path") — they are scored.
- Do not use `any` in TypeScript except where genuinely unavoidable; explain in a comment
  if you do.

## How you will be evaluated

- **Objective (~65%)**: build, type-check, lint, e2e tests vs ACs, mutation score,
  accessibility, API correctness, security checks.
- **Judge (~35%)**: rubrics for UI/UX quality, API design, code architecture, Gherkin
  quality. Each judged on a 1-5 anchored scale.

Begin with `TASKS.md`.
