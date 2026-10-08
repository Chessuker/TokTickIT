# Lab 4 — Sprint Engineering Specification

| Field | Detail |
| --- | --- |
| Project | TokTickIT |
| Sprint / Lab | CPE334 Lab 4 — Actions Taken, Dashboards, and Final Regression |
| Author | Thawat Boonsuk (67070501024) |
| Status | Draft — contract for Sprint 4, written before implementation |
| Last updated | 2026-10-03 |
| Extends | [Lab 3 specification](../lab-03/specification.md) — every Lab 3 FR, BR, AC and AD stays in force unless a section below changes it. Lab 3 ids are written with an `L3` prefix (e.g. L3 BR-18) to keep them apart from the Lab 4 ids in this document |
| Related documents | [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md), [tests.md](tests.md), [issues.md](issues.md), [reviewer.md](reviewer.md), [ai-use.md](ai-use.md) |

---

## 1. Sprint Goal

Give IT Staff a reliable record of the work done on each Ticket. Every Ticket can now hold many Actions Taken, each saying when, what was done, the result, who did it (set by the server), and whether follow-up is needed and who owns that follow-up. A Ticket can only become Resolved when the work record supports it. The server also enforces the final status workflow, keeps an append-only status history, and refuses stale updates, so two IT Staff working the same Ticket cannot silently overwrite each other. Each role lands on a short dashboard whose counts come from the server, and each count links to the list behind it. Everything from Labs 1–3 keeps working, and the whole application is checked again for regressions, consistency, responsiveness and accessibility before the final demonstration.

---

## 2. Stakeholder Request Interpretation

- **What is missing today:** IT Staff can claim a Ticket, talk to the Requester and keep private notes, but nowhere records the work itself: what was tried, what happened, and what is still pending. A Ticket can be marked Resolved even when nobody wrote down a fix. Two IT Staff on the same Ticket can also overwrite each other's status change without knowing it.
- **Actions Taken:** a list of work entries under one Ticket. Each entry records when the work was done, what was done, the result, and who did it. The person is always the signed-in user; nobody can type it. An entry may say that follow-up is still needed. Then it must also say what the follow-up is and which IT Staff member is responsible. The follow-up later ends as Completed or Cancelled. An entry may also hold a short note pointing at the relevant files ("see `error-log.png` in Attachments"). Files are still uploaded through the Lab 2 attachment feature.
- **Owner vs performer:** the Ticket Owner coordinates the Ticket. Anyone in IT Staff (or an Administrator helping out) may record work on it. The performer and the owner are two separate fields and may be different people.
- **Resolution:** the Requester can still say "this looks fixed". That is a hint, never a status change. Only IT Staff move a Ticket to Resolved, and only when the record supports it: there is an owner, at least one Action Taken records the work, and no follow-up is still open.
- **Dashboards:** a landing page per role, one screen high. It shows the few numbers each role acts on, plus short lists of the Tickets that need attention. Every number links to the full list it summarises. The dashboard is a starting point and does not replace My Tickets or the Queue.
- **Hardening:** no new big features. The same Zen Green look everywhere, no leftovers from earlier labs, consistent loading/error/empty states, no double submissions, and proof that Labs 1–3 still work.
- **What I read as out of scope:** everything in §3.2. In particular: no SLA timers, no notifications, no time sheets, and no editable or deletable history.

---

## 3. Scope

### 3.1 Included

- Actions Taken: create, list, view and edit, with follow-up assignment, completion and cancellation (FR-01 … FR-04).
- Resolution gate, the final transition matrix, append-only status history, and stale-update protection on every Ticket workflow write (FR-05 … FR-07).
- Requester dashboard, IT Staff dashboard and an Administrator variant, computed by the backend, with drill-down into My Tickets / Queue / Ticket Detail (FR-08 … FR-10).
- Prisma migration, rollback script, backfill rules for legacy Tickets, and an idempotent seed extended with Actions Taken (FR-11).
- Full Labs 1–3 regression, consistent feedback states, protection against duplicate submissions, form-data preservation, removal of leftovers, and up-to-date README (FR-12, FR-13).
- Zen Green extensions for dashboards, Actions Taken, follow-up badges and status history; responsive and accessible at 1280 / 820 / 375 px (FR-14).

### 3.2 Excluded

| ID | Excluded | Why |
| --- | --- | --- |
| X-01 | SLA clocks, escalation engines, on-call schedules, breach notifications | Handout §4.2 |
| X-02 | Email, SMS, LINE, push or any external notification, including "follow-up assigned to you" messages | Handout §4.2. The IT Staff dashboard "My open follow-ups" card takes the place of a notification |
| X-03 | Inventory, spare parts, purchasing, cost accounting | Handout §4.2 |
| X-04 | Time-sheet billing, payroll, labour cost, time spent per Action | Handout §4.2. An Action records *when*, not *how long* |
| X-05 | Multi-level approvals, electronic signatures | Handout §4.2 |
| X-06 | BI tools, custom reports, exports, charts over time, "+3 from yesterday" trend deltas shown in the handout mockup | Handout §4.2. A delta needs a stored daily snapshot, which is a reporting warehouse in miniature |
| X-07 | Multi-tenant organisations, production cloud operations | Handout §4.2 |
| X-08 | Deleting an Action Taken, or editing/deleting a status history entry | Append-only (BR-08, BR-18). A mistaken entry is corrected by editing its text; a mistaken follow-up is Cancelled |
| X-09 | Uploading files inside an Action Taken | The Lab 2 attachment feature stays the only file store; *Attachment Notes* is text that points at it (AD-05) |
| X-10 | Administrators changing Ticket status, owner or IT Priority | Lab 3 L3 BR-17 / L3 AD-04 kept; Administrators gain Actions Taken only (AD-02) |
| X-11 | A Requester reopening a Ticket or replying to an Action Taken | Unchanged from Lab 3 (L3 X-15); a Requester replies through Public Comments |
| X-12 | Time-window counts on dashboards ("resolved this week") | No count depends on the clock, so there is no day boundary to get wrong (BR-25, AD-08) |
| X-13 | Any new feature not listed in §3.1 | Handout §4.2 |

---

## 4. Functional Requirements

