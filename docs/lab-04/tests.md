# Lab 4 — Test Plan and Results

Companion to [specification.md](specification.md). Acceptance criteria (AC-01 …) are in §9 of that document, business rules (BR-) in §5, endpoints in [api-spec.md](api-spec.md), screens and visual items (V-) in [ui-spec.md](ui-spec.md). This plan was written with the contract, before implementation. The **Final Status** column is filled in as each Issue merges and must reflect the run on `main` at submission (`Planned` until then).

---

## 1. Test Strategy

| Level | Tooling | What it covers |
| --- | --- | --- |
| Unit | Vitest | Pure modules: Action field and follow-up rules (`actionRules.ts`), the resolution gate (`resolutionGate.ts`), the transition matrix with the gate, dashboard metric definitions (count `where` and drill-down `href` built from one definition), list and queue query parsers, Bangkok date helpers, seed idempotence against the in-memory fake client, and a static check that history and Actions have no delete/update-history path. |
| API / integration | Vitest + Supertest | Every Lab 4 endpoint and every changed Lab 3 endpoint against the Express app with `src/db.js` mocked (Lab 2/3 pattern): status codes, error codes, `fields`, `unmet`, `current.version`, ordering, scoping and the authorization matrix row by row. |
| Integration (database) | `tsx` scripts against PostgreSQL | What a mock cannot prove: dashboard counts equal raw SQL on the seeded database (INT-01), the conditional-update race (INT-02), the `CHECK` constraint (INT-03), migration and rollback (MIG-01 … MIG-03). |
| UI component | Vitest + React Testing Library + user-event | Dashboards, Actions Taken modes, workflow gate hint, history, shell navigation, URL-driven filters, feedback states, single submission. |
| UI style / responsive / accessibility | Playwright DOM measurements + screenshots | V-01 … V-20 at 1280 / 820 / 375 px: overflow, focus, labels, contrast, accessible names of metric cards, dialog focus. |
| Workflow / authorization | Supertest + Playwright | Every matrix pair, the gate, stale updates across two browser contexts, cross-role and unauthenticated calls. |
| Migration / regression | Scripts + all Lab 2/3 suites | Additive migration on a Lab 3 database, rollback, re-apply; every earlier suite re-run unchanged except for the documented role-home change. |
| Performance smoke | `tsx` script | 20 requests per dashboard and Actions list on the seeded local stack; p95 and payload size (AC-30). Not a load test. |
| End-to-end | Playwright | Real logins for each role through the real screens against a migrated and seeded PostgreSQL. |

Placement follows the handout (§12): `server/tests/lab-04/`, `client/src/components/lab-04/` (components beside their tests, as in Labs 2–3), `e2e/lab-04/`, scripts in `server/scripts/`.

Accounts come from the seed (specification.md §7 and root README): Jennifer (Requester with Tickets), **Ploy** (Requester with no Tickets), Nattapong / Priya / Chen (IT Staff), Robert (inactive IT Staff), `admin@toktickit.xyz`. E2E helpers log in through the Login screen, and the seed is re-run before every E2E run.

---

## 2. Planned Tests

The handout's example rows keep their ids: **API-03** (create a valid Action, AC-01) and **E2E-02** (AC-03).

### Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-05, AC-04 | Action field rules: missing/empty/whitespace description and result, lengths at 0/1/max/max+1, `actionAt` missing, unparsable, +4 min, +6 min, before Ticket `createdAt`; attachment notes 500/501 and `""` → `null` | Exactly the failing field named in `fields`; valid input normalised (trimmed) | `server/tests/lab-04/actionRules.test.ts` | Pass |
| UNIT-02 | Unit | BR-06, BR-07, AC-07 | Follow-up rules: required ⇒ note + assignee; not required with note/assignee given; open → Completed/Cancelled; closed → anything; required true → false; false → true on edit | Accepted / `400` field / `409` reason exactly per BR-06/BR-07 | `server/tests/lab-04/actionRules.test.ts` | Pass |
| UNIT-03 | Unit | BR-14, BR-17, AC-12, AC-13 | Resolution gate: every combination of owner / actions since reopen / open follow-ups; never-reopened vs reopened with older and newer Actions | `ok` only when all three hold; `unmet` lists exactly the failing ones, in fixed order | `server/tests/lab-04/resolutionGate.test.ts` | Planned |
| UNIT-04 | Unit | BR-13, BR-14, AC-14 | Transition matrix (L3 UNIT-02 retained) plus `permittedTransitions` with the gate closed and open | Matrix unchanged from Lab 3; `Resolved` omitted iff the gate is closed | `server/tests/lab-03/ticketWorkflow.test.ts` (extended) | Planned |
| UNIT-05 | Unit | BR-22 … BR-27, AC-19, AC-20 | Dashboard metric definitions: each metric's Prisma `where` and its `href` produced from one definition; active-status set; Administrator nulls | Snapshot of `where` + `href` per metric; the queue/list parser re-reads each `href` into the same filter | `server/tests/lab-04/dashboardMetrics.test.ts` | Planned |
| UNIT-06 | Unit | AC-20 | Requester list parser: repeatable `status`, single `status` (Lab 2 compatibility), invalid value, `sort=updatedAt:desc` | Parsed list / `400 fields.status` | `server/tests/lab-04/ticketListQuery.test.ts` | Planned |
| UNIT-07 | Unit | AC-20 | Queue parser: `followUp=mine`, `requesterResolved=true`, invalid values, combination with Lab 3 parameters | Parsed / `400` naming the parameter | `server/tests/lab-03/queueQuery.test.ts` (extended) | Planned |
| UNIT-08 | Unit | BR-30, AC-25 | Seed run twice against the upsert-only fake client | No `create`/`delete*` calls; same keys both runs; Tickets with 0, 1 and ≥ 3 Actions; at least one open follow-up per active IT Staff; Ploy has no Tickets | `server/tests/seed.test.ts` (extended) | Pass |
| UNIT-09 | Unit | BR-08, BR-18, AC-16 | Static check of `server/src/**`: no `ticketStatusChange.update*` / `delete*`, no `ticketAction.delete*` | No match | `server/tests/lab-04/appendOnly.test.ts` | Pass |
| UNIT-10 | Unit | BR-25, AD-11 | `formatBangkok` and `toUtcIso` across midnight UTC and month end | `2026-10-02T17:30Z` → "3 Oct 2026, 00:30"; round trip exact | `client/src/components/lab-04/dates.test.ts` | Planned |

### API — Actions Taken (`server/tests/lab-04/actions-taken.api.test.ts`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-11, BR-11 | `GET /api/staff/tickets/:id/actions` as IT Staff and Administrator with Actions sharing `actionAt` | `200`; `orderBy` = `actionAt desc, createdAt desc, id asc`; Action shape incl. `followUp` block | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-02 | API | AC-03, AC-08, BR-04 | `GET /api/tickets/:id/actions` as owner Requester, other Requester, IT Staff; unknown id as staff | `200` same shape / `403` no data / `200` / `404` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-03 | API | AC-01 | Create a valid Actions Taken with follow-up | `201`; created under the correct Ticket; `performedBy` = session user; follow-up `Open` with the approved assignee; `Ticket.updatedAt` touched, `Ticket.version` not | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-04 | API | AC-05, BR-02, BR-03 | Create by IT Staff who is not the owner; body carries `performedById`, `ticketId`, `followUpStatus`, `version` | `201`; performer = caller; owner unchanged; injected fields ignored | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-05 | API | AC-04, BR-05, BR-06 | Create with each invalid field (UNIT-01 cases end to end) and follow-up without note / assignee | `400 VALIDATION_FAILED` with the right `fields` key; nothing written | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-06 | API | AC-07, BR-06 | Follow-up assignee = inactive IT Staff (Robert), a Requester, an Administrator, unknown uuid; reassign to the same on PATCH | `400 fields.followUpAssigneeId` in every case | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-07 | API | AC-06, BR-08 | PATCH description/result/actionAt/attachmentNotes with the current `version` | `200`; `version + 1`; `updatedBy` = caller; `performedBy`, `ticketId`, `createdAt` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-08 | API | AC-06, BR-19 | PATCH with an old `version`; PATCH without `version` | `409 STALE_UPDATE` with `current.version` and nothing written / `400 fields.version` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-09 | API | AC-07, BR-07 | PATCH `followUpStatus` Completed; Cancelled; on a closed follow-up; `followUpRequired: false`; opening a follow-up on an Action without one; editing note of a closed follow-up | `200` stamps closer/time / `200` / `409` / `400` / `200` Open / `409` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-10 | API | AC-09, BR-09 | Create and PATCH on Resolved, Closed, Cancelled Tickets | `409 TICKET_LOCKED`; nothing written | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-11 | API | AC-08, BR-04 | Requester POST and PATCH (own Ticket); no session on all three routes; Administrator POST and PATCH | `403` / `401` / `201`, `200` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-12 | API | AC-10, BR-10 | Same `clientRequestId` twice by the same user; by another user; on another Ticket; unique-violation race | `201` then `200` same Action / `409` / `409` / `200` existing | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-13 | API | BR-01 | PATCH an Action through another Ticket's URL; `DELETE` on an Action | `404` / `404` (no delete route) | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |

