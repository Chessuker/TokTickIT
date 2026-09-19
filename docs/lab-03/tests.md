# Lab 3 — Test Plan and Results

Companion to [specification.md](specification.md). Acceptance criteria (AC-01 …) are defined in §9 of that document; business rules (BR-) in §5; endpoints in [api-spec.md](api-spec.md); screens and visual items (V-) in [ui-spec.md](ui-spec.md). This plan was written with the contract, before implementation; the **Final Status** column is filled in as each Issue merges and must reflect the run on `main` at submission.

---

## 1. Test Strategy

| Level | Tooling | What it covers |
| --- | --- | --- |
| Unit | Vitest | Pure modules: password policy, session token hashing and expiry, login throttle, status transition matrix and owner rule (`ticketWorkflow.ts`), queue query parsing, seed idempotence against the in-memory fake client. |
| API / integration | Vitest + Supertest | Every endpoint in api-spec.md §3 against the Express app with `src/db.js` mocked (Lab 2 pattern): status codes, error codes, `fields`, cookies, and the authorization matrix row by row. bcrypt is real (fixtures are hashed at cost 4 so the suite stays fast; the routes hash at cost 10). |
| UI component | Vitest + React Testing Library + user-event | Rendering, validation placement, guards and role navigation, feedback states, and that the client sends the right requests (`fetch` mocked, `credentials: 'include'` asserted). |
| UI style / responsive | Playwright screenshots + DOM measurements | V-01 … V-14 at 1280 / 820 / 375 px; `scrollWidth` checks; badge contrast. |
| Security / authorization | Supertest (API-13 … API-18, API-08) + Playwright (E2E-03) | Cross-role and unauthenticated calls, tampered `requesterId`, Internal Note leakage, post-logout access. |
| Migration / regression | Manual scripted run + Lab 2 suites | Migration on a database holding Lab 2 tickets and attachments; every Lab 2 test updated from header to cookie and still green. |
| End-to-end | Playwright | Real login through the real screens for each role, against a migrated and seeded PostgreSQL. |

Placement follows the handout's required structure: `server/tests/lab-03/`, `client/src/components/lab-03/` (new components live beside their tests, as in Lab 2), `e2e/lab-03/`. Lab 2 tests stay where they are and are updated in place (API-19 … API-21).

Test accounts come from the seed (specification.md §7): `jennifer.anderson@…` (Requester, password already changed), `sarah.johnson@…` (Requester, initial password), `alex.smith@…` (inactive Requester), three IT Staff, `robert.wilson@…` (inactive IT Staff), `admin@toktickit.xyz` (Administrator). E2E helpers log in through the Login screen, never by writing a cookie.

---

## 2. Planned Tests

The three example rows from the handout (API-01, API-08, E2E-02) keep their ids.

### Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-08, AC-09 | Password policy: length 7/8/72/73, missing upper/lower/digit/special | Exactly the failing rule named; valid password passes | `server/tests/lab-03/passwordPolicy.test.ts` | Pass |
| UNIT-02 | Unit | BR-18, AC-21 | Transition matrix: every (from, to) pair | Permitted pairs return `ok`; all others return `INVALID_TRANSITION` | `server/tests/lab-03/ticketWorkflow.test.ts` | Planned |
| UNIT-03 | Unit | BR-19, BR-20, AC-22 | Owner rule and timestamps | InProgress/Resolved without owner rejected; Resolved sets `resolvedAt`, Closed sets `closedAt`, Reopened clears all three | `server/tests/lab-03/ticketWorkflow.test.ts` | Planned |
| UNIT-04 | Unit | AC-17 | Queue query parser: defaults, repeatable `status`, `owner=me/unassigned/uuid`, sort keys, page sizes, invalid values | Parsed object or `fields` naming the bad parameter | `server/tests/lab-03/queueQuery.test.ts` | Pass |
| UNIT-05 | Unit | BR-10 | Session helper: token is 32 random bytes, only SHA-256 stored, `expiresAt = now + 8h`, expired session rejected | As stated | `server/tests/lab-03/session.test.ts` | Pass |
| UNIT-06 | Unit | BR-07, AC-07 | Login throttle: 5 failures allowed, 6th blocked, window expiry, reset on success | As stated (fake timers) | `server/tests/lab-03/loginThrottle.test.ts` | Pass |
| UNIT-07 | Unit | BR-29, AC-32 | Seed against the in-memory `upsert`-only client, run twice | No `create`/`deleteMany` called; second run touches the same keys; counts 5 + 4 + 1 users, 24 tickets | `server/tests/seed.test.ts` (updated) | Pass |