| ID | Requirement | Description | Priority |
| --- | --- | --- | --- |
| FR-01 | Record an Action Taken | IT Staff or an Administrator adds an Action Taken to a Ticket with Action Date/Time, Action Description, Result, Follow-Up Required?, Follow-up Note and Follow-up Assignee (both required only when follow-up is needed), and Attachment Notes. The server sets Performed by to the signed-in user. | Must |
| FR-02 | Edit an Action Taken | IT Staff or an Administrator edits the text fields and Action Date/Time of an existing Action. The Ticket, Performed by and creation time never change. The server records who last edited it and refuses an edit based on a stale copy. | Must |
| FR-03 | Follow-up lifecycle | A follow-up is assigned to an active IT Staff member and is Open until IT Staff mark it Completed or Cancelled. The assignee can be changed while it is Open. Inactive or non-IT-Staff assignees are rejected. | Must |
| FR-04 | View Actions Taken | IT Staff and Administrators see every Action of a Ticket on the Staff Ticket Detail. The Requester sees the same list read-only on their own Ticket Detail. | Must |
| FR-05 | Resolution gate | A Ticket becomes Resolved only when it has an owner, at least one Action Taken since it was last reopened, and no open follow-up. The server enforces this. The UI hides Resolved and says which condition is missing. | Must |
| FR-06 | Final workflow and status history | Status changes follow the matrix in §5. Every status change, including the automatic New → Open on claim, is appended to a history that shows from, to, who and when. The history is visible on Ticket Detail and can never be edited. | Must |
| FR-07 | Stale-update protection | Status, owner, IT Priority, claim and Action edits carry the version the client last saw. If someone else changed the record in between, the server answers `409 STALE_UPDATE` and the UI offers to reload, so nobody unknowingly overwrites a recent change. | Must |
| FR-08 | Requester dashboard | A Requester's landing page shows counts for their own open, waiting-for-them, resolved and closed Tickets, plus short lists (needs attention, recently updated, recently resolved). Every count and item links to the detailed view. | Must |
| FR-09 | IT Staff dashboard | IT Staff land on a dashboard with Unassigned, My open Tickets, My open follow-ups, Requester-reports-resolved, counts by status and by IT Priority, and short lists (urgent, recently updated, my recent Actions). Administrators get the same dashboard without the "my" cards, plus user-account counts. | Must |
| FR-10 | Dashboard navigation and drill-down | "Dashboard" is the first navigation item and the post-login home for every role, with an active-page indication. My Tickets and the Queue accept the filters the dashboard links use, so the list a card opens has the same total as the card. | Must |
| FR-11 | Migration, backfill and seed | One additive migration preserves all Lab 1–3 data. A tested rollback script removes it again. Legacy Tickets get defined behaviour. The seed stays idempotent and adds Actions Taken (zero, one and many per Ticket), open and closed follow-ups, and a Requester with no Tickets for zero-metric demonstrations. | Must |
| FR-12 | Regression | Every Lab 2 and Lab 3 screen, endpoint and rule keeps working for the roles allowed to use it, and every earlier automated suite still passes on `main`. | Must |
| FR-13 | Product hardening | Every screen gives the same feedback for loading, validation, success, empty, no-results, forbidden, not-found, conflict and safe failure. Primary actions cannot be submitted twice. Important forms keep entered data after a recoverable failure. Console errors, broken links, placeholders and obsolete UI are removed. The README is current. | Must |
| FR-14 | Responsive and accessible | New screens follow the Lab 2/3 breakpoints, tap targets, focus, label and contrast rules, with no clipping, overlap or horizontal page scroll. | Must |

---

## 5. Business Rules

BR-01 and BR-02 are the handout's mandatory rules, kept verbatim.

### Actions Taken

| ID | Rule |
| --- | --- |
| BR-01 | Action Taken belongs to exactly one Ticket. |
| BR-02 | The Ticket Owner coordinates the Ticket, but an Action Taken may be by a different IT Staff member. |
| BR-03 | **Performed by** is the authenticated user who creates the Action. The server sets it; any `performedById` sent by the client is ignored, and it can never be changed. `ticketId` comes from the URL and can never be changed either (BR-01). |
| BR-04 | IT Staff and Administrators may create and edit Actions Taken on any Ticket they can open. A Requester may read the Actions Taken of their own Tickets and nothing else. Every write is checked by the backend; hiding a control is not authorization. |
| BR-05 | Field rules (all text is trimmed and stored as plain text, never HTML): **Action Date/Time** (`actionAt`) is required, at most 5 minutes in the future (to allow for clock skew), and not earlier than the Ticket's `createdAt`. **Action Description** is required, 1–2000 characters. **Result** is required, 1–1000 characters. **Attachment Notes** is optional, 0–500 characters, empty stored as `null`. |
| BR-06 | **Follow-Up Required?** is a yes/no field. When it is yes, **Follow-up Note** (1–1000 characters) and **Follow-up Assignee** (an active user with role `ITStaff`) are required, and the follow-up starts as `Open`. When it is no, note and assignee must be absent. An inactive, non-IT-Staff or unknown assignee is `400 VALIDATION_FAILED` on `fields.followUpAssigneeId`. |
| BR-07 | A follow-up moves only `Open → Completed` or `Open → Cancelled`. Either move stamps `followUpClosedAt` and `followUpClosedById`. A closed follow-up is final; new work needs a new Action. On an existing Action, *Follow-Up Required?* may go from no to yes (this opens a follow-up) but never from yes to no; a follow-up that is no longer needed is Cancelled, so the history stays. While `Open`, the note and the assignee may be edited (reassigning follows BR-06). If an assignee is deactivated later, their open follow-ups stay `Open` and are flagged "assignee inactive" until someone reassigns them. |
| BR-08 | Actions Taken are append-only: there is no delete. An edit keeps `id`, `ticketId`, `performedById` and `createdAt`, stamps `updatedById` and `updatedAt`, and increments `version`. |
| BR-09 | Actions may be created or edited only while the Ticket is `New`, `Open`, `InProgress`, `WaitingForRequester` or `Reopened`. On `Resolved`, `Closed` or `Cancelled` every Action write is `409 TICKET_LOCKED`; to record more work, IT Staff reopen the Ticket first. |
| BR-10 | Duplicate protection: creating an Action may carry a client-generated `clientRequestId` (UUID). A repeat with the same id from the same user on the same Ticket returns the Action already created (`200`, nothing new written). The same id from a different user or Ticket is `409 CONFLICT`. |
| BR-11 | Actions are listed in a stable order: `actionAt` newest first, then `createdAt` newest first, then `id`. Editing an Action never moves it unless its `actionAt` changes. |
| BR-12 | Creating or editing an Action, or closing a follow-up, updates `Ticket.updatedAt`, so dashboards and the Queue show the Ticket as recently updated. It does **not** increment `Ticket.version`, because recording work must never invalidate a colleague's pending status change (BR-19). |