### API — Ticket workflow (`server/tests/lab-04/ticket-workflow.api.test.ts`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-14 | API | AC-12, BR-14 | Resolve an owned Ticket with zero Actions | `409 RESOLUTION_BLOCKED`, `unmet: ["ACTION_SINCE_REOPEN"]`; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-15 | API | AC-12, BR-14 | Resolve with an open follow-up; complete it; resolve again. `GET` detail before and after | `409 unmet: ["OPEN_FOLLOW_UPS"]` → `200`; `permittedTransitions` lacks then has `Resolved`; `resolutionGate` matches | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-16 | API | AC-13, BR-17 | Reopened Ticket whose only Actions predate the reopen; then one new Action | `409 ACTION_SINCE_REOPEN` → `200` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-17 | API | AC-14, BR-13 | Representative allowed and refused pairs through the API (full matrix in UNIT-04); unassigned Resolve keeps the Lab 3 answer | Allowed `200`; refused `409 INVALID_TRANSITION`; unassigned → L3 `409 INVALID_TRANSITION` (owner) unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-18 | API | AC-17, BR-19 | Claim, owner, it-priority, status with stale `expectedVersion`; with current; without; non-integer | `409 STALE_UPDATE` + `current.version` / `200` and `version + 1` / `200` (Lab 3 behaviour) / `400` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-19 | API | AC-16, BR-18 | History rows written on status change, on claim of a New Ticket (auto Open), on assign of New, on Cancel; `GET /api/tickets/:id/history` as owner, other Requester, IT Staff | One row each, in the same transaction, correct from/to/actor; `200` oldest first with `createdAt`/`createdBy` / `403` / `200` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-20 | API | AC-18, BR-16 | Cancel a Ticket holding two open and one completed follow-up | Two become `Cancelled` with closer = canceller; completed untouched | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-21 | API | AC-15, BR-15 | Requester resolution indication on own active Ticket; Requester `PATCH status` | `200`, status unchanged, `requesterResolvedAt` set / `403` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-22 | API | AC-14, BR-13 | Administrator status / owner / it-priority / claim; Administrator Action create | `403` ×4 / `201` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |

### API — Requester dashboard (`server/tests/lab-04/requester-dashboard.api.test.ts`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-23 | API | AC-02, BR-21, BR-22 | Metric counts for a Requester with Tickets in every status | Each count = fixture count for that user; `generatedAt` present; one `$transaction` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-24 | API | AC-02, BR-23 | Every count and list query carries `requesterId = session user`; `?requesterId=<other>` ignored | No query without the session `requesterId`; other Requesters' Tickets never returned | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-25 | API | AC-23, BR-25 | Lists: order, length cap 5, `DashboardTicket` shape (no description) | As specified | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-26 | API | AC-21, BR-26 | Requester with no Tickets | All counts `0` (present, not omitted); lists `[]`; `totalTickets: 0` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-27 | API | AC-21 | IT Staff / Administrator / no session call the Requester dashboard | `403` / `403` / `401` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-28 | API | AC-20, BR-27 | `GET /api/tickets` with each card's `href` query | `pagination.totalItems` equals the card count | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |

### API — Staff dashboard (`server/tests/lab-04/staff-dashboard.api.test.ts`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-29 | API | AC-19, BR-22 | `unassigned`, `requesterReportsResolved`, `byStatus`, `byItPriority` | Match fixture; inactive statuses excluded where defined | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-30 | API | AC-19, BR-24 | `mine`, `myFollowUps` (+ `ticketCount`), `myRecentActions` for two different IT Staff | Scoped to the caller; follow-ups on terminal Tickets not counted | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-31 | API | AC-19, BR-24 | Administrator variant | `viewer: Administrator`; `mine`, `myFollowUps` `null`; `users` block correct | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-32 | API | AC-21 | Requester / no session | `403` / `401` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-33 | API | AC-20, BR-27 | `GET /api/staff/tickets` with each card's `href` query (incl. `followUp=mine`, `requesterResolved=true`); `followUp=mine` as Administrator | `totalItems` equals the count (`ticketCount` for follow-ups) / `400` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-34 | API | AC-19, BR-25 | `urgent` and `recentlyUpdated` order and cap | As specified | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-35 | API | AC-30 | Response size and content of both dashboards on the full fixture | < 10 KB; no `description`, comment or note bodies | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |

