# Lab 1 — Automated Test Documentation

## 1. Test Environment Overview

| Layer | Tool | Notes |
| --- | --- | --- |
| Frontend | Vitest + React Testing Library | Component tests for `client/src/components/CategoryList.tsx`, run in jsdom with `fetch` stubbed via `vi.stubGlobal`. |
| Backend | Vitest + Supertest | API integration tests for `server/src/app.ts`, with `prisma` mocked via `vi.mock('../src/db.js')` so no live database is required. |

## 2. Test Results Summary

| Test File | Tool | Test Description | Status |
| --- | --- | --- | --- |
| server/tests/app.test.ts | Supertest | `GET /api/health` returns 200 with `status: "ok"`, `service: "TokTickIT API"`, and `database: "CONNECTED"` when the DB is reachable. | Pass |
| server/tests/app.test.ts | Supertest | `GET /api/health` returns 503 with `status: "error"` and `database: "UNREACHABLE"` when the DB call rejects. | Pass |
| server/tests/app.test.ts | Supertest | `GET /api/users` returns the list of seeded users. | Pass |
| server/tests/app.test.ts | Supertest | `POST /api/users` creates a new user and returns 201. | Pass |
| server/tests/app.test.ts | Supertest | `POST /api/users` returns 400 with `"Email is required"` when `email` is missing. | Pass |
| server/tests/app.test.ts | Supertest | `GET /api/categories` returns categories ordered by name (`orderBy: { name: 'asc' }`). | Pass |
| server/tests/app.test.ts | Supertest | `GET /api/categories` returns 500 with `"Failed to fetch categories"` when the DB call fails. | Pass |
| client/src/components/CategoryList.test.tsx | Vitest | Shows the "Loading categories..." state while the fetch request is in flight. | Pass |
| client/src/components/CategoryList.test.tsx | Vitest | Renders the categories returned by the API and hides the loading state. | Pass |
| client/src/components/CategoryList.test.tsx | Vitest | Shows "Failed to load categories. Please try again." when the API call fails. | Pass |

**Result:** 2 test files, 10 tests total, all passing (7 backend / 3 frontend), verified locally on 2026-08-13.

## 3. How to Run

```bash
# Backend (Supertest, mocked Prisma — no live DB needed)
npm run test:server
# or: cd server && npm test

# Frontend (Vitest + React Testing Library)
npm run test:client
# or: cd client && npm test
```
