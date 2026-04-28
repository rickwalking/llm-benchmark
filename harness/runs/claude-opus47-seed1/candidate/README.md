# Library Lending

A small library lending application with two workspaces:

- `backend/` — Express 5 + TypeScript REST API on port `3001`, backed by SQLite (`better-sqlite3`).
- `frontend/` — React 19 + Vite + TypeScript UI on port `5173`.

## Prerequisites

- Node 22 LTS (`>=22.0.0 <23.0.0`)
- npm 10+

## Quick start

```bash
npm install
npm run dev
```

Visit <http://localhost:5173>. The backend will boot with seeded demo data the first time it runs (10 books, 5 members).

## Scripts (root)

| Script | Purpose |
|---|---|
| `npm run dev` | Run backend and frontend concurrently |
| `npm run build` | Type-check + compile both workspaces |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit tests (backend + frontend) |
| `npm run test:bdd` | Cucumber-driven Gherkin scenarios |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:all` | All test suites in order |
| `npm run mutation` | Stryker mutation testing |

## Architecture overview

- **`backend/src/policy/`** — pure functions for the business rules (loan limits, fine math, reservation timing). Constants live here only.
- **`backend/src/services/`** — DB-bound service layer that throws typed `DomainError` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`, `PaymentRequiredError`).
- **`backend/src/http/`** — Express routes + zod validation. Maps domain errors to HTTP status codes.
- **`backend/openapi.yaml`** — OpenAPI 3.1 spec; validated on boot.
- **`backend/migrations/`** — SQL migrations applied automatically.
- **`frontend/src/pages/`** — `/books`, `/books/:id`, `/members`, `/members/:id`, `/checkout`.

## Reset / dev helpers

The backend exposes a few `/api/dev/*` endpoints used by the e2e harness to simulate time and reset state. They are intentionally unauthenticated to keep the harness simple — do not deploy this code to production without removing them.

## Database

SQLite file lives at `backend/data/library.db` and is created on first run. It is in `.gitignore`. To reset, delete it.