### API — Regression and safe failure (`server/tests/lab-04/regression.api.test.ts`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-36 | API | AC-26, FR-12 | Every Lab 2 and Lab 3 server suite, re-run in the same `npm run test:server` | All pass; the only edits to them are documented in §5 | `server/tests/*.test.ts`, `server/tests/lab-03/*.test.ts` | Planned |
| API-37 | API | AC-31 | `GET /api/health` with the db mock resolving / rejecting | `200 CONNECTED` / `503 UNREACHABLE` | `server/tests/lab-04/regression.api.test.ts` | Planned |
| API-38 | API | AC-27, BR-28 | Each Lab 4 route with the db mock throwing | `500 INTERNAL_ERROR`, generic message, `correlationId`, no stack/SQL | `server/tests/lab-04/regression.api.test.ts` | Planned |

### Integration against PostgreSQL

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| INT-01 | Integration | AC-19, AC-02, BR-21 | On the seeded database, call both dashboards (as Jennifer, Ploy, Priya, admin) and run the raw SQL for every metric | Every API value equals its SQL value; output saved for Answer Part 5 | `server/scripts/verify-lab04-dashboards.ts` | Planned |
| INT-02 | Integration | AC-17, BR-19 | Two concurrent status PATCHes with the same `expectedVersion` | Exactly one `200`, one `409 STALE_UPDATE`; one history row | `server/scripts/verify-lab04-concurrency.ts` | Planned |
| INT-03 | Integration | BR-06, DB-03 | Raw `INSERT` violating the follow-up `CHECK` | Rejected by PostgreSQL | `server/scripts/verify-lab04-concurrency.ts` | Pass |

### UI component (`client/src/components/lab-04/`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | AC-11, AC-03 | Actions list: columns, server order kept, "Owner" tag, follow-up badges, inactive assignee flag, caption "Visible to the requester" | Rendered from mocked data | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-02 | UI | AC-04 | Create mode: required fields, follow-up switch reveals note + assignee, server `fields` mapped, values kept on error | Errors under the right fields; values preserved | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-03 | UI | AC-10 | Save double-clicked; retry after network error | One `fetch`; the same `clientRequestId` on the retry; busy state | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-04 | UI | AC-06 | Edit mode prefilled; Performed by read-only; PATCH carries `version`; `409 STALE_UPDATE` | Callout + Reload; typed edits kept | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-05 | UI | AC-07 | Mark done / cancel follow-up with confirm; switch disabled when on; closed follow-up fields disabled | Correct PATCH body; UI state per ui-spec §3.3 | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-06 | UI | AC-03, AC-08 | Requester "Work done by IT": entries shown, no buttons; empty text | As stated | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-07 | UI | AC-09 | Locked Ticket: no Record button, hint shown; late `409 TICKET_LOCKED` switches panel to read-only | As stated | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-08 | UI | AC-27 | Network failure on create and edit | Safe-failure callout focused; values kept; Retry works | `client/src/components/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-09 | UI | AC-12, AC-14 | Status select lists only `permittedTransitions`; gate hint bullets for each `unmet` value link to the fix | As stated | `client/src/components/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-10 | UI | AC-14, AC-16 | Successful status change refreshes header badge, operations card, tab counts and History without reload; Cancel dialog mentions open follow-ups | As stated | `client/src/components/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-11 | UI | AC-17 | `409 STALE_UPDATE` on status/owner/IT Priority sends `expectedVersion`, then shows callout and Reload | As stated | `client/src/components/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-12 | UI | AC-16 | History tab: synthetic Created row, chronological rows, legacy line when empty, no controls | As stated | `client/src/components/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-13 | UI | AC-02, AC-20, AC-29 | Requester dashboard cards: values, `href`s from the API, accessible names (singular/plural), "None right now" on zero, "Reply needed" cue | As stated | `client/src/components/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-14 | UI | AC-23 | Requester lists: ≤ 5 rows, Bangkok times, each row links to `/tickets/:id`, empty messages | As stated | `client/src/components/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-15 | UI | AC-21 | Requester dashboard loading skeleton, `totalTickets: 0` empty panel, failure + Retry, Refresh keeps old values while loading | As stated | `client/src/components/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-16 | UI | AC-19 | Staff dashboard: primary, status and priority cards; Administrator variant hides "My" cards and shows Users | As stated | `client/src/components/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-17 | UI | AC-20 | Staff cards and lists link to the API-provided `href`s; "My recent actions" opens `#actions` | As stated | `client/src/components/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-18 | UI | AC-21 | Staff dashboard loading, all-zero, `403`, failure + Retry | Distinct states rendered | `client/src/components/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-19 | UI | AC-22 | Shell: Dashboard first per role, `aria-current`, Login and `Home` route to `/dashboard`, `from=` respected | As stated | `client/src/components/AppShell.test.tsx`, `client/src/components/lab-03/Login.test.tsx` (updated) | Planned |
| UI-20 | UI | AC-20 | My Tickets reads `status` (repeated) and `sort` from the URL, shows chips, Clear resets URL | Correct `fetch` query; chips shown | `client/src/components/MyTickets.test.tsx` (extended) | Planned |
| UI-21 | UI | AC-20 | Queue reads `followUp=mine` and `requesterResolved=true`, shows removable chips | As stated | `client/src/components/lab-03/StaffTicketQueue.test.tsx` (extended) | Planned |
| UI-22 | UI | AC-26 | Every Lab 2/3 client suite re-run | All pass; only the role-home expectations change | `client/src/components/**/*.test.tsx` | Planned |
| UI-23 | UI | V-07, V-17 | `Badges.tsx` renders the three follow-up badges with class, text and icon | Snapshot of classes and text | `client/src/components/lab-03/Badges.test.tsx` (extended) | Planned |

