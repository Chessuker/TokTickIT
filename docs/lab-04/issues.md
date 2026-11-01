# Lab 4 — GitHub Issues (drafts)

GitHub Issues #52 – #58, opened on the Kanban (same statuses as Labs 2 and 3). Use these numbers in the Appendix of [specification.md](specification.md) and the PR table of [reviewer.md](reviewer.md); each branch is named `feature/<number>-<slug>`.

Branch flow: `feature/*` → `lab4-staging` (created from `main`) → `main` via one release PR.

Dependency order: #52 → #53 → {#54, #55, #56 in parallel} → #57 → #58.

Handout coverage map:

| Handout section | Issue |
| --- | --- |
| §4 Engineering contract, §9 Spec DD, §10 Test DD, §13 DoD | #52 |
| §5 Database increment, §6 API (Actions Taken), BR-01/BR-02 | #53 |
| §8.3 Actions Taken on Ticket Detail, Part 6 | #54 |
| §4.5 Status/resolution rules, §6.1 conflict behavior, §8.4, Part 7 | #55 |
| §4.6, §6.2, §8.1, §8.2 Dashboards, Parts 5 and 8 | #56 |
| §7 Zen Green shell, §8.5 hardening, §8.6 responsive/a11y, Part 9 | #57 |
| §12 repo structure, §14 PDF Parts 1 – 9, release | #58 |

---

## Issue #52 — Sprint 4 engineering contract

**Branch:** `feature/52-lab4-spec-docs` → `lab4-staging`

Write the Sprint 4 contract before any implementation: `docs/lab-04/specification.md` (sections 1 – 11 of handout §9), `api-spec.md`, `ui-spec.md`, `tests.md`, plus skeleton `reviewer.md`, `ai-use.md`, `README.md`.

Decisions the contract must settle (handout leaves them open):
- Action Taken fields: `actionAt`, `description`, `result`, `performedById` (auto = session user), `followUpRequired`, `followUpNote` (required iff follow-up), `attachmentNotes`; whether actions are editable by anyone or only the performer/Admin; whether delete exists (recommend: no delete — append-only, edits audited via `updatedAt`/`updatedById`).
- Part 6 of the grading table also mentions "assign / complete / cancel / inactive-assignee rejection" for Actions Taken — decide whether an Action has its own assignee + status, or document how those words map onto the Ticket workflow instead.
- Final Ticket status-transition matrix with roles (extend `server/src/ticketWorkflow.ts`), and the **resolution gate** (proposal: `→ Resolved` requires an owner, ≥ 1 Action Taken, and no Action with an open follow-up).
- Requester indication "problem appears resolved" stays advisory (Lab 3 behavior kept).
- Stale-update strategy (proposal: client sends `expectedUpdatedAt` or a `version` column; server answers `409 STALE_UPDATE`).
- Exact dashboard metric names, queries, time zone (Asia/Bangkok), date boundaries ("recent" = last 7 days?), empty states and drill-down URLs.
- Migration/backfill: legacy Tickets have zero Actions Taken; how the resolution gate treats already-Resolved/Closed legacy Tickets.
- At least two justified DB design decisions; Product Definition of Done (worked out with the LLM).

Done when:
- [ ] All four contract documents merged to `lab4-staging` before the first implementation PR (screenshot the merge for Answer Part 2).
- [ ] Every FR/BR numbered; every AC in specification.md §9 maps to ≥ 1 test in tests.md.
- [ ] Every endpoint in api-spec.md maps to ≥ 1 API test.

## Issue #53 — Actions Taken foundation (DB + API)

**Branch:** `feature/53-actions-taken-api` · **Depends on:** #52