### Ticket workflow

| ID | Rule |
| --- | --- |
| BR-13 | The eight statuses are unchanged: `New`, `Open`, `InProgress`, `WaitingForRequester`, `Resolved`, `Closed`, `Reopened`, `Cancelled`. The transition matrix below is the final one. Only IT Staff change status, owner and IT Priority; Administrators stay read-only for those three (L3 BR-17). |
| BR-14 | **Resolution gate.** Moving to `Resolved` requires all three of: (a) the Ticket has an owner; (b) at least one Action Taken was created after the Ticket last entered `Reopened`, or at any time if it has never been reopened; (c) no Action on the Ticket has a follow-up in `Open`. Otherwise the server answers `409 RESOLUTION_BLOCKED` with a message that lists each unmet condition. `permittedTransitions` leaves out `Resolved` while the gate is closed, and the Staff Ticket Detail returns `resolutionGate` so the UI can say why. |
| BR-15 | The Requester's "problem appears resolved" indication stays advisory (L3 BR-05, L3 BR-21): it sets `requesterResolvedAt` and never changes status. The IT Staff dashboard counts active Tickets that carry it ("Requester reports resolved"), so IT Staff review them and decide. |
| BR-16 | Moving a Ticket to `Cancelled` also moves every `Open` follow-up on it to `Cancelled` in the same transaction, with the cancelling user as `followUpClosedById`. |
| BR-17 | `Reopened` clears `resolvedAt`, `closedAt` and `requesterResolvedAt` (L3 BR-20, unchanged). It unlocks Actions (BR-09), and from then on BR-14(b) counts only Actions created after this reopen. |
| BR-18 | **Status history.** Every status change is appended to `TicketStatusChange` (`fromStatus`, `toStatus`, `changedById`, `createdAt`) in the same transaction as the change. This includes the automatic `New → Open` on claim/assign (L3 BR-31). The history is listed oldest first, is visible to everyone who may open the Ticket, and has no update or delete path. Ticket creation is shown as a synthetic first row ("Created") taken from `Ticket.createdAt`; it is not stored. |
| BR-19 | **Optimistic concurrency.** `Ticket.version` starts at 0 and increments on every status, owner or IT Priority change (including claim). A workflow write may carry `expectedVersion`. If it differs from the stored version, the write is refused with `409 STALE_UPDATE`, which carries the current version, and nothing changes. The Lab 4 client always sends it. On the Lab 3 endpoints it stays optional so earlier clients and tests keep working; without it a status change is still conditional on the status the server read, so a concurrent transition cannot be applied twice. Action edits use `TicketAction.version`, and on them `version` is **required**. |
| BR-20 | Owner and IT Priority changes on `Closed` / `Cancelled`, unassigning an `InProgress` Ticket, and the owner rule for `InProgress` stay as Lab 3 defined them (L3 BR-19, L3 BR-31). |

**Transition matrix** (rows = current status; ✓ = permitted for IT Staff; ⚠ = the UI asks for confirmation first; (o) = owner required; (g) = resolution gate BR-14). The only change from Lab 3 is (g) on every move into Resolved.

| From \ To | Open | InProgress | WaitingForRequester | Resolved | Closed | Reopened | Cancelled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New | ✓ | ✓ (o) | – | – | – | – | ⚠ |
| Open | – | ✓ (o) | ✓ | ⚠ (g) | – | – | ⚠ |
| InProgress | – | – | ✓ | ⚠ (g) | – | – | ⚠ |
| WaitingForRequester | – | ✓ (o) | – | ⚠ (g) | – | – | ⚠ |
| Resolved | – | – | – | – | ⚠ | ✓ | – |
| Closed | – | – | – | – | – | ✓ | – |
| Reopened | – | ✓ (o) | ✓ | ⚠ (g) | – | – | ⚠ |
| Cancelled | – | – | – | – | – | – | – |

### Dashboards

| ID | Rule |
| --- | --- |
| BR-21 | Dashboard numbers are computed by the backend on every request, from the live tables, inside one read transaction, so all counts on one response describe the same moment. Nothing is cached or stored. Each response carries `generatedAt`. |
| BR-22 | **Active** statuses are `New`, `Open`, `InProgress`, `WaitingForRequester`, `Reopened`. An **open follow-up** is an Action with `followUpStatus = Open` on a Ticket in an active status. These two words mean exactly this in every metric below. |
| BR-23 | The Requester dashboard counts only Tickets whose `requesterId` is the session user. No query parameter can widen it; parameters are ignored. |
| BR-24 | The IT Staff dashboard spans all Tickets. "My" metrics use `ownerId` (Tickets) or `followUpAssigneeId` (follow-ups) = the session user. For an Administrator the "my" metrics are `null` (Administrators cannot own Tickets or follow-ups), and a `users` block is added. |
| BR-25 | Recent and urgent lists have a fixed length of 5 and a fixed order (§5 metric table). No count or list uses a time window, so there is no day boundary. Timestamps are returned as UTC ISO-8601 and displayed in **Asia/Bangkok (UTC+7)**. |
| BR-26 | Empty behaviour: a count with no matches is returned as `0`, never omitted, and is shown as "0" with the caption "None right now". An empty list is `[]` and shows its own one-line empty message. A Requester with no Tickets at all sees the dashboard empty state with a Create Ticket call to action. |
| BR-27 | Drill-down consistency: every card has a defined `href`, and the list it opens applies the same filter. The total on that list therefore equals the card's count at the same moment (tested by AC-20). |

**Metric definitions** (`{active}` = `status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened`)