### UI style, responsive and accessibility

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| STY-01 | UI style | AC-28, V-03, V-04, V-14 | Every Lab 2/3/4 screen at 1280 / 820 / 375: `scrollWidth === innerWidth`; no element's box escapes its card | No overflow; screenshots with `CAPTURE=1` | `e2e/lab-04/visual.spec.ts` | Planned |
| STY-02 | Accessibility | AC-29, V-05, V-06, V-15, V-18 | First 30 tab stops on both dashboards and the Actions tab have a focus ring; every input labelled; every metric card's accessible name contains label + value; dialogs trap focus and return it | All pass | `e2e/lab-04/visual.spec.ts` | Planned |
| STY-03 | Accessibility | AC-29, V-07, V-17 | WCAG contrast of every badge incl. follow-up badges; every status/follow-up cue has text | ≥ 4.5:1; text present | `e2e/lab-04/visual.spec.ts` | Planned |
| STY-04 | UI style | AC-27, V-19, V-20 | Console listener on each role's happy path; crawl every in-app `href` from shell and dashboards; scan rendered text for "TODO", "lorem", "placeholder" | No console errors; every link resolves to a non-404 route; no matches | `e2e/lab-04/visual.spec.ts` | Planned |

### Migration, seed and performance

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-24, BR-29 | `before` → `prisma migrate deploy` → `after` on a Lab 3 database, before the seed: counts of User, Ticket, Attachment, TicketComment, TicketInternalNote; every FK resolves; every Ticket `version = 0`; zero Actions and history | All equal; output pasted into §5 | `server/scripts/verify-lab04-migration.ts` | Pass |
| MIG-02 | Migration | AC-24 | Rollback script → `after-rollback` (same counts, no Lab 4 tables) → Lab 3 server suite → re-deploy | Counts equal; suite green; re-deploy succeeds | `server/prisma/rollback/20261003000000_lab04_actions_taken.down.sql` + `verify-lab04-migration.ts` | Pass |
| MIG-03 | Seed | AC-25, BR-30 | Seed twice on PostgreSQL; count Actions, history, users | Identical counts both runs | `server/src/seed.ts` (run manually, log in §5) | Pass |
| PERF-01 | Performance smoke | AC-30 | 20 sequential requests each to both dashboards and one Actions list on the seeded local stack | p95 < 500 ms; dashboard bodies < 10 KB | `server/scripts/perf-lab04-smoke.ts` | Planned |

### End-to-end (`e2e/lab-04/`)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-04, AC-06, AC-09 | Priya opens a Ticket → Record action with an empty form (errors under fields) → valid save → edit → second browser context edits the same Action first → stale callout → Reload → save. Then a Resolved Ticket shows no Record button | As stated | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-03, AC-05, AC-07, AC-11 | Chen owns a Ticket; Priya records an Action with follow-up assigned to Nattapong; assigning to inactive Robert is refused; Nattapong marks it done; Chen records a second Action; Jennifer (Requester) sees both read-only under "Work done by IT" in the same order | As stated | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-12 … AC-16, AC-18 | Resolve blocked (hint lists conditions) → record Action / complete follow-up → Resolve (confirm) → History shows rows → Close → Reopen → Resolve blocked until a new Action → Cancel another Ticket with an open follow-up (dialog mentions it). Requester "appears resolved" leaves status unchanged | As stated | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-04 | E2E | AC-17 | Two IT Staff contexts on one Ticket; A changes status; B changes IT Priority from the stale page | B sees the stale callout; after Reload B's change applies; nothing lost | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-05 | E2E | AC-02, AC-19, AC-20, AC-22, AC-23 | Jennifer, Priya and admin log in → land on Dashboard (nav item current) → for every card, click it and compare the list total with the card value → list rows open details | All equal; landing correct | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-06 | E2E | AC-21 | Ploy's empty dashboard with Create Ticket; Requester `fetch` to `/api/staff/dashboard` from the page → `403`; API stopped → safe failure + Retry | As stated | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-07 | E2E | AC-28, AC-29, AC-31 | Runs STY-01 … STY-04 and captures the screenshot matrix (§4); backend stopped once for the health/safe-failure capture | Every check passes | `e2e/lab-04/visual.spec.ts` | Planned |
| E2E-08 | E2E | AC-26 | Every Lab 2 and Lab 3 Playwright spec on the Lab 4 build | All pass; only the role-home expectations change | `e2e/*.spec.ts`, `e2e/lab-03/*.spec.ts` | Planned |