Prisma model `TicketAction` (FK to Ticket and User, indexes on `[ticketId, actionAt]` and `[performedById]`), migration `2026…_lab04_actions_taken` that preserves all Lab 1 – 3 data (plus a concurrency column on Ticket if chosen in #52); documented rollback/recovery; idempotent seed with Tickets that have zero, one and many Actions, all statuses, both priorities, assigned and unassigned, and data that gives both zero and non-zero dashboard metrics.

Endpoints (final paths in api-spec.md), e.g. `GET|POST /api/staff/tickets/:id/actions`, `PATCH /api/staff/tickets/:id/actions/:actionId`, and a Requester read path `GET /api/tickets/:id/actions` (owned Tickets only). Backend enforces role (Requester read-only), validation (follow-up note required when follow-up = true), stale-update `409`, and safe errors.

Tests: `server/tests/lab-04/actions-taken.api.test.ts` + unit tests for the validation rules; migration test recorded in tests.md.

Done when tests.md rows for Actions Taken API, migration and seed are all Pass.

## Issue #54 — Actions Taken UI

**Branch:** `feature/54-actions-taken-ui` · **Depends on:** #53

"Actions Taken" area/tab on `StaffTicketDetail`: list/table (stable order by action date/time), create mode, view/edit mode, Follow-Up Required toggle that reveals a required Follow-up Note, Attachment Notes field, performer shown as read-only (auto). Requester Ticket Detail shows the same list read-only. Loading / empty / validation / conflict (409) / forbidden / safe-failure feedback; double-submit protection; entered data kept after a recoverable failure; desktop table ↔ mobile cards.

Tests: `client/.../lab-04/ActionsTaken.test.tsx`, `e2e/lab-04/actions-taken-flow.spec.ts` (several Actions by different IT Staff on one Ticket).

Done when Part 6 can be demonstrated end to end and screenshots land in `artifacts/lab-04/screenshots/actions-taken/`.

## Issue #55 — Ticket workflow, resolution gate and stale updates

**Branch:** `feature/55-ticket-workflow` · **Depends on:** #53

Extend `ticketWorkflow.ts` with the final transition matrix and resolution gate from #52; enforce on the backend even when the UI is bypassed; Requester resolution indication remains advisory; stale-update detection on status / owner / IT priority changes (`409` with a reload prompt). UI shows only permitted transitions, refreshes the Ticket summary status after success, shows the gate reason when Resolve is blocked.

Tests: `server/tests/lab-04/ticket-workflow.api.test.ts` (every allowed and refused pair, gate, stale update), `client/.../lab-04/TicketWorkflow.test.tsx`, `e2e/lab-04/ticket-resolution.spec.ts` (New → … → Resolved → Closed, Reopened, Cancelled).

Done when Part 7 (permitted transitions, stable ordering, append-only history, role visibility) can be demonstrated.

## Issue #56 — Role dashboards

**Branch:** `feature/56-dashboards` · **Depends on:** #53 (#55 for status semantics)

Backend-computed, concise endpoints (no full Ticket collections), e.g. `GET /api/dashboard/requester` (only the caller's Tickets: open, waiting for me, recently updated, recently resolved) and `GET /api/staff/dashboard` (unassigned, my Tickets, by status, by IT Priority, recently updated, my recent Actions Taken; Administrator reuses it, optionally with user-account counts). Each metric has a documented query, empty value and drill-down query string into My Tickets / Staff Queue / Ticket Detail.

UI: `RequesterDashboard` and `StaffDashboard` with metric cards (label + value + accessible link), recent list, quick actions, loading / empty / forbidden / safe-failure states; Dashboard becomes the post-login landing page and gets a nav item with active indication.

Tests: `server/tests/lab-04/requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts` (counts match seeded data and direct Prisma queries, ownership protection), `client/.../lab-04/RequesterDashboard.test.tsx`, `StaffDashboard.test.tsx`, `e2e/lab-04/dashboards.spec.ts` (drill-down lands on the matching filtered list).

Done when Parts 5 and 8 (metrics) can be demonstrated, including evidence that selected metrics match DB queries.

## Issue #57 — Final hardening, regression and accessibility

**Branch:** `feature/57-final-hardening` · **Depends on:** #54 – #56

Full Labs 1 – 3 regression (auth, My Tickets, Ticket Detail, attachments, public comments, staff queue/operations, internal notes, admin user management) still green; consistent loading / validation / success / empty / forbidden / conflict / not-found / safe-failure feedback across screens; duplicate-click and retry protection; form data preserved after recoverable errors; remove console errors, broken links, placeholder text, obsolete or duplicate UI from earlier labs; keyboard focus, semantic labels, non-color status cues, no clipping/overlap/horizontal scroll; README setup / migrate / seed / test / demo instructions current.

Done when the visual and accessibility checklist in ui-spec.md is filled and the full regression suite passes on `lab4-staging`.

## Issue #58 — E2E, visual inspection and release

**Branch:** `feature/58-e2e-release` · **Depends on:** #57

`e2e/lab-04/*.spec.ts` complete; screenshots at 1280 / 820 / 375 for all major Lab 4 screens into `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/`; tests.md final status column and full test output from `main`; `ai-use.md` with LLM name, 6 – 10 key prompts and "My Reflection"; `reviewer.md` with reviewer identity, PR links, comments, responses, approvals; `answer-part1..9.md` and `build-submission-pdf.mjs` for Lab 4; release PR `lab4-staging` → `main`; all Issues moved to Done on the Kanban.

Done when the single submission PDF (Answer Part 1 – 9) is built from `main`.
