# Rubric — API Design

## Definition

Measures the quality of the HTTP API as a contract: resource modeling, URL shape,
status code correctness, request/response payload design, error format consistency, and
the OpenAPI document's faithfulness to the implementation.

Does **not** measure: implementation details below the route handler (see
`architecture.md`), test coverage (objective), or business-logic correctness
(measured by e2e + BDD).

## Evidence the judge receives

- `backend/openapi.yaml` (full).
- The route registration file (e.g., `backend/src/routes/index.ts`).
- Two representative handler files (the loan and reservation services / handlers).
- The error-handling middleware.
- Output of `npx swagger-cli validate backend/openapi.yaml`.
- Output of a small probe script that hits each endpoint and reports actual status codes,
  for comparison against the spec.

## Anchored rubric

### 1 — Broken contract
- OpenAPI is missing, invalid, or describes endpoints that don't exist.
- Status codes are wrong (e.g., 200 for "loan limit reached", 500 for validation errors).
- Inconsistent error shape across endpoints (sometimes `{error}`, sometimes `{message}`, sometimes plain string).
- URL shape mixes patterns ("`/api/borrowBook`" alongside "`/api/loans`").

### 2 — Functional but messy
- OpenAPI exists and is valid but doesn't match the implementation in places (missing endpoints, wrong response schemas).
- Status codes are mostly correct but some negative ACs return 400 generically instead of the specified 402/403/409.
- Error format is consistent within the implementation but not described in the OpenAPI.
- Some endpoints accept loose input (no zod validation) and return 500 on bad payloads.

### 3 — Reasonable
- OpenAPI is valid, complete (every endpoint present), and matches the implementation for status codes, response shapes, and error format.
- All status codes match the spec in `REQUIREMENTS.md` exactly.
- Single error shape: `{"error": "<message>"}` or similar, documented in OpenAPI.
- Resources and URLs follow REST conventions: nouns, plural, hierarchical (`/api/loans/:id/return`), no verbs.
- All bodies validated with zod; invalid bodies return 400 with field-level error info.

### 4 — Well-designed
- Everything in 3, plus:
- Consistent use of HTTP semantics: PATCH vs PUT distinguished correctly if both are used; idempotent operations marked as such.
- Response envelopes are predictable and minimal: lists return arrays (or `{items: [...], total}` consistently), single resources return the resource, mutations return the resulting resource.
- Error responses include a stable `code` field (e.g., `"LOAN_LIMIT_REACHED"`) for programmatic handling, not just a human message.
- Pagination is *not* implemented (it's out of scope) AND the API doesn't pretend it is — no fake `total` fields that always return the array length.
- OpenAPI describes meaningful examples for at least each negative AC.

### 5 — Disciplined
- Everything in 4, plus:
- The OpenAPI is the source of truth: the response schemas are tight (no extra `additionalProperties: true` escape hatches; field types are exact, not `string|null` everywhere).
- Domain errors map cleanly to HTTP via a single error class hierarchy and a single middleware. The judge can read the error mapping in one place.
- The `expireStaleReservations` operation is exposed thoughtfully: triggered idempotently from relevant reads (per AC-5.5) AND available as an explicit POST for the harness, without leaking into the wrong layer.
- The probe script's actual responses match the OpenAPI examples *exactly*, byte-for-byte where possible (timestamps and IDs aside).

## Notes for judges

- A swagger-cli validation failure caps the score at 2.
- Status code mismatches against `REQUIREMENTS.md` are heavily weighted: each is at least one anchor down.
- Do not reward extra features (auth, pagination, GraphQL alongside REST). Scope creep lowers a 4 to a 3.
- "Beautiful URLs" with no consistency are worse than ugly URLs that follow a rule.