---

## 3. Acceptance-Criterion Traceability Matrix

| AC | Description (short) | Covered by |
| --- | --- | --- |
| AC-01 | Action saved under the Ticket with creator and assignee | API-03, E2E-02 |
| AC-02 | Requester dashboard ownership | API-23, API-24, INT-01, UI-13, E2E-05 |
| AC-03 | Actions Taken UI flow; Requester read-only | API-02, UI-01, UI-06, E2E-02 |
| AC-04 | Action validation | UNIT-01, API-05, UI-02, E2E-01 |
| AC-05 | Performer ≠ owner; performer not spoofable | API-04, E2E-02 |
| AC-06 | Edit and stale edit | API-07, API-08, UI-04, E2E-01 |
| AC-07 | Follow-up assign / complete / cancel / inactive rejected | UNIT-02, API-06, API-09, UI-05, E2E-02 |
| AC-08 | Action authorization | API-02, API-11, UI-06 |
| AC-09 | Locked Ticket | API-10, UI-07, E2E-01 |
| AC-10 | Duplicate submission | API-12, UI-03 |
| AC-11 | Several performers, stable order | API-01, UI-01, E2E-02 |
| AC-12 | Resolution gate | UNIT-03, API-14, API-15, UI-09, E2E-03 |
| AC-13 | Reopen needs new Action | UNIT-03, API-16, E2E-03 |
| AC-14 | Transition matrix and refresh | UNIT-04, API-17, API-22, UI-09, UI-10, E2E-03 |
| AC-15 | Requester indication advisory | API-21, E2E-03 |
| AC-16 | Append-only history | UNIT-09, API-19, UI-10, UI-12, E2E-03 |
| AC-17 | Stale ticket operation | API-18, INT-02, UI-11, E2E-04 |
| AC-18 | Cancel cancels follow-ups | API-20, E2E-03 |
| AC-19 | Staff/Admin dashboard counts | UNIT-05, API-29 … API-31, API-34, INT-01, UI-16, E2E-05 |
| AC-20 | Drill-down totals equal counts | UNIT-05 … UNIT-07, API-28, API-33, UI-13, UI-17, UI-20, UI-21, E2E-05 |
| AC-21 | Dashboard states | API-26, API-27, API-32, UI-15, UI-18, E2E-06 |
| AC-22 | Landing and navigation | UI-19, E2E-05 |
| AC-23 | Requester lists | API-25, UI-14, E2E-05 |
| AC-24 | Migration and rollback | MIG-01, MIG-02 |
| AC-25 | Seed idempotent, coverage | UNIT-08, MIG-03 |
| AC-26 | Full regression | API-36, UI-22, E2E-08 |
| AC-27 | Hardening | API-38, UI-03, UI-08, STY-04 |
| AC-28 | Responsive | STY-01, E2E-07, §4 |
| AC-29 | Accessibility | STY-02, STY-03, UI-13, E2E-07 |
| AC-30 | Performance and payload | API-35, PERF-01 |
| AC-31 | Health | API-37, E2E-07 |

---

## 4. Responsive and Visual Checklist

Captured by `CAPTURE=1 npx playwright test e2e/lab-04/visual.spec.ts` (E2E-07) on a freshly seeded database. Paths are under `artifacts/lab-04/screenshots/`. Every row is checked against V-01 … V-20 in [ui-spec.md](ui-spec.md) §5. Filled in by Issue #58.

