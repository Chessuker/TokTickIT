# Lab 2 — Test Plan and Results

Companion to [specification.md](specification.md). Acceptance criteria referenced here (AC-01 …) are defined in section 9 of that document; the endpoints under test are specified in [api-spec.md](api-spec.md).

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
| API-01 | API | AC-01 | Create a ticket with valid data | `201 Created`; row persisted; ticket number returned | `server/tests/tickets.api.test.ts` | Pass |
| API-02 | API | AC-01, BR-02 | New ticket status | Status is `New` | `server/tests/tickets.api.test.ts` | Pass |
| API-03 | API | AC-01 | Create with missing required fields | `400` with field errors | `server/tests/tickets.api.test.ts` | Pass |
| API-04 | API | AC-04 | List tickets for a requester | Only that requester's tickets returned | `server/tests/tickets.api.test.ts` | Pass |
| API-05 | API | AC-03, BR-04 | Read another requester's ticket | `403 Forbidden` | `server/tests/tickets.api.test.ts` | Pass |
| API-06 | API | AC-10 | `search`, `category`, `status`, `sort`, `page`, `pageSize` | Correct subset, order and page metadata | `server/tests/tickets.api.test.ts` | Pass |
| API-12 | API | AC-14, BR-11 | `GET /api/requesters` | Active requesters only; inactive one absent | `server/tests/requesters.api.test.ts` | Pass |
| API-13 | API | AC-15 | Filter that matches nothing | `200` with an empty page and correct total | `server/tests/tickets.api.test.ts` | Pass |
| API-07 | API | AC-06, BR-06 | Upload a file larger than 5 MB | `413 Payload Too Large` | `server/tests/attachments.api.test.ts` | Pass |
| API-08 | API | AC-07, BR-05 | Upload a disallowed file type | `415 Unsupported Media Type` | `server/tests/attachments.api.test.ts` | Pass |
| API-09 | API | AC-08, BR-07 | Upload a 6th active attachment | Rejected with the limit error | `server/tests/attachments.api.test.ts` | Pass |
| API-10 | API | AC-09, BR-08 | Soft-remove an attachment with a reason | `200`; `isRemoved`, reason and timestamp set | `server/tests/attachments.api.test.ts` | Pass |
| API-11 | API | AC-09, BR-09 | Download a removed attachment | Rejected; file not served | `server/tests/attachments.api.test.ts` | Pass |
| API-14 | API | AC-09 | Soft-remove without a reason | `400`; attachment unchanged | `server/tests/attachments.api.test.ts` | Pass |
| UNIT-01 | Unit | BR-01, AD-01 | Ticket number generator | Matches `TKT-YYYY-XXXXXX`, restarts per year, never repeats | `server/tests/ticketNumber.test.ts` | Pass |
| UNIT-02 | Unit | AC-13, BR-12 | Seed run repeatedly | Later runs succeed; row counts unchanged; every write is an upsert on a unique key | `server/tests/seed.test.ts` | Pass |
| UNIT-03 | Unit | FR-08 | Seed content | 4 categories, ≥6 related systems, ≥4 active and ≥1 inactive requester | `server/tests/seed.test.ts` | Pass |
| UI-01 | UI | AC-02 | App opened with no requester selected | Redirect to the selector screen | `client/src/components/RequesterSelector.test.tsx` | Pass |
| UI-02 | UI | AC-14, BR-03 | Selector content | Only active users listed; the "not a real login" notice is shown | `client/src/components/RequesterSelector.test.tsx` | Pass |
| UI-03 | UI | AC-01 | Create Ticket form validation | Errors render under the offending fields; submit blocked | `client/src/components/CreateTicketForm.test.tsx` | Pass |
| UI-04 | UI | AC-04, AC-10 | My Tickets list | Rows render; search and filter update the list | `client/src/components/MyTickets.test.tsx` | Pass |
| UI-05 | UI | AC-05 | Ticket detail is read-only | No editable inputs rendered | `client/src/components/TicketDetail.test.tsx` | Pass |
| UI-06 | UI | AC-09 | Removal modal | Confirm disabled until a reason is entered | `client/src/components/TicketDetail.test.tsx` | Pass |
| UI-07 | UI | AC-02, FR-06, BR-13 | Change Requester | Switching requester re-fetches and shows only the new requester's tickets | `client/src/components/AppShell.test.tsx` | Pass |
| UI-08 | UI | AC-12, FR-07 | Create form on backend failure | Error callout shown; entered values still present in the form | `client/src/components/CreateTicketForm.test.tsx` | Pass |
| UI-09 | UI | AC-15 | Empty vs. no-results state | Correct distinct state rendered in each case | `client/src/components/MyTickets.test.tsx` | Pass |
| E2E-01 | E2E | AC-01, AC-05 | Full create flow | Ticket number shown, detail page opens with the same data | `e2e/create-ticket.spec.ts` | Pass |
| E2E-02 | E2E | AC-09 | Attachment lifecycle | Upload, download, soft-remove with reason; removed file no longer downloadable | `e2e/attachments.spec.ts` | Pass |
| E2E-03 | E2E | AC-03 | Ownership guard | Opening another requester's ticket shows access denied | `e2e/ownership.spec.ts` | Pass |
| E2E-04 | E2E | AC-02 | Select → change requester | Guard forces selection; switching requester swaps the visible ticket set | `e2e/requester-context.spec.ts` | Pass |

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
| R-01 | Requester Selection | Desktop ≥ 992 px | Pass | `docs/lab-02/screenshots/selector-desktop.png` |
| R-02 | Requester Selection | Mobile < 768 px | Pass | `docs/lab-02/screenshots/selector-mobile.png` |
| R-03 | Create Ticket | Desktop | Pass | `docs/lab-02/screenshots/create-desktop.png` |
| R-04 | Create Ticket | Tablet 768–991 px | Pass | `docs/lab-02/screenshots/create-tablet.png` |
| R-05 | Create Ticket | Mobile | Pass | `docs/lab-02/screenshots/create-mobile.png` |
| R-06 | My Tickets (table) | Desktop | Pass | `docs/lab-02/screenshots/list-desktop.png` |
| R-06b | My Tickets (table) | Tablet 768–991 px | Pass | `docs/lab-02/screenshots/list-tablet.png` |
| R-07 | My Tickets (cards) | Mobile | Pass | `docs/lab-02/screenshots/list-mobile.png` |
| R-08 | Ticket Detail | Desktop | Pass | `docs/lab-02/screenshots/detail-desktop.png` |
| R-08b | Ticket Detail | Tablet 768–991 px | Pass | `docs/lab-02/screenshots/detail-tablet.png` |
| R-09 | Ticket Detail | Mobile | Pass | `docs/lab-02/screenshots/detail-mobile.png` |
| R-10 | Removal modal | Mobile | Pass | `docs/lab-02/screenshots/remove-modal-mobile.png` |
| R-11 | Header / Change Requester | Mobile | Pass | `docs/lab-02/screenshots/header-mobile.png` |
| R-12 | My Tickets no-results state | Desktop | Pass | `docs/lab-02/screenshots/list-no-results.png` |

