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