| # | Screen | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| R-01 | Requester Dashboard (Jennifer) | Desktop / Tablet / Mobile | | `requester-dashboard/dashboard-{desktop,tablet,mobile}.png` |
| R-02 | Requester Dashboard empty (Ploy) | Desktop / Mobile | | `requester-dashboard/empty-{desktop,mobile}.png` |
| R-03 | Requester Dashboard loading / failure | Desktop | | `requester-dashboard/{loading,failure}.png` |
| R-04 | IT Staff Dashboard (Priya) | Desktop / Tablet / Mobile | | `staff-dashboard/dashboard-{desktop,tablet,mobile}.png` |
| R-05 | Administrator Dashboard | Desktop / Mobile | | `staff-dashboard/admin-{desktop,mobile}.png` |
| R-06 | Staff Dashboard failure / forbidden (Requester URL) | Desktop | | `staff-dashboard/{failure,forbidden}.png` |
| R-07 | Actions Taken list | Desktop / Tablet / Mobile | | `actions-taken/list-{desktop,tablet,mobile}.png` |
| R-08 | Actions Taken create mode with follow-up + validation | Desktop / Mobile | | `actions-taken/create-{desktop,mobile}.png` |
| R-09 | Actions Taken view / edit mode; stale conflict | Desktop | | `actions-taken/{view,edit,stale}.png` |
| R-10 | Requester "Work done by IT" | Desktop / Mobile | | `actions-taken/requester-{desktop,mobile}.png` |
| R-11 | Resolution gate hint; Cancel dialog with follow-ups | Desktop / Mobile | | `workflow/{gate-hint,cancel-dialog}-{desktop,mobile}.png` |
| R-12 | History tab (Staff) and Requester status history | Desktop / Mobile | | `workflow/history-{desktop,mobile}.png` |
| R-13 | My Tickets drilled down (chips from URL) | Desktop / Mobile | | `requester-dashboard/drilldown-{desktop,mobile}.png` |
| R-14 | Queue drilled down (`followUp=mine`) | Desktop / Mobile | | `staff-dashboard/drilldown-{desktop,mobile}.png` |
| R-15 | Lab 2/3 screens re-checked (Login, Change Password, Create Ticket, My Tickets, Ticket Detail, Queue, Staff Detail, Users) | All three | | `regression/*.png` |

---

## 5. Test Commands and Final Results

```bash
# database (from repo root)
docker compose up -d
npm run prisma:migrate          # applies 20261003000000_lab04_actions_taken on top of Lab 3
npm run prisma:seed             # idempotent; safe to re-run

# suites
npm run test:server             # unit + API (no database needed)
npm run test:client             # UI component
npm run test:e2e                # Playwright; needs the migrated + seeded database

# database-backed checks (Docker up)
npx --prefix server tsx server/scripts/verify-lab04-migration.ts before|after|after-rollback
npx --prefix server tsx server/scripts/verify-lab04-dashboards.ts
npx --prefix server tsx server/scripts/verify-lab04-concurrency.ts
npx --prefix server tsx server/scripts/perf-lab04-smoke.ts
```

### Documented changes to earlier suites

Kept here so API-36 / UI-22 / E2E-08 can show that the earlier suites ran unchanged except for these lines:

