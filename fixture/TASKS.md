# Tasks

Work through these in order. Do not skip ahead. The benchmark grades each bucket
independently, so leaving bucket B or C unfinished costs as much as leaving bucket A unfinished.

---

## Bucket A — Scaffold and happy path (build it works end-to-end)

### A1. Workspace scaffold
Create the workspace layout in `TECH-CONSTRAINTS.md` exactly. Add `package.json` with
workspaces, all required root scripts, and a `.gitignore` that excludes `node_modules`,
`backend/data/library.db`, `dist/`, and `.stryker-tmp/`.

### A2. Backend foundation
- Initialize Express 5 with TypeScript, helmet, CORS (dev origin only), JSON body parser.
- Set up `better-sqlite3` with a migration runner that applies any unapplied
  `backend/migrations/*.sql` on boot.
- Write the schema migration for all five entities (`books`, `members`, `loans`, `reservations`, `fines`).
- Add a seed routine that inserts ~10 books and ~5 members **only if** the DB is empty.

### A3. Policy module
Create `backend/src/policy/` with pure functions for every business rule:
`MAX_ACTIVE_LOANS`, `LOAN_PERIOD_DAYS`, `LATE_FINE_RATE_CENTS_PER_DAY`, `LATE_FINE_CAP_CENTS`,
`RESERVATION_NOTIFICATION_HOURS`, `FINE_BORROW_BLOCK_THRESHOLD_CENTS`. Functions: `computeFineCents(borrowedAt, dueAt, returnedAt)`, `canBorrow(member, activeLoans, unpaidFines)`, `nextReservationToNotify(reservations)`. **Do not inline these constants anywhere else.**

### A4. Service layer
`backend/src/services/` with pure-ish functions taking an injectable DB handle:
- `bookService` (list, get, create — duplicate-ISBN guard)
- `memberService` (list, get with derived fields, create — duplicate-email guard)
- `loanService` (borrow, return — invokes policy and reservation transitions)
- `reservationService` (reserve, cancel, expireStale)
- `fineService` (pay)

Each service throws typed domain errors (`ConflictError`, `NotFoundError`, `ForbiddenError`, `PaymentRequiredError`) that the HTTP layer maps to status codes.

### A5. HTTP layer + OpenAPI
Routes per `REQUIREMENTS.md`. Validate every request body with zod. Map domain errors
to status codes (409, 404, 403, 402). Author `backend/openapi.yaml` and validate it on
boot using `@apidevtools/swagger-parser` — fail boot if invalid.

### A6. Frontend foundation
React 19 + Vite + TS strict. React Router. Pages: `/books`, `/books/:id`, `/members`,
`/members/:id`, `/checkout`. Layout: top nav, content area, footer. Loading and error
states for every async page. Empty states for every list.

### A7. Frontend feature implementation
- Catalog with availability, sorted by title.
- Book detail with queue depth, member-aware queue position display.
- Member profile with active loans, overdue badges, reservations w/ countdown, fines.
- 3-step checkout flow with step indicator, back/next nav, validation.
- Modals: confirm return, pay fine. Focus-trapped, ESC closes, overlay click closes.

### A8. Verify the happy path manually
`npm install && npm run dev`. Walk through: add member → add book → checkout → return on time → return late (manually advance dates by manipulating the DB or expose a dev-only `?advance_clock=N` param) → reserve → notify → expire → fulfil. Fix anything that breaks.

---

## Bucket B — Gherkin scenarios and step definitions

### B1. Write `.feature` files
For every user story (US-1..US-6), author a `.feature` file in `features/` with
scenarios covering each AC, including negatives. Use **declarative**, business-readable
language. Examples of good and bad style:

- ✅ `When the librarian lends "Dune" to Alice` — declarative, business-level
- ❌ `When I click the button with id "lend-btn"` — imperative, UI-level

Each scenario must reference its AC ID in a tag, e.g., `@AC-3.2`. Use scenario outlines
for parametric cases. Use a `Background` for shared setup. Avoid duplication across files.

### B2. Step definitions
Implement step definitions in `features/step_definitions/*.ts` that drive the system at
the **HTTP layer** (not the UI). They should hit the running backend (started by the
test runner) using fetch/supertest. Reuse a `World` for context (current member, last
response).

### B3. `npm run test:bdd`
Wire up Cucumber to start the backend in test mode (separate DB file or in-memory),
run the features, and tear down. All scenarios must pass.

---

## Bucket C — Unit tests targeting mutation score

### C1. Policy unit tests
Exhaustive Vitest tests for every function in `backend/src/policy/`. Boundary tests:
fine at exactly 0 days late, 1 day late, 19 days late (cap-1), 20 days late (cap-hit),
21 days late (over cap). Loan limit at 4, 5, 6 active loans. Fine threshold at $4.99,
$5.00, $5.01.

### C2. Service unit tests
Vitest + supertest for the API layer covering every AC, including negatives. Use an
in-memory SQLite per test for isolation.

### C3. Stryker config
Configure Stryker at the repo root scoped to `backend/src/policy/**` and
`backend/src/services/**`. Use the Vitest runner. Target ≥80% mutation score. If a
mutant survives, add a test that kills it.

### C4. Run the gauntlet
```
npm run typecheck
npm run lint
npm run test:unit
npm run test:bdd
npm run test:e2e
npm run mutation
```

All must pass / meet thresholds. Fix anything that doesn't.

---

When everything in all three buckets is green, output exactly: `BENCHMARK COMPLETE`.