Each row is checked against the Visual Inspection Checklist in [ui-spec.md](ui-spec.md).

The six Create Ticket state screenshots required for Answer Part 6 (Issue #4) are collected in
[answer-part6-screenshots.md](answer-part6-screenshots.md), captured against the running stack and a seeded database.

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

### Issue #3 verification (Development Requester context)

`GET /api/requesters` is covered by API-12 against a mocked Prisma client, so it
runs without a database. The three Issue #3 screens were additionally exercised
by hand in the browser at 1280x720 and 375x812: the guard redirect, the amber
"not a real login" callout, the active-only dropdown, the disabled Continue
button, the loading and error/retry states, the header requester name, the
mobile compact menu, and a Jennifer Anderson to Sarah Johnson switch that
replaced the visible requester-scoped content. Docker was unavailable that day,
so the browser pass ran against a stub of `GET /api/requesters` rather than
PostgreSQL; the endpoint itself is only proven by API-12 until the next live
migrate/seed run.

### Issue #5 verification (My Tickets list)

`GET /api/tickets` is covered by API-04, API-06 and API-13 against a mocked
Prisma client, so the suite still runs without a database. The endpoint and the
screen were then exercised against the **live stack** on 2026-08-29 — PostgreSQL
16 in Docker, `prisma migrate deploy` + `prisma:seed`, the Express API on :5000
and Vite on :5173 — with 14 tickets created for Jennifer Anderson and 3 for
Sarah Johnson through the real `POST /api/tickets`, and Michael Brown left with
none so the empty state had a genuine subject.

Confirmed live: ownership isolation (Jennifer's 14 vs. Sarah's 3, and a
`requesterId` in the query string ignored), case-insensitive search on ticket
number and summary, Category and Status filters, `priority:desc` ordering High →
Medium → Low, page metadata across both pages, `200` with `totalItems: 0` for a
filter matching nothing, and `400 VALIDATION_FAILED` naming `pageSize` for an
out-of-range page size.

Responsive check (V-03), measured rather than eyeballed — `document.body.scrollWidth`
against the viewport width on the loaded list:

| Viewport | Layout rendered | Body scroll width | Horizontal overflow |
| --- | --- | --- | --- |
| 375 px | Card list | 375 px | 0 |
| 820 px | Table (scrolls in its own container) | 820 px | 0 |
| 1280 px | Table, all ten columns visible | 1280 px | 0 |

The Answer Part 7 screenshots are collected in
[answer-part7-screenshots.md](answer-part7-screenshots.md) and were captured by
`docs/lab-02/screenshots/capture-issue5.mjs` against that same live stack.

### Issue #6 verification (Ticket Detail and attachment lifecycle)

The seven attachment and ownership API tests run against a mocked Prisma client,
so the suite still needs no database — but the file system is deliberately *not*
mocked. `server/tests/attachments.api.test.ts` points `UPLOAD_DIR` at a
temporary folder and lets the route write and read real bytes, because "the file
reaches disk and comes back" is exactly what the download and soft-removal rules
are about. The suite also asserts that a refused upload leaves the directory
untouched, and that a soft-removed file is still on disk after the removal.

The stack was then exercised **live** on 2026-09-04 — PostgreSQL 16 on :5433,
the Express API on :5000 and Vite on :5173, seeded. `npm run test:e2e` drives
the real screens through Playwright and passed 6/6:

| E2E test | What it proves |
| --- | --- |
| E2E-02 upload → download → remove → refused | The whole lifecycle on one ticket, including a real file download whose bytes match what was uploaded |
| E2E-02 API-level refusal | After removal, `GET /api/attachments/:id/download` answers `403` while `GET /api/attachments/:id` still answers `200` with the reason and timestamp |
| E2E-02 disallowed type | A `.txt` upload is rejected and never appears in the list |
| E2E-03 access denied | Requester B opening Requester A's ticket URL gets the access-denied screen with no ticket data on the page |
| E2E-03 attachment ownership | Requester B gets `403` from both `GET /api/tickets/:id` and `GET /api/attachments/:id/download`, with no `Content-Disposition` |
| E2E-03 round trip | Switching back to the owner restores access to the same URL |

Peer review on the Issue #6 PR caught a real ordering bug: a file that was both
oversized **and** of a disallowed type answered `413` instead of the more
specific `415`. The check order in the route was right, but `multer`'s
`limits.fileSize` aborted the request before the route could look at the content
at all. The fix replaces that limit with a storage engine that retains the first
`5 MB + 1` bytes and counts the rest, so the type check always has the signature
and the size check always has the true byte count, with memory still bounded.
Six regression tests now pin the order, and the combinations were re-checked
over real HTTP against the running API:

| Request | Response |
| --- | --- |
| 6 MB `.txt`, no signature | `415 UNSUPPORTED_MEDIA_TYPE` |
| 6 MB valid PNG | `413 FILE_TOO_LARGE` |
| 50 MB valid PNG | `413 FILE_TOO_LARGE` |
| Small `.txt` | `415 UNSUPPORTED_MEDIA_TYPE` |
| 6 MB PNG into another requester's ticket | `403 FORBIDDEN` |
| Small valid PNG | `201 Created` |

The refused upload also drains the request body before answering. Without that
the socket is reset while the client is still sending, and a large refused file
surfaces as a network error rather than as the `403` or `404` it should be.

Confirmed live in addition: the type check reads the file's leading bytes rather
than its name or `Content-Type`, so an executable renamed to `.pdf` is refused
with `415`; stored files are written under a generated uuid name, so a file
picked as `../../etc/passwd.png` cannot escape the upload directory; and
`storagePath` never appears in any response body.

Responsive check (V-03) on the detail screen, measured rather than eyeballed —
`document.body.scrollWidth` against the viewport width:

| Viewport | Layout rendered | Body scroll width | Horizontal overflow |
| --- | --- | --- | --- |
| 375 px | Single-column fields, stacked attachment actions | 375 px | 0 |
| 1280 px | Four-column field grid | 1280 px | 0 |

The Answer Part 8 screenshots are collected in
[answer-part8-screenshots.md](answer-part8-screenshots.md) and were captured by
`docs/lab-02/screenshots/capture-issue6.mjs` against that same live stack.

### Issue #7 verification (UI refinement, responsive layout, end-to-end)

The two remaining end-to-end journeys were written and the suite now covers all
four: `create-ticket.spec.ts` (E2E-01) and `requester-context.spec.ts` (E2E-04)
join the attachment and ownership specs from Issue #6. Sixteen tests, all
passing against the live stack.

E2E-01 threads the server-generated ticket number through three screens: it is
read off the confirmation, then found again on the detail screen beside the same
summary, description, category and related system, and finally searched for in
My Tickets. E2E-04 covers both halves of AC-02 — every application route
redirects to the selector when no requester is chosen, and a requester switch
genuinely replaces the visible data rather than leaving the previous requester's
rows on screen.

**The UI pass was measured, not eyeballed.** A script walked all three screens at
1280 px, 820 px and 375 px and read the page rather than looking at it: body
scroll width against viewport width, every leaf element's `scrollWidth` against
its `clientWidth`, every form control's labelling, every button's height, and
the computed contrast ratio of each text-on-background pair. The results are in
the V-01 … V-10 table in [ui-spec.md](ui-spec.md). What it caught:

| Finding | Fix |
| --- | --- |
| Mobile controls between 28 px and 38 px tall — above the 24 px WCAG 2.2 floor but below what a thumb hits reliably | 44 px minimum on buttons, page numbers and the header toggle below 768 px, and the tap-target TBD in ui-spec §4 resolved at that number |
| The Create Ticket form ran one field per row at tablet width, so Category, Related System and Priority each claimed a full 800 px line | Two-column grid from 768 px, with Summary, Description and the upload area opting out via `zg-field-wide` |
| The header wrapped to two lines at 820 px, doubling its height | Nav and requester block pinned to one line; the small "Requester" caption is dropped at that width since the name below already says it |
| At tablet width the ticket number ran underneath the Created Date beside it | `.zg-table` minimum width raised from 56 rem to 66 rem — the page container's width — and the Ticket No. column widened from 12.5% to 13.5% |
| Pagination pushed Next onto a line of its own at 375 px | Previous and Next share the first row; the numbered pages drop below them |

Nothing was found for V-03 (no horizontal overflow at any of the nine
screen-and-width combinations), V-06 (no unlabelled control anywhere) or V-08
(every field error below its own control, in `#DC2626`, with a matching border).
The lowest contrast ratio measured anywhere is 4.83:1, on muted dates and the
italic _Unassigned_ placeholder, which clears the 4.5:1 AA requirement; the
status and priority badges range from 6.84:1 to 8.21:1.

The nine Answer Part 9 screenshots are collected in
[answer-part9-screenshots.md](answer-part9-screenshots.md) and were captured by
`docs/lab-02/screenshots/capture-issue7.mjs`, which prints the measured body
width beside every capture.

### Final run on `main`

| Suite | Command | Files | Tests | Passed | Failed | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Backend (unit + API) | `npm run test:server` | 6 | 130 | 130 | 0 | 2026-09-05 |
| Frontend (component) | `npm run test:client` | 6 | 80 | 80 | 0 | 2026-09-05 |
| End-to-end | `npm run test:e2e` | 4 | 16 | 16 | 0 | 2026-09-05 |
| **Total** | | **16** | **226** | **226** | **0** | 2026-09-05 |

The raw output of all three commands is kept verbatim in [`test-runs/`](test-runs/) and rendered for Answer Part 3 as `docs/lab-02/screenshots/part3-test-server.png`, `part3-test-client.png` and `part3-test-e2e.png`.

The end-to-end suite needs the stack up: `docker compose up -d`, `npm run prisma:migrate`, `npm run prisma:seed`. `playwright.config.ts` starts the API and Vite itself (reusing them if they are already running) but never the database, so a run cannot silently pass against an empty schema.

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