| Suite | Change | Why |
| --- | --- | --- |
| `server/tests/seed.test.ts` (Issue #53) | Fake client gains `ticketAction` and `ticketStatusChange` upsert delegates; expected requester count 5 → 6 (`REQUESTERS` length too); the row-count, call-count and duplicate-key checks include the two new tables. Every Lab 2/3 assertion is otherwise unchanged; the Lab 4 cases (UNIT-08) are a new `describe` block | Ploy is a sixth Requester (specification.md §7), and the seed now writes Actions and history |

### Migration and regression evidence (AC-24) — recorded 2026-10-08

Run against the local Lab 3 development database (`toktikit`, all four Lab 1–3 migrations applied, holding the data accumulated through Lab 3 and its E2E runs), from `server/`, after a `pg_dump` backup kept outside the repository.

**MIG-01** — migrate and verify, before any seed:

```
$ npx tsx scripts/verify-lab04-migration.ts before
Before migration (Lab 3 schema): {
  User: 36, Session: 708, Category: 4, RelatedSystem: 7,
  Ticket: 161, Attachment: 28, TicketComment: 84, TicketInternalNote: 37
}

$ npx prisma migrate deploy
Applying migration `20261003000000_lab04_actions_taken`
All migrations have been successfully applied.

$ npx tsx scripts/verify-lab04-migration.ts after
After migration (Lab 4 schema): {
  User: 36, Session: 708, Category: 4, RelatedSystem: 7,
  Ticket: 161, Attachment: 28, TicketComment: 84, TicketInternalNote: 37,
  TicketAction: 0, TicketStatusChange: 0
}
MIG-01 PASSED: Lab 1–3 counts, ticket statuses and foreign keys unchanged; every ticket version 0 with no Actions or history; both CHECK constraints present.
```

**MIG-02** — roll back, verify, re-apply:

```
$ npx prisma db execute --file prisma/rollback/20261003000000_lab04_actions_taken.down.sql --schema prisma/schema.prisma
Script executed successfully.

$ npx tsx scripts/verify-lab04-migration.ts after-rollback
After rollback (Lab 3 schema): {
  User: 36, Session: 708, Category: 4, RelatedSystem: 7,
  Ticket: 161, Attachment: 28, TicketComment: 84, TicketInternalNote: 37
}
MIG-02 PASSED: Lab 4 tables, column and migration record removed; Lab 1–3 counts, statuses and foreign keys unchanged.

$ npx prisma migrate deploy
Applying migration `20261003000000_lab04_actions_taken`
All migrations have been successfully applied.

$ npx tsx scripts/verify-lab04-migration.ts after
MIG-01 PASSED: Lab 1–3 counts, ticket statuses and foreign keys unchanged; every ticket version 0 with no Actions or history; both CHECK constraints present.
```

The plan in §2 also mentions running the Lab 3 server suite while rolled back. That suite mocks the database, so it cannot see the schema; it was not run against the rolled-back state. Instead, all 83 Lab 2/3 Playwright tests were run against the re-applied Lab 4 schema (below), which is the regression that actually touches the database.

**MIG-03** — seed twice, identical counts (users include accounts created by earlier E2E runs; the seeded rows are the 24 tickets, 22 Actions and 45 history rows):

```
$ npx tsx src/seed.ts      # run 1
Seed complete: { categories: 4, relatedSystems: 7, requesters: 20, itStaff: 16, administrators: 1, inactiveUsers: 8,
  seededTickets: 24, comments: 84, internalNotes: 37, actions: 22, openFollowUps: 6, statusChanges: 45 }
$ npx tsx src/seed.ts      # run 2
Seed complete: { categories: 4, relatedSystems: 7, requesters: 20, itStaff: 16, administrators: 1, inactiveUsers: 8,
  seededTickets: 24, comments: 84, internalNotes: 37, actions: 22, openFollowUps: 6, statusChanges: 45 }
```

**INT-03** — the follow-up CHECK constraints, probed in rolled-back transactions:

```
$ npx tsx scripts/verify-lab04-concurrency.ts
INT-03 — follow-up CHECK constraints
  ok   no follow-up: inserted
  ok   complete open follow-up: inserted
  ok   completed follow-up with closer and time: inserted
  ok   required but no note: rejected
  ok   required but no assignee: rejected
  ok   required but no status: rejected
  ok   not required but has a note: rejected
  ok   not required but has a status: rejected
  ok   Completed without closer or time: rejected
  ok   Open but stamped closed: rejected
  ok   closed time without closer: rejected
  ok   no follow-up but stamped closed: rejected
INT-03 PASSED: 3 consistent rows accepted, 9 inconsistent rows rejected by PostgreSQL; nothing left behind.
```

### Per-issue verification logs

Appended as each Issue merges: command, summary line, and the test ids it turned to Pass.

#### Issue #53 — Actions Taken foundation (2026-10-08)

```
$ npm run test:server     Test Files  19 passed (19)    Tests  763 passed (763)
$ npm run test:client     Test Files  12 passed (12)    Tests  231 passed (231)
$ npx playwright test     83 passed (2.1m)              # Lab 2/3 suites on the migrated Lab 4 schema
```

Turned to Pass: UNIT-01, UNIT-02, UNIT-08, UNIT-09, API-01 … API-13, INT-03, MIG-01, MIG-02, MIG-03. Server tests went from 656 to 763 (+107). The only change to an earlier suite is `seed.test.ts` (table above). Before the suite was trusted, two deliberate mutations were made to `actionRoutes.ts` (skip the version check; take `performedById` from the body); API-04 and API-08 each failed, and the file was restored.

### Final run

_Recorded by Issue #58 on `main` after the release merge: all suites, verbatim output in `test-runs/`._

---

## 6. Issue Coverage

| Issue | Tests it must turn to Pass |
| --- | --- |
| #53 Actions Taken foundation | UNIT-01, UNIT-02, UNIT-08, UNIT-09, API-01 … API-13, INT-03, MIG-01 … MIG-03 |
| #54 Actions Taken UI | UNIT-10, UI-01 … UI-08, UI-23, E2E-01, E2E-02 |
| #55 Ticket workflow | UNIT-03, UNIT-04, API-14 … API-22, INT-02, UI-09 … UI-12, E2E-03, E2E-04 |
| #56 Role dashboards | UNIT-05 … UNIT-07, API-23 … API-35, INT-01, UI-13 … UI-21, PERF-01, E2E-05, E2E-06 |
| #57 Final hardening | API-36 … API-38, UI-22, STY-01 … STY-04, E2E-08 |
| #58 E2E, visual, release | E2E-07, §4, §5 final run |
