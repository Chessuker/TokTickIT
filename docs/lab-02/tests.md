# Lab 2 — Test Plan and Results

Companion to [specification.md](specification.md). Acceptance criteria referenced here (AC-01 …) are defined in section 9 of that document.

---

## 1. Test Strategy

| Level | Tooling | What it covers |
| --- | --- | --- |
| Unit | Vitest | Pure logic: ticket-number generation, attachment validation (type, size, count), query/pagination helpers. |
| Integration / API | Vitest + Supertest | Express routes end-to-end against the app, including status codes, validation, and ownership enforcement. |
| UI Component | Vitest + React Testing Library | Rendering, form validation, guard/redirect behaviour, list and detail states. |
| End-to-End | Playwright | Full user journeys across real screens: select requester → create ticket → view list → open detail → manage attachments. |

Unit and component tests run without a live database: the API suite mocks `src/db.js`, and the seed suite drives `seed()` against an in-memory client that implements `upsert` only — so a seed that reached for `create` or `deleteMany` would fail the suite instead of silently duplicating rows. Integration against real PostgreSQL is verified manually with the migrate/seed commands in section 5.

---

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-01 | Create a ticket with valid data | `201 Created`; row persisted; ticket number returned | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-02 | API | AC-01, BR-02 | New ticket status | Status is `New` | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-03 | API | AC-01 | Create with missing required fields | `400` with field errors | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-04 | API | AC-04 | List tickets for a requester | Only that requester's tickets returned | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-05 | API | AC-03, BR-04 | Read another requester's ticket | `403 Forbidden` | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-06 | API | AC-10 | `search`, `category`, `status`, `sort`, `page`, `pageSize` | Correct subset, order and page metadata | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-12 | API | AC-14, BR-11 | `GET /api/requesters` | Active requesters only; inactive one absent | `server/tests/requesters.api.test.ts` | _TBD_ |
| API-13 | API | AC-15 | Filter that matches nothing | `200` with an empty page and correct total | `server/tests/tickets.api.test.ts` | _TBD_ |
| API-07 | API | AC-06, BR-06 | Upload a file larger than 5 MB | `413 Payload Too Large` | `server/tests/attachments.api.test.ts` | _TBD_ |
| API-08 | API | AC-07, BR-05 | Upload a disallowed file type | `415 Unsupported Media Type` | `server/tests/attachments.api.test.ts` | _TBD_ |
| API-09 | API | AC-08, BR-07 | Upload a 6th active attachment | Rejected with the limit error | `server/tests/attachments.api.test.ts` | _TBD_ |
| API-10 | API | AC-09, BR-08 | Soft-remove an attachment with a reason | `200`; `isRemoved`, reason and timestamp set | `server/tests/attachments.api.test.ts` | _TBD_ |
| API-11 | API | AC-09, BR-09 | Download a removed attachment | Rejected; file not served | `server/tests/attachments.api.test.ts` | _TBD_ |
| API-14 | API | AC-09 | Soft-remove without a reason | `400`; attachment unchanged | `server/tests/attachments.api.test.ts` | _TBD_ |
| UNIT-01 | Unit | BR-01, AD-01 | Ticket number generator | Matches `TKT-YYYY-XXXXXX`, restarts per year, never repeats | `server/tests/ticketNumber.test.ts` | Pass |
| UNIT-02 | Unit | AC-13, BR-12 | Seed run repeatedly | Later runs succeed; row counts unchanged; every write is an upsert on a unique key | `server/tests/seed.test.ts` | Pass |
| UNIT-03 | Unit | FR-08 | Seed content | 4 categories, ≥6 related systems, ≥4 active and ≥1 inactive requester | `server/tests/seed.test.ts` | Pass |
| UI-01 | UI | AC-02 | App opened with no requester selected | Redirect to the selector screen | `client/src/components/RequesterSelector.test.tsx` | _TBD_ |
| UI-02 | UI | AC-14, BR-03 | Selector content | Only active users listed; the "not a real login" notice is shown | `client/src/components/RequesterSelector.test.tsx` | _TBD_ |
| UI-03 | UI | AC-01 | Create Ticket form validation | Errors render under the offending fields; submit blocked | `client/src/components/CreateTicketForm.test.tsx` | _TBD_ |
| UI-04 | UI | AC-04, AC-10 | My Tickets list | Rows render; search and filter update the list | `client/src/components/MyTickets.test.tsx` | _TBD_ |
| UI-05 | UI | AC-05 | Ticket detail is read-only | No editable inputs rendered | `client/src/components/TicketDetail.test.tsx` | _TBD_ |
| UI-06 | UI | AC-09 | Removal modal | Confirm disabled until a reason is entered | `client/src/components/TicketDetail.test.tsx` | _TBD_ |
| UI-07 | UI | AC-02, FR-06, BR-13 | Change Requester | Switching requester re-fetches and shows only the new requester's tickets | `client/src/components/AppShell.test.tsx` | _TBD_ |
| UI-08 | UI | AC-12, FR-07 | Create form on backend failure | Error callout shown; entered values still present in the form | `client/src/components/CreateTicketForm.test.tsx` | _TBD_ |
| UI-09 | UI | AC-15 | Empty vs. no-results state | Correct distinct state rendered in each case | `client/src/components/MyTickets.test.tsx` | _TBD_ |
| E2E-01 | E2E | AC-01, AC-05 | Full create flow | Ticket number shown, detail page opens with the same data | `e2e/create-ticket.spec.ts` | _TBD_ |
| E2E-02 | E2E | AC-09 | Attachment lifecycle | Upload, download, soft-remove with reason; removed file no longer downloadable | `e2e/attachments.spec.ts` | _TBD_ |
| E2E-03 | E2E | AC-03 | Ownership guard | Opening another requester's ticket shows access denied | `e2e/ownership.spec.ts` | _TBD_ |
| E2E-04 | E2E | AC-02 | Select → change requester | Guard forces selection; switching requester swaps the visible ticket set | `e2e/requester-context.spec.ts` | _TBD_ |

