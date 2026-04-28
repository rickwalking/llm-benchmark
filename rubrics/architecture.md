# Rubric — Code Architecture

## Definition

Measures how the code is organized: separation of concerns, dependency direction,
module boundaries, the absence of god-files and god-functions, and whether a new engineer
could find where to make a change.

Does **not** measure: test coverage (objective), styling or comment density, or test
quality.

## Evidence the judge receives

- Directory tree (depth ≤ 3) of `backend/src/` and `frontend/src/`.
- File-size distribution: a list of files with line counts, sorted descending.
- Output of `madge --circular` (cycles).
- Output of `madge --orphans` (dead modules).
- The `policy/` directory contents in full (per `TASKS.md` A3, this should hold all rules).
- One service file (e.g., `loanService.ts`) and the corresponding HTTP handler file.
- The frontend route definitions and one feature directory's contents (e.g., `checkout/`).
- A short summary of imports: does the HTTP layer import from the DB layer directly? Does the frontend duplicate any types from the backend without a shared types boundary?

## Anchored rubric

### 1 — Tangled
- One or two files contain most of the logic ("god files" >800 lines).
- HTTP handlers contain SQL, validation, and business rules inline.
- Frontend pages directly construct API URLs with string concatenation scattered everywhere.
- Cycles present (`madge --circular` is non-empty).
- Business rule values (loan period, fine rate) are hard-coded inline at multiple call sites.

### 2 — Layered but leaky
- A nominal layering exists (routes → services → db) but layers leak: services import from the routes module, or DB rows are returned directly to HTTP responses.
- Some duplication of business constants — defined in one file but also re-typed inline in another.
- Frontend has pages but lacks any shared type for API resources; types are redeclared.
- Some files are oversized (>500 lines) without justification.

### 3 — Clean enough
- Backend has clear layers: `policy/` (pure), `services/` (db + business rules), `routes/` (HTTP), `migrations/`, `db/` (connection + schema setup).
- All policy values live in `policy/` and are imported, not duplicated.
- Domain errors are a small, named hierarchy used everywhere.
- Frontend has a clear `pages/`, `components/`, `api/` (or equivalent) split. API types are defined once and reused.
- No cycles. No files >300 lines except possibly OpenAPI yaml or generated artefacts.

### 4 — Well-modularized
- Everything in 3, plus:
- Services depend on a thin DB-access abstraction (e.g., a typed query module) rather than calling raw `db.prepare` directly. This makes them unit-testable in isolation.
- The frontend organizes by *feature* (`checkout/`, `members/`, `books/`) — each feature owns its components, hooks, and API calls — rather than by *technical role* (`components/`, `hooks/`, `api/`) where features sprawl across folders.
- Shared types between frontend and backend live in a single source (a `shared/` workspace, a generated client from OpenAPI, or a clearly-named types package), not duplicated.
- A new engineer can locate "where is the rule for loan limit?" or "where does the checkout's confirm step live?" in under 30 seconds based on the directory tree alone.

### 5 — Disciplined
- Everything in 4, plus:
- The dependency graph reads top-to-bottom: imports flow only inward toward `policy` (the most stable module). No layer skips happen — `routes` does not directly import from `db`; it goes through `services`.
- Tests mirror the source structure 1:1 (`backend/src/services/loanService.ts` ↔ `backend/src/services/loanService.test.ts`), making coverage gaps trivial to spot.
- The reservation-queue state machine is implemented as a single, named module that owns the transitions (`waiting → notified → expired/fulfilled`), and that module is the only place those transitions appear.
- File-size distribution is healthy: p95 < 200 lines.
- Naming is consistent: a reader can predict where a new piece of logic goes without asking.

## Notes for judges

- A `madge --circular` non-empty result caps the score at 2.
- A god-file (>800 lines) caps the score at 1.
- A heroic abstraction (premature factories, dependency injection containers, plugin systems) for a small app drops the score by one anchor — over-engineering is not architecture.
- Score the *result*. A 4 in a clean React app is not 5 just because the model used some specific framework convention.
