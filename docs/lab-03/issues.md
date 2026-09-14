# Lab 3 — GitHub Issues (drafts)

Copy each block into a new GitHub Issue on the Kanban (same statuses as Lab 2). Once the numbers exist, fill them into the Appendix of [specification.md](specification.md), the PR table of [reviewer.md](reviewer.md), and name each branch `feature/<number>-<slug>`.

Dependency order: 1 → 2 → {3, 4, 5, 6 in parallel} → 7.

---

## Issue 1 — Sprint 3 engineering contract

**Branch:** `feature/<n>-lab3-spec-docs` → `lab3-staging`

Write the Sprint 3 contract before any implementation: `docs/lab-03/specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, plus skeleton `reviewer.md`, `ai-use.md`, `README.md`.

Done when:
- [ ] All four contract documents merged to `lab3-staging` before the first implementation PR.
- [ ] Every AC in specification.md §9 maps to at least one test in tests.md §3.
- [ ] Every endpoint in api-spec.md §3 maps to at least one API test.
- [ ] Merge screenshotted for Answer Part 2.

## Issue 2 — Authentication foundation

**Branch:** `feature/<n>-auth-foundation` · **Depends on:** Issue 1

Migration `20260915000000_lab03_users_roles_workflow` (rename `RequesterUser` → `User`, drop legacy `User`, add role/password/session/ticket workflow columns, comment and note tables); `bcryptjs` + `cookie-parser`; `requireAuth` / `requireRole`; `POST /api/auth/login|logout|change-password`, `GET /api/auth/me`; login throttle; seed users for all roles; client `AuthProvider`, `apiClient`, `RequireAuth`, `Login`, `ChangePassword`; `AppShell` shows user/role/logout with role nav; Development Requester selector, `X-Requester-Id`, `/api/requesters`, `/api/users` removed; Lab 2 Requester routes and tests switched to the session.

Covers FR-01 … FR-05, FR-14; BR-01 … BR-14, BR-28 … BR-30; AC-01 … AC-13, AC-31, AC-32.

Done when tests.md §6 row "Authentication foundation" is all Pass and the migration log in tests.md §5 is recorded.

## Issue 3 — Requester regression, Public Comments and resolution indication

**Branch:** `feature/<n>-requester-comments` · **Depends on:** Issue 2

`GET|POST /api/tickets/:id/comments`, `POST /api/tickets/:id/resolution-indication`; `CommentsPanel` and "Problem appears resolved" on the Requester Ticket Detail; staff/admin read path for attachments; Lab 2 E2E helpers rewritten to log in through the UI.

Covers FR-05 … FR-07; BR-21 … BR-23; AC-13 … AC-15, AC-24 (read path).

## Issue 4 — IT Staff Ticket Queue

**Branch:** `feature/<n>-staff-queue` · **Depends on:** Issue 2

`GET /api/staff/tickets` with search/filters/sort/pagination (reuse `ticketListQuery.ts`), `GET /api/staff/assignees`; shared `Badges.tsx`; `StaffTicketQueue` desktop table / mobile cards with all feedback states.

Covers FR-08; AD-10; AC-16, AC-17, AC-34.

## Issue 5 — IT Staff Ticket operations

**Branch:** `feature/<n>-staff-ticket-ops` · **Depends on:** Issue 2 (Issue 4 for the queue link)

`ticketWorkflow.ts` (transition matrix + owner rule, unit-tested); `GET /api/staff/tickets/:id`, claim / owner / it-priority / status endpoints; Internal Notes endpoints; `StaffTicketDetail` with read-only group, three operational controls, tabs, confirmation dialog, Administrator read-only view.

Covers FR-09 … FR-12; BR-15 … BR-23; AC-18 … AC-24.

## Issue 6 — Administrator user management

**Branch:** `feature/<n>-admin-users` · **Depends on:** Issue 2

`/api/admin/users` list/create/get/patch/initial-password with duplicate-email, self-deactivation and last-Administrator guards and session revocation; `UserManagement` list + side panel.

Covers FR-13; BR-24 … BR-27; AC-25 … AC-30.

## Issue 7 — E2E, visual inspection and release

**Branch:** `feature/<n>-e2e-release` · **Depends on:** Issues 3 – 6

`e2e/lab-03/*.spec.ts` complete; screenshots at 1280 / 820 / 375 into `artifacts/lab-03/screenshots/`; ui-spec.md §5 and tests.md §4 filled; final test run on `lab3-staging` pasted into tests.md §5; `ai-use.md` reflection; `answer-part1..9.md` and `build-submission-pdf.mjs` for Lab 3; release PR `lab3-staging` → `main`.

Covers AC-33, AC-34 and Definition of Done §10.2.