| Dashboard | Key | Label | Calculation | Drill-down |
| --- | --- | --- | --- | --- |
| Requester | `open` | My open tickets | count, `requesterId = me`, status ∈ active | `/tickets?{active}` |
| Requester | `waitingForMe` | Waiting for you | count, `requesterId = me`, status = `WaitingForRequester` | `/tickets?status=WaitingForRequester` |
| Requester | `resolved` | Resolved | count, `requesterId = me`, status = `Resolved` | `/tickets?status=Resolved` |
| Requester | `closed` | Closed | count, `requesterId = me`, status = `Closed` | `/tickets?status=Closed` |
| Requester | `needsAttention` (list) | Needs your reply | `requesterId = me`, status = `WaitingForRequester`, `updatedAt desc`, 5 | `/tickets/:id` |
| Requester | `recentlyUpdated` (list) | Recently updated | `requesterId = me`, any status, `updatedAt desc`, 5 | `/tickets/:id` |
| Requester | `recentlyResolved` (list) | Recently resolved | `requesterId = me`, status ∈ {`Resolved`, `Closed`}, `resolvedAt desc`, 5 | `/tickets/:id` |
| Staff | `unassigned` | Unassigned | count, `ownerId IS NULL`, status ∈ active | `/staff/queue?owner=unassigned&{active}` |
| Staff | `mine` | My open tickets | count, `ownerId = me`, status ∈ active (`null` for Administrator) | `/staff/queue?owner=me&{active}` |
| Staff | `myFollowUps` | My open follow-ups | count of Actions, `followUpAssigneeId = me`, open follow-up (`null` for Administrator) | `/staff/queue?followUp=mine` |
| Staff | `requesterReportsResolved` | Requester reports resolved | count, `requesterResolvedAt IS NOT NULL`, status ∈ active | `/staff/queue?requesterResolved=true&{active}` |
| Staff | `byStatus` | New · Open · In Progress · Waiting · Reopened · Resolved | count per status for the five active statuses plus `Resolved` (awaiting closure) | `/staff/queue?status=<status>` |
| Staff | `byItPriority` | IT High · Medium · Low | count per `itPriority`, status ∈ active | `/staff/queue?itPriority=<p>&{active}` |
| Staff | `urgent` (list) | Urgent | status ∈ active, `itPriority = High`, `updatedAt asc` (longest untouched first), 5 | `/staff/tickets/:id` |
| Staff | `recentlyUpdated` (list) | Recently updated | any status, `updatedAt desc`, 5 | `/staff/tickets/:id` |
| Staff | `myRecentActions` (list) | My recent actions | Actions with `performedById = me`, `createdAt desc`, 5 (empty for an Administrator who has recorded none) | `/staff/tickets/:id#actions` |
| Admin | `users` | Users | active users per role, plus total inactive | `/admin/users` |

`myFollowUps` counts follow-ups, not Tickets. The Queue it opens lists the *Tickets* that hold them. The card's caption says "across N tickets" so the two numbers are never confused (AC-20).

### Hardening, migration and regression

| ID | Rule |
| --- | --- |
| BR-28 | Error semantics follow L3 BR-30, with three new `409` codes: `STALE_UPDATE` (BR-19), `TICKET_LOCKED` (BR-09), `RESOLUTION_BLOCKED` (BR-14). A `500` body is always the generic message plus a correlation id. |
| BR-29 | The migration only adds things: new tables, a new enum, and `Ticket.version` defaulting to 0. It drops, rewrites and re-keys nothing. Legacy Tickets have zero Actions, `version = 0` and no stored history. A legacy `Resolved`/`Closed` Ticket stays valid: the gate (BR-14) applies only to moves *into* Resolved made after the migration. |
| BR-30 | The seed stays idempotent (L3 BR-29): Actions and history rows are upserted by fixed ids, and nothing is deleted. Seeded Resolved/Closed Tickets satisfy BR-14, except one Closed Ticket left with zero Actions on purpose to show legacy behaviour. |
| BR-31 | Every Lab 3 rule (L3 BR-01 … BR-31) still applies, with exactly these changes: the role home is `/dashboard` for every role (L3 ui-spec §3.0); L3 BR-18 gains the resolution gate (BR-14); Administrators gain Actions Taken writes (BR-04) and nothing else. |

### Authorization matrix (Lab 4 rows; Lab 3 rows unchanged)

| Operation | Requester | IT Staff | Administrator |
| --- | --- | --- | --- |
| List Actions Taken of a Ticket | ✓ owner (read-only endpoint) | ✓ | ✓ |
| Create Action Taken | – | ✓ | ✓ |
| Edit Action Taken, reassign / complete / cancel follow-up | – | ✓ | ✓ |
| Be a follow-up assignee | – | ✓ active only | – |
| Read status history | ✓ owner | ✓ | ✓ |
| Change status / owner / IT Priority / claim | – | ✓ | – (L3 BR-17) |
| Requester dashboard | ✓ own | – | – |
| IT Staff dashboard | – | ✓ | ✓ (admin variant) |

---

## 6. UI Specification Summary

Full details are in [ui-spec.md](ui-spec.md). Summary:

- **Shell:** "Dashboard" becomes the first navigation item for every role and the post-login home (`/dashboard`, one route that renders the role's dashboard). The active item is underlined, as before. Requester: Dashboard · My Tickets · Create Ticket. IT Staff: Dashboard · Queue. Administrator: Dashboard · Users · Queue.
- **Dashboards:** a greeting line and a Refresh button. Below that, a row of metric cards; each card is one link with a label, a large value and a "View" cue, and its accessible name reads e.g. "Waiting for you: 2 tickets". Then two or three short lists of Ticket rows (number, summary, status badge, Bangkok time) and Quick Actions. Each block has its own loading, empty and safe-failure state; the page shows forbidden or not-signed-in states as in Lab 3.
- **Actions Taken (Staff Ticket Detail):** a new first tab, "Actions Taken (n)". It shows a list (table on desktop, cards below 768 px) in BR-11 order. "Record action" opens **create mode** inline. Selecting an entry opens **view mode**, and Edit switches it to **edit mode**. Turning on Follow-Up Required reveals the Follow-up Note and Assignee fields. Open follow-ups show Complete / Cancel buttons. The panel caption says "Visible to the requester", so it is never confused with the amber Internal Notes.
- **Actions Taken (Requester Ticket Detail):** the same list, read-only, titled "Work done by IT", above Public Comments.
- **Workflow:** the status select lists only `permittedTransitions`. When Resolved is unavailable because of the gate, a hint lists the unmet conditions with links to the Actions tab. After a successful change, the header status badge and the History tab refresh. A `409 STALE_UPDATE` shows a conflict callout with "Reload ticket", and the user's own pending input is kept.
- **History tab:** a chronological timeline: Created, then each change "Open → In Progress · Priya Raman · 3 Oct 2026, 14:05".
- **Feedback, responsive, accessibility:** the Lab 3 feedback table, breakpoints and V-checklist are reused and extended (V-15 … V-20 for dashboards, Actions Taken and history). Screenshots are taken at 1280 / 820 / 375 px.

---

## 7. Data Changes

PostgreSQL via Prisma. One additive migration: `20261003000000_lab04_actions_taken`.

### `TicketAction` (new)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | |
| `ticketId` | `String` | FK → `Ticket`, `onDelete: Restrict`; never updated (BR-01) |
| `actionAt` | `DateTime` | Action Date/Time, user-entered, stored UTC (BR-05) |
| `description` | `String` | 1–2000 |
| `result` | `String` | 1–1000 |
| `attachmentNotes` | `String?` | 0–500 |
| `performedById` | `String` | FK → `User` (`"ActionPerformer"`), `onDelete: Restrict`; set from the session (BR-03) |
| `followUpRequired` | `Boolean @default(false)` | |
| `followUpNote` | `String?` | Required iff `followUpRequired` |
| `followUpAssigneeId` | `String?` | FK → `User` (`"FollowUpAssignee"`), `onDelete: Restrict`; required iff `followUpRequired` |
| `followUpStatus` | `FollowUpStatus?` | `enum FollowUpStatus { Open, Completed, Cancelled }`; `null` iff no follow-up |
| `followUpClosedAt` | `DateTime?` | Set on Completed / Cancelled |
| `followUpClosedById` | `String?` | FK → `User` (`"FollowUpCloser"`) |
| `clientRequestId` | `String? @unique` | BR-10 |
| `version` | `Int @default(0)` | BR-19 |
| `updatedById` | `String?` | FK → `User` (`"ActionEditor"`); `null` until the first edit |
| `createdAt`, `updatedAt` | `DateTime` | |

A database `CHECK` constraint keeps the follow-up columns consistent, whatever code writes them: `followUpRequired = (followUpStatus IS NOT NULL) = (followUpNote IS NOT NULL) = (followUpAssigneeId IS NOT NULL)`.

### `TicketStatusChange` (new, append-only)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | |
| `ticketId` | `String` | FK → `Ticket`, `onDelete: Restrict` |
| `fromStatus` | `TicketStatus` | |
| `toStatus` | `TicketStatus` | |
| `changedById` | `String` | FK → `User`, `onDelete: Restrict` |
| `createdAt` | `DateTime @default(now())` | |

The application never calls `update` or `delete` on this model. A unit test asserts that no route module references either (UNIT-09).

### `Ticket` (changed)

| Field | Change |
| --- | --- |
| `version` | New `Int NOT NULL DEFAULT 0` (BR-19). Existing rows get 0 from the default; no backfill statement needed |
| relations | `actions TicketAction[]`, `statusChanges TicketStatusChange[]` |

`User` gains only the reverse relations (`actionsPerformed`, `followUpsAssigned`, `followUpsClosed`, `actionsEdited`, `statusChanges`); no columns change.

### Indexes

| Model | Index | Serves |
| --- | --- | --- |
| `TicketAction` | `@@index([ticketId, actionAt])` | The per-Ticket list in BR-11 order; the gate's "any Action since reopen" check |
| `TicketAction` | `@@index([performedById, createdAt])` | "My recent actions" |
| `TicketAction` | `@@index([followUpAssigneeId, followUpStatus])` | "My open follow-ups" and `followUp=mine` on the Queue |
| `TicketAction` | `@@index([ticketId, followUpStatus])` | The gate's "no open follow-up" check |
| `TicketStatusChange` | `@@index([ticketId, createdAt])` | Timeline; "last entered Reopened" |
| `Ticket` | `@@index([requesterId, status])` | Requester dashboard counts (the Lab 2 `[requesterId, createdAt]` index serves the list, not the counts) |

The Lab 3 indexes `[ownerId, status]`, `[status]`, `[itPriority]` and `[updatedAt]` already serve the IT Staff counts and lists.

### Database design decisions (justified)

| ID | Decision | Why |
| --- | --- | --- |
| DB-01 | Actions Taken are a child table with `ticketId` and `performedById` as `Restrict` foreign keys that are never updated. They are not a JSON column on `Ticket`, and they do not reuse the comment table. | BR-01 becomes a database fact: an Action cannot exist without exactly one Ticket and cannot be moved. Rows can be indexed and counted for dashboards (a JSON array cannot be counted without scanning every Ticket). `Restrict` rather than `Cascade` (which comments use) because Actions are an audit record: removing a Ticket must not silently remove the evidence of work done. Tickets are never deleted anyway, so `Restrict` costs nothing. |
| DB-02 | Optimistic concurrency uses an integer `version`, not `updatedAt`. | `updatedAt` changes on every comment and Action (BR-12), so using it would make a status change fail just because someone posted a comment. A version that moves only on workflow fields detects exactly the conflict the handout describes (§6.1). Comparing integers is exact; comparing timestamps depends on millisecond rounding between JavaScript and PostgreSQL. |
| DB-03 | The follow-up lives on the Action (four columns + `CHECK`), not in a separate `FollowUp` table. | A follow-up exists only because of one Action and never outlives it. One row keeps the create form a single atomic write, and the `CHECK` constraint makes a half-filled follow-up impossible. |
| DB-04 | Status history is a separate append-only table. Status is not recomputed from it. | `Ticket.status` stays the single authoritative value that every Lab 3 query already filters on. History is an audit trail written in the same transaction, so the two cannot disagree. |
| DB-05 | Dashboards query live tables; there is no summary table. | At this size (tens to low thousands of Tickets) a `groupBy` over indexed columns takes milliseconds (PERF-01). A summary table would need triggers or jobs to stay right, and stale counts are exactly what the handout warns against ("calculated by the backend from authoritative data"). |

### Migration, backfill and rollback (BR-29)

1. `CREATE TYPE "FollowUpStatus"`.
2. `ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0`.
3. Create `TicketAction` with its FKs, `CHECK` constraint and indexes; create `TicketStatusChange` with FKs and index.
4. `CREATE INDEX` on `Ticket(requesterId, status)`.

**Backfill:** none needed. Legacy Tickets have zero Actions, version 0 and no stored history. Their History tab shows only the synthetic "Created" row and the line "History is recorded from Lab 4 onward." Dashboards count legacy Tickets like any other, because every metric uses only Lab 3 columns or the new tables.

**Rollback:** `server/prisma/rollback/20261003000000_lab04_actions_taken.down.sql` drops the two tables, the enum, the index and the `version` column, then deletes the row from `_prisma_migrations`. It is tested (MIG-02) by: migrate → verify → roll back → verify that Lab 3 counts are unchanged and the Lab 3 suites pass → migrate again. Recovery for a failed forward migration: Prisma runs each migration in a transaction, so a failure leaves the Lab 3 schema intact. Fix the problem, then `prisma migrate resolve --rolled-back` and deploy again.

### Seed data (idempotent, BR-30)

| Set | Rows | Notes |
| --- | --- | --- |
| Users | Lab 3 set, plus one active Requester with no Tickets, **Ploy Charoen** (`Requester3!`, `mustChangePassword = false`) | Zero-metric Requester dashboard demonstration (AC-21) |
| Tickets | The 24 Lab 3 Tickets, unchanged | Every status, priority, assigned and unassigned |
| Actions Taken | 22, fixed ids. **Zero** on every `New` and `Cancelled` Ticket, on unassigned `TKT-2026-900023`, and on legacy-style `TKT-2026-900019` (Closed). **One** on most other worked Tickets. **Several by different IT Staff** on `TKT-2026-900007` (owner Chen; Actions by Chen, Priya and Nattapong) and `TKT-2026-900008`. The two `Reopened` Tickets each fail the gate in a different way: `…012` has no Action since the reopen, and `…013` has one but its follow-up is open | AC-11, AC-13 |
| Follow-ups | Open follow-ups assigned to each active IT Staff member (so every "My open follow-ups" card is non-zero for someone); one Open follow-up assigned to inactive Robert Wilson (shows the "assignee inactive" flag); Completed and Cancelled examples | Each seeded `Resolved`/`Closed` Ticket has ≥ 1 Action and no open follow-up (BR-14), except `TKT-2026-900019` |
| Status history | Two to four rows per non-`New` seeded Ticket, consistent with its current status, fixed ids | Timeline demonstration |
| Zero metrics | Ploy's whole dashboard; the Administrator's "My recent actions"; `byItPriority` stays non-zero | AC-21, AC-25 |

Seeded passwords are listed only in the root `README.md` under "Local development accounts".

---

## 8. API Contract

Full shapes, validation and error codes are in [api-spec.md](api-spec.md). Summary of the Lab 4 increment:

| Area | Method and path | Roles |
| --- | --- | --- |
| Actions Taken (staff) | `GET /api/staff/tickets/:id/actions` · `POST /api/staff/tickets/:id/actions` · `PATCH /api/staff/tickets/:id/actions/:actionId` | read: IT Staff, Administrator · write: IT Staff, Administrator |
| Actions Taken (requester) | `GET /api/tickets/:id/actions` | Requester (owner), IT Staff, Administrator |
| Status history | `GET /api/tickets/:id/history` | Requester (owner), IT Staff, Administrator |
| Dashboards | `GET /api/dashboard/requester` · `GET /api/staff/dashboard` | Requester · IT Staff, Administrator |
| Changed (Lab 3) | `GET /api/staff/tickets/:id` gains `version`, `resolutionGate`, `counts.actions`, `counts.openFollowUps`. Claim / owner / it-priority / status accept optional `expectedVersion` and may answer `409 STALE_UPDATE`; status may answer `409 RESOLUTION_BLOCKED` | IT Staff |
| Changed (Lab 3) | `GET /api/staff/tickets` gains `followUp=mine` and `requesterResolved=true` | IT Staff, Administrator |
| Changed (Lab 2) | `GET /api/tickets` accepts a repeatable `status` (OR) and `sort=updatedAt:desc`; single `status` still works | Requester |
| Unchanged | Every other Lab 2/3 endpoint, including `GET /api/health` | — |

New `409` codes: `STALE_UPDATE`, `TICKET_LOCKED`, `RESOLUTION_BLOCKED` (BR-28).

---

## 9. Acceptance Criteria

AC-01 and AC-02 are the handout's examples. In AC-01, "approved assignee" means the follow-up assignee (BR-06).

| ID | Criterion |
| --- | --- |
| AC-01 | **Given** a permitted IT Staff user and valid data, **when** an Actions Taken is created, **then** it is saved under the correct Ticket with the authenticated creator and approved assignee. |
| AC-02 | **Given** an authenticated Requester, **when** dashboard data is retrieved, **then** only metrics and recent Tickets owned by that Requester are returned. |
| AC-03 | **Given** IT Staff on the Staff Ticket Detail, **when** they record an Action through the Actions Taken tab's create mode, **then** it appears at the right place in the list with Performed by set to them, and the Ticket's Requester sees the same entry read-only, with no create, edit, complete or cancel control. |
| AC-04 | **Given** the create or edit form, **when** Description, Result or Action Date/Time is missing, the date is in the future or before the Ticket was created, or follow-up is required without a note or assignee, **then** the server answers `400` with `fields`, the UI shows each message under its field, and the entered values stay in the form. |
| AC-05 | **Given** a Ticket owned by one IT Staff member, **when** a different IT Staff member records an Action, **then** it is accepted with that member as Performed by, the owner is unchanged, and a `performedById` in the body is ignored. |
| AC-06 | **Given** an existing Action, **when** it is edited with the current `version`, **then** text and date change, Ticket / Performed by / created time do not, and `updatedBy` is the editor. **When** it is edited with an old `version`, **then** the server answers `409 STALE_UPDATE`, and the UI keeps the typed edits and offers to reload. |
| AC-07 | **Given** an Action with follow-up, **when** it is assigned to an active IT Staff member, **then** it is `Open` with that assignee. Assigning to an inactive user, a Requester or an Administrator is `400`. Completing or cancelling stamps the closer and time. Changing a closed follow-up, or turning *Follow-Up Required?* off, is refused. |
| AC-08 | **Given** direct API calls, **when** a Requester creates or edits an Action, reads Actions of another Requester's Ticket, or anyone calls without a session, **then** the answers are `403`, `403` and `401` with no Action data; an Administrator creating an Action gets `201`. |
| AC-09 | **Given** a Ticket in `Resolved`, `Closed` or `Cancelled`, **when** an Action is created or edited, **then** the server answers `409 TICKET_LOCKED`, and the UI shows no create control but the hint "Reopen the ticket to record more work". |
| AC-10 | **Given** the create form, **when** Save is clicked twice quickly or the same request is retried with the same `clientRequestId`, **then** exactly one Action exists. |
| AC-11 | **Given** a Ticket with several Actions by different IT Staff, **when** the list is loaded by any permitted role, **then** every Action is shown with its own performer, in BR-11 order, and the order is the same on every load. |
| AC-12 | **Given** a Ticket with no owner, no Action, or an open follow-up, **when** IT Staff try to resolve it, **then** the server answers `409 RESOLUTION_BLOCKED` naming each unmet condition, and the UI leaves Resolved out of the status choices and shows those conditions. Once every condition is met, Resolve succeeds. |
| AC-13 | **Given** a Ticket that was Resolved and is now Reopened, **when** IT Staff try to resolve it again without recording a new Action, **then** it is refused (BR-14(b)); after one new Action it succeeds. |
| AC-14 | **Given** any (from, to) pair, **when** IT Staff request the change, **then** it is applied only if the matrix in §5 permits it. The status select lists only permitted targets, and after a successful change the header status badge, `permittedTransitions` and the History tab update without a page reload. An Administrator's request is `403`. |
| AC-15 | **Given** a Requester on their own active Ticket, **when** they say the problem appears resolved, **then** the status is unchanged, the IT Staff dashboard "Requester reports resolved" count goes up by one, and a Requester request to change status is `403`. |
| AC-16 | **Given** any status change, including the automatic New → Open on claim and a Cancel, **when** the history is read, **then** it holds one new row with from, to, the acting user and the server time, oldest first. No endpoint changes or deletes a history row. |
| AC-17 | **Given** two IT Staff with the same Ticket open, **when** the first changes its status and the second then submits a status, owner or IT Priority change from the old copy, **then** the second gets `409 STALE_UPDATE`, nothing is overwritten, and the UI explains and reloads on request. |
| AC-18 | **Given** a Ticket with open follow-ups, **when** IT Staff cancel the Ticket, **then** those follow-ups become `Cancelled` in the same operation. |
| AC-19 | **Given** the seeded database, **when** IT Staff or an Administrator load their dashboard, **then** every count equals the direct database query in §5 for that user. The Administrator variant has `mine` and `myFollowUps` as `null` plus a `users` block. |
| AC-20 | **Given** any dashboard card, **when** it is followed, **then** the list it opens has the filter in §5 and a total equal to the card's count. For `myFollowUps` the list shows the Tickets that hold those follow-ups. |
| AC-21 | **Given** a dashboard, **when** it is loading, has only zero counts (Ploy), is requested by the wrong role (`403`), or the API fails, **then** the loading, empty, forbidden or safe-failure state from ui-spec.md is shown, and Retry reloads it. |
| AC-22 | **Given** any role, **when** they sign in, **then** they land on `/dashboard`. "Dashboard" is the first navigation item and is marked active there, and every Lab 3 deep link (`/tickets/:id`, `/staff/queue?…`, `/admin/users`) still works. |
| AC-23 | **Given** a Requester with Tickets, **when** the dashboard loads, **then** "Needs your reply", "Recently updated" and "Recently resolved" show at most 5 rows each in the §5 order, and each row opens that Ticket's detail. |
| AC-24 | **Given** a Lab 3 database, **when** the Lab 4 migration runs, **then** User, Ticket, Attachment, Comment and Internal Note counts and every foreign key are unchanged, every Ticket has `version = 0` and zero Actions, and the rollback script returns the schema to Lab 3 with the same counts. |
| AC-25 | **Given** a seeded database, **when** the seed runs again, **then** nothing is duplicated. The data includes Tickets with zero, one and many Actions, and dashboards with both zero and non-zero metrics. |
| AC-26 | **Given** the release commit on `main`, **when** every Lab 2, Lab 3 and Lab 4 suite (unit, API, UI, E2E) is run, **then** all pass, with none skipped. |
| AC-27 | **Given** any screen, **when** its primary action is used, **then** a double click sends one request, a recoverable failure keeps the entered data, feedback follows the ui-spec.md table, and the browser console has no errors on each role's happy path. |
| AC-28 | **Given** the dashboards, Staff and Requester Ticket Detail with Actions Taken and History, at 1280 / 820 / 375 px, **when** each is inspected, **then** it matches ui-spec.md with no clipping, overlap or horizontal page overflow. |
| AC-29 | **Given** keyboard-only use, **when** a user tabs through a dashboard and the Actions Taken tab, **then** every control is reachable with a visible focus ring. Every metric card has an accessible name with label and value, every status, follow-up and priority cue has text as well as colour, and dialogs trap and return focus. |
| AC-30 | **Given** the seeded database on the local stack, **when** each dashboard and the Actions list are requested 20 times, **then** the 95th percentile is under 500 ms, and each dashboard response is under 10 KB with no description or comment bodies. |
| AC-31 | **Given** the API, **when** `GET /api/health` is called with the database up and with it down, **then** it answers `200 {database: CONNECTED}` and `503 {database: UNREACHABLE}`, and the client shows its safe-failure state in the second case. |

Every AC maps to at least one planned test in [tests.md](tests.md) §3.

---

## 10. Definition of Done

Worked out with the LLM from the Lab 2 and Lab 3 checklists. A box is ticked only with named evidence (Issue #58 fills this in).

### 10.1 Product

- [ ] FR-01 … FR-14 implemented; BR-01 … BR-31 enforced on the server.
- [ ] AC-01 … AC-31 verified by the tests named in [tests.md](tests.md). Every test passes on `main` from the documented commands; none skipped, disabled or commented out.
- [ ] Authorization matrix and transition matrix implemented exactly as in §5, with direct-API evidence for each refused row (Requester writes on Actions, Administrator status change, stale update, locked Ticket, gate).
- [ ] Every dashboard number checked against a direct SQL query on the seeded database (Answer Part 5 evidence), and every card's drill-down total equals its count (AC-20).
- [ ] Migration applied to a database holding Lab 3 data, with counts verified (MIG-01); rollback and re-apply verified (MIG-02); seed re-run with identical counts (MIG-03).
- [ ] No Action, history or dashboard response leaks another Requester's data or any Internal Note.
- [ ] Every screen in ui-spec.md shows its loading, validation, success, empty/no-results, forbidden, not-found, conflict and safe-failure feedback; V-01 … V-20 checked at the three viewports.
- [ ] No console errors on each role's happy path. No broken links, placeholder text, `TODO` UI, unused component files or obsolete styles from Labs 1–3.
- [ ] Lab 2 and Lab 3 suites pass unchanged, except for the documented role-home change (BR-31), which is updated in those tests.
- [ ] Root `README.md` current: setup, migration, rollback, seed, local accounts (including Ploy), test commands, demonstration script.

### 10.2 Course delivery

- [ ] Sprint decomposed into Issues #52 … #58 on the Kanban; all in Done at submission.
- [ ] Every Issue delivered through `feature/<issue>-<slug>` → PR → `lab4-staging`, then one release PR `lab4-staging` → `main`. No direct commits to `main` or `lab4-staging`.
- [ ] Each PR peer-reviewed; `reviewer.md` records reviewer identity, PR links, comments given and received, responses and approvals.
- [ ] This contract (specification, api-spec, ui-spec, tests) merged before the first implementation PR, and the merge is screenshotted for Answer Part 2.
- [ ] `ai-use.md` names the LLM and lists 6–10 key prompts with "My Reflection".
- [ ] Screenshots under `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` (plus `workflow/`, `regression/`) at desktop, tablet and mobile.
- [ ] One PDF with "Answer Part 1" … "Answer Part 9" in order.

---

## 11. Assumptions and Decisions

| ID | Assumption / Decision | Rationale |
| --- | --- | --- |
| AD-01 | The "assign / complete / cancel / inactive-assignee rejection" in grading Part 6, and the "approved assignee" in AC-01, are read as the **follow-up's** assignee and lifecycle. An Action itself has no assignee or status. | The stakeholder's field list (handout §3, §8.3) describes an Action as a record of work already done, which has no "in progress" state. The only part that is still pending is the follow-up. Giving the follow-up an assignee and an Open → Completed/Cancelled lifecycle covers every word in Part 6 and AC-01 without inventing a second task system. |
| AD-02 | Administrators may create and edit Actions Taken, but stay read-only for status, owner and IT Priority. | Handout §4.3 explicitly gives Administrators IT Staff behaviour for Actions Taken. Keeping L3 BR-17 for the workflow fields avoids reopening a Lab 3 decision and its tests. An Administrator is never a follow-up assignee, for the same reason they are never a Ticket owner (L3 BR-15). |
| AD-03 | Actions Taken are shared with the Requester (handout §8.3 "Requesters will see all Actions Taken items"). The panel says so, and private reasoning belongs in Internal Notes. | The handout requires it. The visible caption and the different (non-amber) styling stop IT Staff from writing private detail in the wrong place, as Lab 3 did for comments vs notes. |
| AD-04 | Resolution gate = owner + ≥ 1 Action since last reopen + no open follow-up. | "IT Staff must review the work and formally update the Ticket" means the record of work must justify Resolved. Counting only Actions since the last reopen stops a reopened Ticket from being resolved again on the strength of the fix that already failed. |
| AD-05 | Attachment Notes is text, not a file link or upload. | The handout describes it as "what file to look for". Files stay in the Lab 2 attachment store with its validation and removal rules; a second upload path would double that surface for no stated need. |
| AD-06 | Actions lock on Resolved / Closed / Cancelled. | Adding work to a Resolved Ticket would either break the gate after the fact or require re-checking it on every Action write. Reopen → record → resolve keeps the story honest and the history readable. |
| AD-07 | `expectedVersion` is optional on the four Lab 3 workflow endpoints and required on Action edits. | Making it required would break every Lab 3 client call and test for no benefit to the Lab 4 client, which always sends it. Action edits are new, so they can require it from the start. Without it, a status change is still conditional on the status that was read (BR-19). |
| AD-08 | Dashboards have no time-window counts; "recent" lists are the top 5 by order. | The seed has fixed dates, so a "last 7 days" count would drift to zero as the calendar moves and break tests and demos. Fixed-length lists are just as useful on one screen and need no time-zone boundary. Display uses Asia/Bangkok because every user is in Thailand. |
| AD-09 | One `/dashboard` route renders the role's dashboard; the API has two endpoints. | One URL per role home keeps the shell and `Home` redirect simple. Two API endpoints keep the Requester's query path separate from staff data, so a role bug cannot widen a Requester's scope (BR-23). |
| AD-10 | Server-side idempotency (`clientRequestId`) is added only to Action creation. Other creates rely on the client busy state. | Action creation is the new write most likely to be retried during a demo on a slow network, and a duplicate Action would wrongly satisfy the gate. Comment, note and Ticket creation already disable their buttons (Lab 2/3 V-09), and a duplicate there is harmless and visible. |
| AD-11 | `actionAt` is entered in Bangkok local time through `datetime-local` and stored in UTC. It may be in the past (work done before it was logged), but no more than 5 minutes in the future. | Staff often record work after doing it. Five minutes absorbs clock drift between a phone and the server. |
| AD-12 | Status history is visible to the Requester too. | It holds only status names, IT Staff names (already visible as Owner) and times, and lets the Requester see why their Ticket moved. The handout's "role-appropriate visibility" is met because no Internal Note content appears there. |

---

## Appendix — GitHub Issue Traceability

Issues [#52](https://github.com/Chessuker/TokTickIT/issues/52) – [#58](https://github.com/Chessuker/TokTickIT/issues/58).

| Issue | Title | Covers |
| --- | --- | --- |
| #52 | Sprint 4 engineering contract | This document, `api-spec.md`, `ui-spec.md`, `tests.md` |
| #53 | Actions Taken foundation (DB + API) | FR-01 … FR-04 (API), FR-11; BR-01 … BR-12, BR-29, BR-30; §7; AC-01, AC-04 … AC-11 (API), AC-24, AC-25 |
| #54 | Actions Taken UI | FR-01 … FR-04 (UI); AC-03, AC-04, AC-06, AC-07, AC-09 … AC-11 (UI) |
| #55 | Ticket workflow, resolution gate and stale updates | FR-05 … FR-07; BR-13 … BR-20; AC-12 … AC-18 |
| #56 | Role dashboards | FR-08 … FR-10; BR-21 … BR-27; AC-02, AC-19 … AC-23, AC-30 |
| #57 | Final hardening, regression and accessibility | FR-12 … FR-14; BR-28, BR-31; AC-26 … AC-29, AC-31 |
| #58 | E2E, visual inspection and release | AC-28, §10, ui-spec.md §5, tests.md §4–§5, `ai-use.md`, PDF |