---

## 3. Acceptance-Criterion Traceability Matrix

| AC | Description (short) | Covered by |
| --- | --- | --- |
| AC-01 | Create ticket, number returned | API-01, API-02, API-03, UI-03, E2E-01 |
| AC-02 | Guard when no requester selected + reload on change | UI-01, UI-07, E2E-04 |
| AC-03 | Ownership violation rejected | API-05, E2E-03 |
| AC-04 | List scoped to the requester | API-04, UI-04 |
| AC-05 | Detail is read-only | UI-05, E2E-01 |
| AC-06 | Oversized upload rejected | API-07 |
| AC-07 | Wrong file type rejected | API-08 |
| AC-08 | Attachment count limit | API-09 |
| AC-09 | Soft removal with reason | API-10, API-11, API-14, UI-06, E2E-02 |
| AC-10 | Search / filter / sort / pagination | API-06, UI-04 |
| AC-11 | Responsive layout | Section 4 checklist |
| AC-12 | Form values preserved on backend failure | UI-08 |
| AC-13 | Seed is idempotent | UNIT-02 |
| AC-14 | Inactive requesters hidden | API-12, UI-02 |
| AC-15 | No-results state distinct from empty state | API-13, UI-09 |

---

## 4. Responsive and Visual Checklist

| # | Screen | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| R-01 | Requester Selection | Desktop ≥ 992 px | _TBD_ | `docs/lab-02/screenshots/selector-desktop.png` |
| R-02 | Requester Selection | Mobile < 768 px | _TBD_ | `docs/lab-02/screenshots/selector-mobile.png` |
| R-03 | Create Ticket | Desktop | _TBD_ | `docs/lab-02/screenshots/create-desktop.png` |
| R-04 | Create Ticket | Tablet 768–991 px | _TBD_ | `docs/lab-02/screenshots/create-tablet.png` |
| R-05 | Create Ticket | Mobile | _TBD_ | `docs/lab-02/screenshots/create-mobile.png` |
| R-06 | My Tickets (table) | Desktop | _TBD_ | `docs/lab-02/screenshots/list-desktop.png` |
| R-07 | My Tickets (cards) | Mobile | _TBD_ | `docs/lab-02/screenshots/list-mobile.png` |
| R-08 | Ticket Detail | Desktop | _TBD_ | `docs/lab-02/screenshots/detail-desktop.png` |
| R-09 | Ticket Detail | Mobile | _TBD_ | `docs/lab-02/screenshots/detail-mobile.png` |
| R-10 | Removal modal | Mobile | _TBD_ | `docs/lab-02/screenshots/remove-modal-mobile.png` |
| R-11 | Header / Change Requester | Mobile | _TBD_ | `docs/lab-02/screenshots/header-mobile.png` |
| R-12 | My Tickets no-results state | Desktop | _TBD_ | `docs/lab-02/screenshots/list-no-results.png` |

Each row is checked against the Visual Inspection Checklist in [ui-spec.md](ui-spec.md).

---

## 5. Test Commands and Final Results

```bash
npm run test:server
```

```bash
npm run test:client
```

```bash
npm run test:e2e
```

### Migration and seed (Issue #2, run against a live PostgreSQL)

```bash
npm --prefix server run prisma:migrate
```

```bash
npm --prefix server run prisma:seed
```

Verified on 2026-08-22 against PostgreSQL 16.15 (Docker, `docker compose up -d`). The seed was run **three** times in a row; every run succeeded and the row counts were identical each time:

| Entity | Rows after run 1 | after run 2 | after run 3 |
| --- | --- | --- | --- |
| `Category` | 4 | 4 | 4 |
| `RelatedSystem` | 7 | 7 | 7 |
| `RequesterUser` (active) | 4 | 4 | 4 |
| `RequesterUser` (inactive) | 1 | 1 | 1 |
| `User` (Lab 1 admin) | 1 | 1 | 1 |

Both migrations applied cleanly (`20260808160909_init`, `20260822000000_lab02_requester_ticketing`), and the resulting `Ticket` table carries all six planned indexes plus the three foreign keys with the intended `Restrict` / `SetNull` / `Cascade` behaviour. AC-13 met.

### Final run on `main`

| Suite | Command | Files | Tests | Passed | Failed | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Backend (unit + API) | `npm run test:server` | 3 | 24 | 24 | 0 | 2026-08-22 |
| Frontend (component) | `npm run test:client` | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| End-to-end | `npm run test:e2e` | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

_Raw output / evidence: TBD._

---

## 6. Issue Coverage

| Issue | Covered by tests |
| --- | --- |
| #2 Database Schema & Idempotent Seed | UNIT-02, UNIT-03 |
| #3 Requester Context & Simulated Login | API-12, UI-01, UI-02, UI-07, E2E-04 |
| #4 Ticket Creation API & UI | UNIT-01, API-01, API-02, API-03, UI-03, UI-08, E2E-01 |
| #5 My Tickets List | API-04, API-05, API-06, API-13, UI-04, UI-09, E2E-03 |
| #6 Ticket Detail & Attachment Lifecycle | API-05, API-07 … API-11, API-14, UI-05, UI-06, E2E-02 |
| #7 UI Refinement, Responsive & E2E | Section 4 checklist, E2E-01 … E2E-04 |