### API

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-01 | Valid login | Authenticated response; safe user data | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | API | AC-05, BR-06 | Unknown email vs wrong password | Both `401 INVALID_CREDENTIALS` with byte-identical body | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-03 | API | AC-06, BR-01, BR-06 | Inactive account, correct password | `403 ACCOUNT_INACTIVE`; no `Set-Cookie`; no session created | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-04 | API | AC-07, BR-07 | Sixth failed attempt for one email; five `403 ACCOUNT_INACTIVE` answers for an inactive account | `429 TOO_MANY_ATTEMPTS`, even with the right password / still `403`, never `429` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-05 | API | AC-01, BR-09, BR-10 | Login response and cookie hygiene | Cookie is `HttpOnly; SameSite=Lax; Path=/`; body has no `passwordHash`; `lastLoginAt` updated | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-06 | API | AC-05 | Login body validation | Missing/malformed email or empty password → `400` with `fields` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-07 | API | AC-08, BR-10 | Logout | `204`; session row deleted; cookie cleared; subsequent `GET /api/auth/me` `401` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-08 | API | AC-04 | Requester requests Internal Notes | Forbidden; no note data returned | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-09 | API | AC-01, BR-02 | `GET /api/auth/me` with and without session, and with `mustChangePassword` | `200` SessionUser / `401` / `200` with `mustChangePassword: true` (route is allow-listed) | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-10 | API | AC-02, BR-02 | `mustChangePassword` user calls `GET /api/tickets` | `403 PASSWORD_CHANGE_REQUIRED` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-11 | API | AC-09, BR-08, BR-11 | Change password: wrong current, weak new, same as current, mismatch | `400` with the correct `fields` key for each | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-12 | API | AC-10, BR-11 | Change password: valid | `200`, `mustChangePassword: false`, same cookie still valid, other sessions deleted | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-13 | API | AC-12, BR-30 | Unauthenticated call to every protected route | `401 UNAUTHORIZED`, empty of data | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-14 | API | AC-12 | Requester calls each `/api/staff/*` and `/api/admin/*` route | `403 FORBIDDEN` | `server/tests/lab-03/authorization.api.test.ts` | Partial (`/api/staff/*` queue routes; `/api/admin/*` with #41) |
| API-15 | API | AC-12 | IT Staff calls each `/api/admin/*` route | `403 FORBIDDEN` | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-16 | API | AC-12, BR-17 | Administrator calls claim / owner / it-priority / status / internal-note create / comment create | `403 FORBIDDEN`; reads of the same ticket `200` | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-17 | API | AC-03, BR-03 | Requester sends `requesterId` of another user in body and query on create/list | Ignored; ticket owned by session user; list scoped to session user | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-18 | API | AC-27, BR-10, BR-27 | Deactivated user's existing session; role-changed user's session | Next request `401` | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-19 | API | AC-13, BR-14 | Lab 2 create/list/detail/attachment suites re-run with a cookie instead of the header | All Lab 2 assertions still pass | `server/tests/tickets.api.test.ts`, `server/tests/attachments.api.test.ts` (updated) | Pass |
| API-20 | API | AC-13, BR-16 | `POST /api/tickets` | `itPriority` equals submitted `priority` | `server/tests/tickets.api.test.ts` (updated) | Pass |
| API-21 | API | AC-24, BR-14 | IT Staff / Administrator read and download another Requester's attachment; attempt add and remove | Reads `200`; add/remove `403` | `server/tests/attachments.api.test.ts` (updated) | Pass |
| API-22 | API | AC-14, BR-22 | Create Public Comment: valid, empty, whitespace, 2001 chars | `201` with server author/time; `400 fields.body` for the rest | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-23 | API | AC-14, BR-23 | Requester comments on another Requester's ticket; Administrator creates a comment | `403` both | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-24 | API | AC-14, BR-04 | List comments as owner, IT Staff, Administrator | `200`, newest first, same content for all three | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-25 | API | AC-15, BR-05, BR-21 | Resolution indication: owner on Open ticket; repeat; on Closed ticket; by IT Staff; Requester `PATCH status` | `200` set / `200` same timestamp / `409` / `403` / `403` | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-26 | API | AC-16 | Queue default request as IT Staff | All requesters' tickets, `updatedAt desc`, page 1 of 10, pagination metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-27 | API | AC-17 | `search`, `status` (repeated), `itPriority`, `owner=me`, `owner=unassigned`, `category` | Correct Prisma `where` built; correct subset returned | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-28 | API | AC-17 | Every `sort` value, priority and status ordering, tie-break on `id` | Correct `orderBy` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-29 | API | AC-17 | Invalid `status`, `sort`, `pageSize`, `page=0`, out-of-range page | `400` naming the parameter; out-of-range → `200` empty with real total | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-30 | API | AC-16, AC-19 | `GET /api/staff/assignees`; Administrator gets the queue | Active IT Staff only, sorted; Administrator `200` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-31 | API | AC-24 | `GET /api/staff/tickets/:id` shape | `StaffTicketDetail` with counts, attachments, `permittedTransitions`; unknown id `404` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-32 | API | AC-18, BR-15, BR-19, BR-31 | Claim on New / on owned-by-other / on Closed | Owner = caller and `Open` / owner replaced / `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-33 | API | AC-19, BR-15, BR-31 | Owner PATCH: active IT Staff, inactive IT Staff, Requester id, `null` on Open, `null` on InProgress, assign on New, assign on Closed | `200` / `400 fields.ownerId` / `400` / `200` unassigned / `409` / `200` and status `Open` / `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-34 | API | AC-20, BR-16, BR-31 | IT priority PATCH valid, invalid, and on a Closed ticket | `200` with `requestedPriority` unchanged / `400` / `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-35 | API | AC-21, BR-18 | Status PATCH for a permitted pair and for a forbidden pair | `200` with recomputed `permittedTransitions` / `409 INVALID_TRANSITION` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-36 | API | AC-22, BR-19, BR-20 | InProgress and Resolved on an unassigned ticket; Resolved/Closed/Reopened timestamps | `409` / `409`; timestamps set and cleared per BR-20 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-37 | API | AC-21 | Status PATCH with unknown value; on Cancelled ticket | `400` / `409` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-38 | API | AC-23, BR-22, BR-23 | Create Internal Note as IT Staff (valid, empty); as Administrator | `201` / `400` / `403` | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-39 | API | AC-23, BR-04 | List Internal Notes as IT Staff and Administrator; Requester-facing `GET /api/tickets/:id` | `200` both; ticket detail body contains no note text or count | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-40 | API | AC-25 | Users list: default, `search` on name and on email, `role` filter, invalid role | Sorted by name / subset / subset / `400` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-41 | API | AC-26, BR-24 | Create user valid | `201`, `mustChangePassword: true`, no hash in body, hash verifies | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-42 | API | AC-26, BR-12, BR-13, BR-24 | Create user: duplicate email (different case), unknown role, weak initial password, missing name | `409 CONFLICT fields.email` / `400` / `400` / `400` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-43 | API | AC-27, BR-25 | PATCH name/email/role/isActive; unknown fields ignored | `200` with changes; `passwordHash`/`department` in body ignored | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-44 | API | AC-29, BR-25 | Administrator deactivates own account | `409 CONFLICT` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-45 | API | AC-29, BR-26 | Deactivate / change role of the last active Administrator; same when a second active Administrator exists | `409` / `409` / `200` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-46 | API | AC-28, BR-27 | Set initial password: valid; weak; unknown user | `200` with `mustChangePassword: true` and sessions deleted / `400` / `404` | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-47 | API | AC-30 | Requester and IT Staff call every admin route | `403` with no user data | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-48 | API | AC-27, BR-10 | Deactivation and role change delete the target's sessions | `session.deleteMany` called with the user id | `server/tests/lab-03/users-admin.api.test.ts` | Planned |

### UI component

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | AC-05 | Login: required fields, malformed email | Errors under the right field; no request sent | `client/src/components/lab-03/Login.test.tsx` | Pass |
| UI-02 | UI | AC-05 | Login: `401` | Callout text, password cleared, email kept, focus on password | `client/src/components/lab-03/Login.test.tsx` | Pass |
| UI-03 | UI | AC-06, AC-07 | Login: `403 ACCOUNT_INACTIVE`, `429` | Inactive message / throttled message with disabled button | `client/src/components/lab-03/Login.test.tsx` | Pass |
| UI-04 | UI | AC-34 | Login: network failure and `500` | Safe message, Retry, email preserved; busy state shown during request; `credentials: 'include'` on the request | `client/src/components/lab-03/Login.test.tsx` | Pass |
| UI-05 | UI | AC-02, AC-10 | Login success routes by `mustChangePassword` and role | `/change-password` / `/tickets` / `/staff/queue` / `/admin/users` | `client/src/components/lab-03/Login.test.tsx` | Pass |
| UI-06 | UI | AC-09 | Change Password: live rules panel, mismatch, same-as-current, server `fields` mapping | Correct rule ticks; errors under the right fields | `client/src/components/lab-03/ChangePassword.test.tsx` | Pass |
| UI-07 | UI | AC-02, AC-10 | Change Password forced mode: no nav rendered; success navigates to role home | As stated | `client/src/components/lab-03/ChangePassword.test.tsx` | Pass |
| UI-08 | UI | AC-11 | AppShell per role: nav links, profile menu, Logout call and redirect; Development Requester block absent | Only role links; `POST /api/auth/logout` then `/login` | `client/src/components/AppShell.test.tsx` (updated) | Pass |
| UI-09 | UI | AC-11, AC-08 | `RequireAuth`: unauthenticated → `/login?from=`; wrong role → Forbidden state; `mustChangePassword` → `/change-password` | As stated | `client/src/components/lab-03/RequireAuth.test.tsx` | Pass |
| UI-10 | UI | AC-16 | Queue table: nine columns, badges, _Unassigned_, "You" tag, requester-resolved icon, Open action | Rendered from mocked data | `client/src/components/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-11 | UI | AC-17 | Queue toolbar: search debounce, status chips, owner/priority/category filters, sort, page size, Clear | Correct query string on `fetch`; page resets to 1 | `client/src/components/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-12 | UI | AC-17, AC-34 | Queue states: loading, empty, no-results, forbidden (`403`), failure with Retry | Distinct states rendered | `client/src/components/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-13 | UI | AC-33 | Queue at mobile media query renders cards, not a table | Cards present, table absent | `client/src/components/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-14 | UI | AC-24 | Staff detail: read-only group vs three selects; attachments tab has Download but no upload/remove | As stated | `client/src/components/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-15 | UI | AC-18, AC-19 | Claim button and owner select: requests, busy indicator, confirmation when replacing another owner | Correct endpoint and body | `client/src/components/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-16 | UI | AC-21, AC-22 | Status select lists only `permittedTransitions`; terminal choices open confirm dialog; owner-required hint | As stated | `client/src/components/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-17 | UI | AC-21 | `409` on status/owner/priority | Control reverts; conflict callout with server message | `client/src/components/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-18 | UI | AC-23, BR-04 | Internal Notes tab: amber styling, composer for IT Staff, read-only for Administrator; Public Comments composer | Visually distinct classes; composers per role | `client/src/components/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-19 | UI | AC-14, AC-15 | Requester detail: comments list and composer validation; "Problem appears resolved" button, confirm, indicator; no staff controls | As stated | `client/src/components/TicketDetail.test.tsx` (updated), `client/src/components/lab-03/CommentsPanel.test.tsx` | Pass |
| UI-20 | UI | AC-13 | Lab 2 component suites with `AuthProvider` instead of `RequesterProvider`; no `X-Requester-Id` in any request | All Lab 2 assertions pass | `client/src/components/{CreateTicketForm,MyTickets,TicketDetail}.test.tsx` (updated) | Pass |
| UI-21 | UI | AC-25 | Users list: columns, badges, "(you)", search and role filter query, no-results | As stated | `client/src/components/lab-03/UserManagement.test.tsx` | Planned |
| UI-22 | UI | AC-26 | Create panel: required fields, rules panel, `409` shown under Email, success adds row | As stated | `client/src/components/lab-03/UserManagement.test.tsx` | Planned |
| UI-23 | UI | AC-27, AC-29 | Edit panel: fields prefilled, deactivate confirm, self toggle disabled with hint, last-admin toggle/role disabled, inline `409` | As stated | `client/src/components/lab-03/UserManagement.test.tsx` | Planned |
| UI-24 | UI | AC-28, AC-30 | Set initial password success callout; non-Administrator sees Forbidden | As stated | `client/src/components/lab-03/UserManagement.test.tsx` | Planned |
| UI-25 | UI | V-13 | Shared `Badges.tsx` renders every status/priority/role/active value with its class and written label | Snapshot of classes and text | `client/src/components/lab-03/Badges.test.tsx` | Pass |

### Migration / regression

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-31, BR-28 | Scripted before/after check on a database holding Lab 2 data, run after `prisma migrate deploy` and **before** the seed (the seed upserts extra tickets, so counts are only comparable pre-seed): counts of tickets, attachments, users; every `Ticket.requesterId` resolves to a `User`; `itPriority = priority` on every row; all migrated users are `Requester` with `mustChangePassword = true` | All assertions hold; output pasted into §5 | `server/scripts/verify-lab03-migration.ts` (run manually against PostgreSQL) | Pass |
| MIG-02 | Migration | AC-31 | One active migrated requester (Sarah Johnson) logs in with the documented initial password, after the seed has written the hash | Login succeeds and lands on Change Password | `e2e/lab-03/authentication.spec.ts` (shares E2E-02) | Pass |

### End-to-end

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File Path | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-05, AC-06, AC-08 | Invalid login, inactive login, valid login as Jennifer, shell shows name and role, logout, Back button, direct URL after logout | Error callouts; My Tickets shown; after logout every app URL lands on `/login` | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-02 | Initial password login and change | Normal app opens only after valid change | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-03 | E2E | AC-11, AC-12 | Role navigation and forbidden pages: Requester → `/staff/queue`, `/admin/users`; IT Staff → `/admin/users`; direct `fetch` from the page to `/api/staff/tickets` as Requester | Forbidden state; `403` | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-04 | E2E | AC-13, AC-14, AC-15 | Requester regression: create ticket with attachment → My Tickets → detail → download → post comment → "Problem appears resolved" | Lab 2 flow intact; comment and indicator visible | `e2e/*.spec.ts` (updated helpers) + `e2e/lab-03/requester-comments.spec.ts` (Requester half: Pass) + `e2e/lab-03/staff-ticket-flow.spec.ts` (staff sees comment and indicator) | Partial |
| E2E-05 | E2E | AC-16 … AC-23 | IT Staff: queue search/filter/sort/paginate → open → claim → set IT priority → In Progress → post comment → add Internal Note → Resolved (confirm) → Closed; then log in as the Requester and verify comment visible, note absent, statuses shown | As stated | `e2e/lab-03/staff-ticket-flow.spec.ts` | Partial (queue half: `e2e/lab-03/staff-queue.spec.ts` Pass; claim → status → comment → note with #40) |
| E2E-06 | E2E | AC-25 … AC-30 | Administrator: search, filter, create user (IT Staff) → log out → log in as new user → forced change → log back in as admin → edit role → self-deactivate blocked → set initial password → new user forced to change again | As stated | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-07 | E2E | AC-33, AC-34 | Screenshot capture at 1280 / 820 / 375 for Login, Change Password, Queue, Staff Detail, Users; `scrollWidth` check; backend stopped for one failure capture | Files in `artifacts/lab-03/screenshots/*`; no overflow | `e2e/lab-03/visual.spec.ts` | Planned |

---

## 3. Acceptance-Criterion Traceability Matrix

| AC | Description (short) | Covered by |
| --- | --- | --- |
| AC-01 | Valid login returns identity and role | API-01, API-05, API-09, E2E-01 |
| AC-02 | Password change gate | API-09, API-10, UI-05, UI-07, UI-09, E2E-02 |
| AC-03 | Client-supplied requesterId ignored | API-17 |
| AC-04 | Requester refused on Internal Notes without content | API-08, API-39 |
| AC-05 | Generic invalid-credentials | API-02, API-06, UI-01, UI-02, E2E-01 |
| AC-06 | Inactive account | API-03, UI-03, E2E-01 |
| AC-07 | Throttling | UNIT-06, API-04, UI-03 |
| AC-08 | Logout invalidates | API-07, UI-08, UI-09, E2E-01 |
| AC-09 | Change-password validation | UNIT-01, API-11, UI-06 |
| AC-10 | Change-password success | API-12, UI-05, UI-07, E2E-02 |
| AC-11 | Role navigation and forbidden pages | UI-08, UI-09, E2E-03 |
| AC-12 | Direct API authorization | API-13 … API-16, E2E-03 |
| AC-13 | Requester regression | API-19, API-20, UI-20, E2E-04 |
| AC-14 | Public Comments | API-22 … API-24, UI-19, E2E-04 |
| AC-15 | Problem appears resolved | API-25, UI-19, E2E-04 |
| AC-16 | Queue listing | API-26, API-30, UI-10, E2E-05 |
| AC-17 | Queue search/filter/sort/page/invalid | UNIT-04, API-27 … API-29, UI-11, UI-12, E2E-05 |
| AC-18 | Claim | API-32, UI-15, E2E-05 |
| AC-19 | Reassign | API-30, API-33, UI-15 |
| AC-20 | IT Priority | API-34, E2E-05 |
| AC-21 | Transitions and confirmation | UNIT-02, API-35, API-37, UI-16, UI-17, E2E-05 |
| AC-22 | Owner required | UNIT-03, API-36, UI-16 |
| AC-23 | Internal Notes | API-38, API-39, UI-18, E2E-05 |
| AC-24 | Attachment continuity for staff | API-21, API-31, UI-14 |
| AC-25 | Users list/search/filter | API-40, UI-21, E2E-06 |
| AC-26 | Create user and validation | API-41, API-42, UI-22, E2E-06 |
| AC-27 | Edit user; deactivated session dies | API-18, API-43, API-48, UI-23, E2E-06 |
| AC-28 | Set initial password | API-46, UI-24, E2E-06 |
| AC-29 | Self / last-admin guards | API-44, API-45, UI-23, E2E-06 |
| AC-30 | Non-admin forbidden | API-47, UI-24, E2E-03 |
| AC-31 | Migration preserves data | MIG-01, MIG-02, §5 migration log |
| AC-32 | Seed idempotent | UNIT-07, §5 seed log |
| AC-33 | Responsive | UI-13, E2E-07, §4 |
| AC-34 | Safe failure | UI-04, UI-12, E2E-07 |

---

## 4. Responsive and Visual Checklist

Filled in during Issue 7. Screenshot paths are under `artifacts/lab-03/screenshots/`.

| # | Screen | Viewport | Result | Screenshot |
| --- | --- | --- | --- | --- |
| R-01 | Login | Desktop 1280 | | `authentication/login-desktop.png` |
| R-02 | Login | Tablet 820 | | `authentication/login-tablet.png` |
| R-03 | Login | Mobile 375 | | `authentication/login-mobile.png` |
| R-04 | Change Password (forced) | Desktop | | `authentication/change-password-desktop.png` |
| R-05 | Change Password (forced) | Mobile | | `authentication/change-password-mobile.png` |
| R-06 | Shell + profile menu (each role) | Desktop | | `authentication/shell-{requester,staff,admin}-desktop.png` |
| R-07 | Shell + profile sheet | Mobile | | `authentication/shell-mobile.png` |
| R-08 | Queue (table) | Desktop | | `staff-queue/queue-desktop.png` |
| R-09 | Queue (table, scrolling wrapper) | Tablet | | `staff-queue/queue-tablet.png` |
| R-10 | Queue (cards, filter sheet) | Mobile | | `staff-queue/queue-mobile.png` |
| R-11 | Queue no-results / failure | Desktop | | `staff-queue/queue-no-results.png`, `queue-failure.png` |
| R-12 | Staff Ticket Detail | Desktop | | `staff-ticket-detail/detail-desktop.png` |
| R-13 | Staff Ticket Detail | Tablet | | `staff-ticket-detail/detail-tablet.png` |
| R-14 | Staff Ticket Detail (tabs strip) | Mobile | | `staff-ticket-detail/detail-mobile.png` |
| R-15 | Internal Notes tab vs Public Comments tab | Desktop | | `staff-ticket-detail/notes-vs-comments.png` |
| R-16 | Confirm dialog (Resolved) | Mobile | | `staff-ticket-detail/confirm-mobile.png` |
| R-17 | Users (list + panel) | Desktop | | `user-management/users-desktop.png` |
| R-18 | Users (panel as sheet) | Tablet | | `user-management/users-tablet.png` |
| R-19 | Users (cards, full-screen panel) | Mobile | | `user-management/users-mobile.png` |
| R-20 | Users validation + `409` under Email | Desktop | | `user-management/users-conflict.png` |

Each row is checked against V-01 … V-14 in [ui-spec.md](ui-spec.md) §5.

---

## 5. Test Commands and Final Results

```bash
# database (from repo root)
docker compose up -d
npm run prisma:migrate          # applies 20260915000000_lab03_users_roles_workflow
npm run prisma:seed             # idempotent; safe to re-run

# suites
npm run test:server             # unit + API (no database needed)
npm run test:client             # UI component
npm run test:e2e                # Playwright; needs the migrated + seeded database
```

### Migration and regression evidence (AC-31) — recorded 2026-09-18

Procedure: on a database that already holds Lab 2 data, record `SELECT count(*)` for `Ticket`, `Attachment`, `RequesterUser` and the distinct `requesterId` set; run `prisma migrate deploy`; record the same counts on `Ticket`, `Attachment`, `User`; assert equality and `SELECT count(*) FROM "Ticket" WHERE "itPriority" <> "priority"` = 0 (all of this **before** the seed runs); then run the seed; log in as one active migrated requester (Sarah Johnson) with the documented initial password and confirm the forced change.

Run against the local Lab 2 database (`toktikit`, migrations `20260808160909_init` + `20260822000000_lab02_requester_ticketing` applied, 5 tickets raised through the Lab 2 UI):

```
$ npx tsx scripts/verify-lab03-migration.ts before
Before migration: { tickets: 5, attachments: 0, requesterUsers: 5, distinctRequesters: 1 }

$ npx prisma migrate deploy
The following migration(s) have been applied:
  └─ 20260915000000_lab03_users_roles_workflow/migration.sql
All migrations have been successfully applied.

$ npx tsx scripts/verify-lab03-migration.ts after
After migration: { tickets: 5, attachments: 0, users: 5, distinctRequesters: 1, statuses: { New: 5 } }
MIG-01 PASSED: counts, ownership, priorities and migrated users all verified.

$ npx tsx src/seed.ts            # twice — identical counts (AC-32)
Seed complete: { categories: 4, relatedSystems: 7, requesters: 5, itStaff: 4, administrators: 1, inactiveUsers: 2 }
Seed complete: { categories: 4, relatedSystems: 7, requesters: 5, itStaff: 4, administrators: 1, inactiveUsers: 2 }

$ SELECT count(*) FROM "User"; SELECT count(*) FROM "Ticket";   → 10, 5

$ curl -i -X POST /api/auth/login  {"email":"sarah.johnson@kmutt.ac.th","password":"Welcome123!"}
HTTP/1.1 200 OK
Set-Cookie: toktickit_session=…; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax
{"id":"…","name":"Sarah Johnson","email":"sarah.johnson@kmutt.ac.th","role":"Requester","mustChangePassword":true}

$ curl -b <cookie> /api/tickets
{"error":{"code":"PASSWORD_CHANGE_REQUIRED","message":"You must change your password before continuing."}}

$ curl -X POST /api/auth/login  {"email":"alex.smith@kmutt.ac.th","password":"Welcome123!"}   # inactive
{"error":{"code":"ACCOUNT_INACTIVE","message":"This account is inactive. Please contact an administrator."}}
```

MIG-02 (the same first login through the Login screen, landing on Change Password, then completing it) is covered by `e2e/lab-03/authentication.spec.ts` "Initial password change" — see the E2E log below.

### Per-issue verification logs

Appended as each Issue merges: command, summary line of the run, and the test ids it turned to Pass.

#### Issue #37 — Authentication foundation (2026-09-18)

```
$ npm run test:server
 Test Files  10 passed (10)
      Tests  210 passed (210)

$ npm run test:client
 Test Files  7 passed (7)
      Tests  113 passed (113)
```

Turned to Pass: UNIT-01, UNIT-05, UNIT-06, UNIT-07; API-01 … API-07, API-09 … API-13, API-17 … API-21; UI-01 … UI-09, UI-20. The removed Lab 2 suites for the Development Requester selector (`requesters.api.test.ts`, `RequesterSelector.test.tsx`, `e2e/requester-context.spec.ts`) went with the feature (FR-05).

Migration (MIG-01) and seed evidence: see "Migration and regression evidence" above.

```
$ npm run prisma:seed && npm run test:e2e      # against the migrated + seeded database
ok  1 [chromium] › e2e\attachments.spec.ts:18:7 › Attachment lifecycle (E2E-02) › upload, download, remove with a reason, then download is refused (1.4s)
  ok  2 [chromium] › e2e\attachments.spec.ts:58:7 › Attachment lifecycle (E2E-02) › a removed attachment is refused by the API as well as hidden in the UI (1.3s)
  ok  3 [chromium] › e2e\attachments.spec.ts:97:7 › Attachment lifecycle (E2E-02) › rejects a disallowed file type without attaching it (AC-07) (1.1s)
  ok  4 [chromium] › e2e\create-ticket.spec.ts:19:7 › Create ticket (E2E-01) › create a ticket, then open it and find the same data (1.1s)
  ok  5 [chromium] › e2e\create-ticket.spec.ts:58:7 › Create ticket (E2E-01) › the new ticket appears in My Tickets under its number (1.0s)
  ok  6 [chromium] › e2e\create-ticket.spec.ts:80:7 › Create ticket (E2E-01) › an invalid form is refused with errors under the offending fields (864ms)
  ok  7 [chromium] › e2e\lab-03\authentication.spec.ts:23:7 › Login, shell and logout (E2E-01) › an unknown email and a wrong password show the same generic message (907ms)
  ok  8 [chromium] › e2e\lab-03\authentication.spec.ts:37:7 › Login, shell and logout (E2E-01) › an inactive account with the right password is told it is inactive (540ms)
  ok  9 [chromium] › e2e\lab-03\authentication.spec.ts:44:7 › Login, shell and logout (E2E-01) › a valid login shows the name and role in the shell and lands on My Tickets (635ms)
  ok 10 [chromium] › e2e\lab-03\authentication.spec.ts:55:7 › Login, shell and logout (E2E-01) › the session survives a reload (811ms)
  ok 11 [chromium] › e2e\lab-03\authentication.spec.ts:64:7 › Login, shell and logout (E2E-01) › visiting /login while signed in goes straight to the role home (828ms)
  ok 12 [chromium] › e2e\lab-03\authentication.spec.ts:72:7 › Login, shell and logout (E2E-01) › logout ends the session: Back and direct URLs both land on Login (1.7s)
  ok 13 [chromium] › e2e\lab-03\authentication.spec.ts:101:7 › Login, shell and logout (E2E-01) › an anonymous visitor is sent to Login and returned after signing in (575ms)
  ok 14 [chromium] › e2e\lab-03\authentication.spec.ts:115:7 › Initial password change (E2E-02, MIG-02) › a first login is forced through Change Password before the app opens (1.5s)
  ok 15 [chromium] › e2e\lab-03\authentication.spec.ts:154:7 › Role navigation and forbidden pages (E2E-03) › a Requester sees only Requester links and is refused the staff and admin areas (991ms)
  ok 16 [chromium] › e2e\lab-03\authentication.spec.ts:175:7 › Role navigation and forbidden pages (E2E-03) › IT Staff land on the queue, see the Queue link, and are refused /admin/users (963ms)
  ok 17 [chromium] › e2e\lab-03\authentication.spec.ts:191:7 › Role navigation and forbidden pages (E2E-03) › an Administrator lands on Users and sees Users and Queue (576ms)
  ok 18 [chromium] › e2e\ownership.spec.ts:19:7 › Ownership guard (E2E-03) › opening another requester's ticket shows access denied (1.6s)
  ok 19 [chromium] › e2e\ownership.spec.ts:35:7 › Ownership guard (E2E-03) › another requester cannot download the owner's attachment (1.6s)
  ok 20 [chromium] › e2e\ownership.spec.ts:65:7 › Ownership guard (E2E-03) › the requester still sees their own ticket after the switch back (2.6s)
  20 passed (24.0s)
```

Turned to Pass: MIG-01, MIG-02, E2E-01, E2E-02, E2E-03; the Lab 2 E2E flows (create ticket, attachments, ownership) now run on the session cookie instead of the Development Requester selector. E2E-02 changes Sarah's password, so the seed is re-run before each E2E run to reset her.

Found only by the E2E run and fixed: (1) after logout the route guard could redirect before the shell's own navigate and leave `?from=` on `/login`; (2) after login the "already signed in" redirect could override the `from` destination. Both now go through one decision (`loggedOut` flag on the auth context; `destinationFor` shared by both paths in Login). (3) The suite's fixed unknown email tripped BR-07's throttle after five runs in fifteen minutes — proof the throttle works, and the test now uses a fresh address per run.

### Final run on `main`

Full output of the three commands on the release commit, pasted at submission.

---

## 6. Issue Coverage

| Issue | Tests it must turn to Pass |
| --- | --- |
| Authentication foundation | MIG-01, MIG-02, UNIT-01, UNIT-05, UNIT-06, UNIT-07, API-01 … API-07, API-09 … API-13, API-17 … API-20, UI-01 … UI-09, UI-20, E2E-01, E2E-02 |
| Requester regression, comments, resolution | API-21 … API-25, UI-19, E2E-04 |
| IT Staff Ticket Queue | UNIT-04, API-26 … API-30, UI-10 … UI-13, UI-25 |
| IT Staff Ticket operations | UNIT-02, UNIT-03, API-08, API-14, API-16, API-31 … API-39, UI-14 … UI-18, E2E-03, E2E-05 |
| Administrator user management | API-15, API-40 … API-48, UI-21 … UI-24, E2E-06 |
| E2E, visual inspection, release | E2E-07, §4, §5 final run |
