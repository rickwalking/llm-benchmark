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


---


# Library Lending — Requirements

A small public library wants a system to manage book lending, returns, late fines, and
a reservation queue when books are unavailable. The system has two user roles in scope:

- **Librarian** — uses the UI to perform actions on behalf of any member.
- **Member** — represented in the system by a `member_id`. No authentication: the
  librarian selects which member they are acting for.

## Domain entities

### Book
- `id` (uuid)
- `title` (string, required)
- `author` (string, required)
- `isbn` (string, required, unique, 10 or 13 digits, hyphens allowed)
- `total_copies` (integer, ≥1)
- `available_copies` (integer, derived: `total_copies` minus active loans)

### Member
- `id` (uuid)
- `name` (string, required)
- `email` (string, required, unique, valid format)
- `member_since` (date)
- `status` (`active` | `suspended`, default `active`)

### Loan
- `id` (uuid)
- `book_id`, `member_id` (foreign keys)
- `borrowed_at` (timestamp)
- `due_at` (timestamp, = `borrowed_at` + 14 days)
- `returned_at` (timestamp, nullable)
- A loan is **active** while `returned_at IS NULL`.

### Reservation
- `id` (uuid)
- `book_id`, `member_id`
- `queued_at` (timestamp)
- `status` (`waiting` | `notified` | `expired` | `fulfilled` | `cancelled`)
- `notified_at` (timestamp, nullable)
- `expires_at` (timestamp, nullable; set to `notified_at` + 48 hours)

### Fine
- `id` (uuid)
- `member_id`, `loan_id`
- `amount_cents` (integer, ≥0)
- `paid_at` (timestamp, nullable)

## Business rules (the parts that must be testable)

These rules carry numeric/conditional logic that mutation testing will target. Do not
hard-code their values inline; centralize them in a `policy` module so they are
unit-testable.

| Rule | Value |
|---|---|
| Max active loans per member | **5** |
| Loan period | **14 days** |
| Late fine rate | **$0.50 per day late** |
| Late fine cap per loan | **$10.00** |
| Reservation notification window | **48 hours** |
| Borrow blocked if unpaid fines exceed | **$5.00** |

## User stories and acceptance criteria

User stories are numbered. Each AC must be implemented end-to-end (DB → API → UI) and
will be exercised by Playwright e2e tests. Negative ACs (marked **NEG**) test rejection
paths and are scored equally to positive ones.

### US-1 — As a librarian, I want to see the catalog
- **AC-1.1**: `GET /api/books` returns a list of all books with title, author, ISBN,
  total copies, and current available copies. List is sorted by title (case-insensitive).
- **AC-1.2**: `GET /api/books/:id` returns a single book including the current
  reservation queue depth (count of reservations with status `waiting` or `notified`).
