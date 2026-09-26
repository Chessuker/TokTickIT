# Answer Part 3 — Test-Driven Development and Traceability

Link: [`docs/lab-03/tests.md`](tests.md) — rendered in full after this page: the planned tests (UNIT, API, UI, E2E, MIG) with their actual file paths and final status (§2), the acceptance-criterion traceability matrix (§3), the responsive checklist (§4), and the commands and results (§5).

---

## 1. Final run — every suite, nothing skipped

| Suite | Command | Files | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- | --- | --- |
| Backend — unit and API/integration | `npm run test:server` | 16 | 656 | 656 | 0 | 0 |
| Frontend — UI component | `npm run test:client` | 12 | 231 | 231 | 0 | 0 |
| End-to-end — Playwright | `npx playwright test` | 9 | 83 | 83 | 0 | 0 |
| **Total** | | **37** | **970** | **970** | **0** | **0** |

The verbatim output of each command is in [`test-runs/`](test-runs/) — `server.txt`, `client.txt`, `e2e.txt` — with terminal colour codes stripped and nothing else changed; each file's first two lines name the command, the branch and the commit it ran against. The images below are those files rendered by [`scripts/capture-test-runs.mjs`](scripts/capture-test-runs.mjs).

The end-to-end suite runs against the real stack (PostgreSQL migrated and seeded, the API on :5000, Vite on :5173):

```bash
docker compose up -d && npm run prisma:migrate && npm run prisma:seed && npm run test:e2e
```

---

## 2. Coverage by test level

| Level the sheet names | Where it lives | Tests |
| --- | --- | --- |
| **Unit** | `ticketWorkflow` (every status pair of the matrix, owner rule, timestamps) 172 · `queueQuery` 28 · `passwordPolicy` 10 · `session` 6 · `loginThrottle` 5 · `seed` 24 · `ticketNumber` 8 | 253 |
| **API / integration** | `auth` 36 · `staff-queue` 38 · `staff-ticket-detail` 52 · `comments-notes` 44 · `users-admin` 69 · `app` 9 | 248 |
| **Authorization** | `authorization.api.test.ts` 52 — every protected route without a session, every staff and admin route as the wrong role, tampered `requesterId`, revoked sessions — plus the role cases inside each API suite above | 52 |
| **Regression (Lab 2)** | `tickets.api` 64 and `attachments.api` 39 re-run on the session cookie; the Lab 2 component suites (`CreateTicketForm`, `MyTickets`, `TicketDetail`, `AppShell`); the Lab 2 E2E journeys `create-ticket`, `attachments`, `ownership` | 103 API + 9 E2E + component |
| **UI** | 12 component suites, 231 tests — every Lab 3 screen, its validation, busy, empty/no-results, forbidden, conflict and safe-failure states | 231 |
| **End-to-end** | `authentication` 11 · `requester-comments` 6 · `staff-queue` 6 · `staff-ticket-flow` 6 · `user-administration` 6 · `visual` 39 · Lab 2 journeys 9 | 83 |

Every acceptance criterion AC-01 … AC-34 maps to at least one of these tests (tests.md §3), and every one of the 109 planned test rows in tests.md §2 is **Pass**.

---

## 3. Backend — unit and API/integration

![npm run test:server](../../artifacts/lab-03/screenshots/evidence/test-server.png)

---

## 4. Frontend — UI component tests

![npm run test:client](../../artifacts/lab-03/screenshots/evidence/test-client.png)

---

## 5. End-to-end — Playwright

![npx playwright test](../../artifacts/lab-03/screenshots/evidence/test-e2e.png)

---

## 6. What the tests found

Tests written from the specification caught defects the code had shipped with — each fixed in the issue that found it:

| Found by | Defect |
| --- | --- |
| E2E-07 `visual.spec.ts` (V-03) | The queue at 820 px scrolled the whole page to 1009 px — a visually-hidden column label escaped the table wrapper; the open mobile header sheet ran to 466 px |
| E2E-07 contrast check (V-07) | The Cancelled badge measured 4.39:1, under the 4.5:1 the UI spec requires |
| Direct-API evidence (Part 7) | A malformed JSON body returned Express's HTML error page with a stack trace and server file paths (BR-30); now a JSON `400`, with a test |
| `staff-queue.spec.ts` (E2E-05) | Typing into the queue search right after "Clear filters" could be wiped when the delayed URL update arrived; now covered by a component test too |
| E2E-01 (Issue #37) | After logout the guard could leave `?from=` on `/login`; a fixed unknown email tripped the login throttle — proof BR-07 works |
