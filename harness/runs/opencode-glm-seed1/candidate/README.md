# Library Lending Application

A library lending system for managing book lending, returns, late fines, and reservation queues.

## Quick Start

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both backend and frontend |
| `npm run build` | Type-check and build both workspaces |
| `npm run test:unit` | Run unit tests in both workspaces |
| `npm run test:bdd` | Run Cucumber BDD tests |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run test:all` | Run unit, BDD, then e2e tests |
| `npm run mutation` | Run Stryker mutation testing |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

## Architecture

- **Backend**: Express 5 + TypeScript + SQLite (better-sqlite3)
- **Frontend**: React 19 + Vite + TypeScript
- **Testing**: Vitest, Playwright, Cucumber, Stryker
- **Database**: SQLite with auto-migrations on startup

See `TECH-CONSTRAINTS.md` for the full technical specification.