- **AC-1.3**: The UI page `/books` lists every book and shows availability ("3 of 5
  available", or "All copies on loan — N waiting"). Clicking a book opens its detail page.
- **AC-1.4** **NEG**: `GET /api/books/:id` for a non-existent ID returns **404** with
  body `{"error": "Book not found"}`.

### US-2 — As a librarian, I want to add books and members
- **AC-2.1**: `POST /api/books` creates a book given title, author, ISBN, total_copies.
  Returns **201** with the created resource.
- **AC-2.2** **NEG**: `POST /api/books` with an ISBN that already exists returns **409**
  with body `{"error": "ISBN already exists"}`.
- **AC-2.3**: `POST /api/members` creates a member. Email must be syntactically valid
  and unique.
- **AC-2.4** **NEG**: `POST /api/members` with a duplicate email returns **409**.

### US-3 — As a librarian, I want to lend a book to a member
- **AC-3.1**: `POST /api/loans` with `{member_id, book_id}` creates an active loan if
  all preconditions pass. Returns **201** with the loan, including `due_at`. The book's
  `available_copies` decreases by 1.
- **AC-3.2** **NEG**: If the member already has 5 active loans, returns **409** with
  body `{"error": "Loan limit reached"}`.
- **AC-3.3** **NEG**: If the member's status is `suspended`, returns **403** with body
  `{"error": "Member is suspended"}`.
- **AC-3.4** **NEG**: If the member has unpaid fines totaling more than $5.00, returns
  **402** with body `{"error": "Outstanding fines exceed limit"}`.
- **AC-3.5** **NEG**: If `available_copies` is 0, returns **409** with body
  `{"error": "No copies available — reserve instead"}`. Exception: the member at the head
  of the reservation queue with status `notified` is allowed to borrow (this fulfils
  their reservation; see AC-5.4).
- **AC-3.6**: The UI provides a multi-step **checkout** flow at `/checkout`: step 1 pick
  member, step 2 pick book, step 3 confirm. The confirm step shows due date and any
  applicable warnings (e.g., "this is the member's 5th active loan").

### US-4 — As a librarian, I want to record returns and fines
- **AC-4.1**: `POST /api/loans/:id/return` marks the loan returned, sets
  `returned_at = now`, and increases `available_copies` by 1.
- **AC-4.2**: If returned after `due_at`, the system creates a `Fine` for that loan,
  computed as `min(days_late × $0.50, $10.00)` where `days_late = ceil((returned_at - due_at) / 1 day)`.
  No fine is created if `days_late <= 0`.
- **AC-4.3** **NEG**: Returning a loan whose `returned_at` is already set returns **409**
  with body `{"error": "Loan already returned"}`.
- **AC-4.4**: When a copy returns and there are reservations in the queue for that book,
  the **head** reservation (oldest `queued_at` with status `waiting`) transitions to
  `notified`, with `notified_at = now` and `expires_at = now + 48h`. The book's
  `available_copies` does **not** increase while a notified reservation is outstanding.
- **AC-4.5**: The member profile UI page shows active loans, due dates, overdue badges,
  reservations with queue position and notification countdown, and any unpaid fines.

### US-5 — As a librarian, I want members to reserve unavailable books
- **AC-5.1**: `POST /api/reservations` with `{member_id, book_id}` creates a reservation
  with status `waiting` and `queued_at = now`. Returns **201**.
- **AC-5.2** **NEG**: Returns **409** if the member already has an active loan for that
  book (`{"error": "Member already has this book on loan"}`).
- **AC-5.3** **NEG**: Returns **409** if the member already has a `waiting` or `notified`
  reservation for that book (`{"error": "Duplicate reservation"}`).
- **AC-5.4**: When the member with status `notified` posts to `/api/loans` for that
  book, the loan is created AND the reservation transitions to `fulfilled`. Other
  members attempting to borrow that book while it is in `notified` state get **409**
  with body `{"error": "Book is reserved for another member"}`.
- **AC-5.5**: A scheduled (or on-request) job transitions `notified` reservations whose
  `expires_at < now` to `expired`, and notifies the next `waiting` reservation. Implement
  this as an idempotent function `expireStaleReservations()` invoked on every relevant
  read endpoint (`GET /api/books/:id`, `GET /api/members/:id`) and exposed as
  `POST /api/reservations/expire` for the harness to trigger explicitly.
- **AC-5.6**: The UI book detail page shows current queue depth and, for the selected
  member, their queue position (or "you have a notification, expires in HH:MM:SS").

### US-6 — As a librarian, I want to collect fines
- **AC-6.1**: `GET /api/members/:id` includes an `unpaid_fines_cents` field summing all
  fines with `paid_at IS NULL`.
- **AC-6.2**: `POST /api/fines/:id/pay` sets `paid_at = now`. Returns **200**.
- **AC-6.3** **NEG**: Paying an already-paid fine returns **409**.
- **AC-6.4**: The member profile UI shows unpaid fines with a "Pay" button per fine.
  Clicking opens a confirmation modal.

## Non-functional requirements

- **Accessibility**: every interactive element must be reachable and operable by
  keyboard. All form inputs must have associated labels. Color contrast ≥ AA.
  Tested with axe-core.
- **Performance**: catalog page (~50 books) must achieve a Lighthouse Performance score
  ≥ 80 on a desktop run.
- **Errors**: every error path must surface a clear UI message. No raw stack traces, no
  silent failures.
- **Empty states**: every list page must render a meaningful empty state (not a blank
  white area).

## Out of scope (do not implement)

- Authentication, user accounts, password flows.
- Email/SMS notifications (the "notification" is a state in the DB).
- Payment processing for fines (paying a fine is a single button that just marks it paid).
- Pagination, search-as-you-type, infinite scroll.
- Internationalization. English only.
- Offline mode, PWA features.


---


# Tech Constraints

These are the **only** acceptable choices unless explicitly noted as "free choice".
Deviations are penalized even if the result works — the grader compares architectures
across models.

## Runtime

- **Node**: 22 LTS (`>=22.0.0 <23.0.0` in `engines`).
- **Package manager**: npm (lockfile committed).
- **OS target**: Linux. Do not use Windows-only paths or shell commands in scripts.

## Repository layout

A single repo with **npm workspaces**:

```
/
├── package.json              (workspaces: ["frontend", "backend"]; root scripts only)
├── package-lock.json
├── frontend/                 React app
├── backend/                  Express API
│   └── data/                 SQLite file lives here (created at runtime; .gitignored)
├── features/                 Gherkin .feature files (bucket B)
├── tests/
│   ├── e2e/                  Playwright specs that exercise the running stack
│   └── stryker.conf.json     Mutation testing config (root)
└── README.md
```

## Frontend

- **React**: 19.x
- **Build tool**: Vite 5.x
- **Language**: TypeScript 5.x with `"strict": true` in tsconfig.
- **Routing**: React Router 6.x (or 7.x). Do not roll your own.
- **State**: free choice. Do not pull in Redux Toolkit unless you justify it in a top-of-file comment.
- **Styling**: free choice (CSS modules, Tailwind, plain CSS, or inline). The judge will assess the *result*, not the technology. Whatever you pick must be the only styling system in the repo.
- **No UI kit shortcuts**: do not add MUI, Ant, Chakra, shadcn-ui, daisyUI, or similar pre-built component libraries. You are being evaluated on the UI you design. Headless primitives (Radix, react-aria) are allowed.
- **Dev port**: **5173** (Vite default).

## Backend

- **Runtime**: Express 5.x on Node 22.
- **Language**: TypeScript 5.x with `"strict": true`.
- **Database**: SQLite via `better-sqlite3`. Database file at `backend/data/library.db`. Migrations at `backend/migrations/*.sql`, applied on startup if not present.
- **Validation**: zod (schema validation at the API boundary).
- **API style**: REST with JSON. URLs as specified in `REQUIREMENTS.md`.
- **OpenAPI**: ship `backend/openapi.yaml` describing all endpoints. Must validate against the OpenAPI 3.1 schema. The API responses must match it.
- **Dev port**: **3001**.
- **CORS**: allow only `http://localhost:5173` in dev.

## Testing stack

- **Unit tests**: **Vitest** in both frontend and backend. Backend unit tests target the `policy` module and service layer (not the HTTP layer).
- **API integration**: **Vitest + supertest** against an Express app instance with an in-memory SQLite database.
- **E2E**: **Playwright** at `tests/e2e/`. Spawns the full stack via `npm run dev`. Tests written against the AC IDs (e.g., `test('AC-3.2: rejects 6th loan', ...)`).
- **BDD**: **@cucumber/cucumber** consuming `features/*.feature` (bucket B in TASKS.md). Step definitions in `features/step_definitions/` in TypeScript.
- **Mutation testing**: **Stryker** (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) configured at the repo root, scoped to `backend/src/policy/**` and `backend/src/services/**`. Aim for **≥80% mutation score**.

## Required root scripts (`package.json`)

These exact scripts must exist and run without manual setup:

```jsonc
{
  "scripts": {
    "dev": "starts backend on :3001 AND frontend on :5173 concurrently",
    "build": "type-checks and builds both workspaces",
    "test:unit": "runs vitest in both workspaces",
    "test:e2e": "starts the stack and runs Playwright",
    "test:bdd": "runs cucumber against features/",
    "test:all": "runs test:unit, test:bdd, then test:e2e",
    "mutation": "runs Stryker",
    "lint": "runs eslint across workspaces",
    "typecheck": "runs tsc --noEmit in both workspaces"
  }
}
```

`npm install && npm run dev` from a clean clone must boot the full app with no further
setup. Database migrations apply automatically on first run; seed data (a handful of
books and members) loads if the DB is empty.

## Code quality gates

- ESLint with `@typescript-eslint/recommended` and `eslint-plugin-react`. Build fails on lint errors (warnings allowed).
- No file > 300 lines (target; not a hard fail).
- No cyclic imports (`madge --circular` must report zero).
- No `any` in TypeScript except with a comment explaining why.

## Security baseline

- No secrets in the repo. SQLite is local-file; no credentials needed.
- All SQL via parameterized queries. No string concatenation into SQL.
- `helmet()` middleware on the backend.
- `npm audit --omit=dev` must report zero high or critical vulnerabilities.

## Accessibility baseline

- axe-core run as part of Playwright e2e on every page; zero `serious` or `critical` violations.
- Keyboard-only operability for the entire happy path.


---


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
