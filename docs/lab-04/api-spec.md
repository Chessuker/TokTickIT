# Lab 4 — REST API Specification

Companion to [specification.md](specification.md). Extends the [Lab 3 API](../lab-03/api-spec.md). Every Lab 2 and Lab 3 endpoint keeps its path, authentication, body and response shape, except for the additive changes listed in §4. Requirement, rule and criterion ids (FR-, BR-, AC-) refer to specification.md; test ids (API-) refer to [tests.md](tests.md). Lab 3 sections are cited as `L3 §3.x`.

---

## 1. Conventions

### 1.1 Unchanged from Lab 3

Session cookie `toktickit_session`, the `requireAuth` → `requireRole` → ownership chain, CORS with credentials, the JSON-only CSRF rule, the error envelope, and the `401` / `403` / `404` rules of L3 §1.1 – §1.4 all apply as written.

### 1.2 New error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 409 | `STALE_UPDATE` | `expectedVersion` (Ticket) or `version` (Action) does not match the stored value (BR-19). The body includes `current: { version }` so the client can say "someone else changed this" and reload |
| 409 | `TICKET_LOCKED` | Action write on a `Resolved`, `Closed` or `Cancelled` Ticket (BR-09) |
| 409 | `RESOLUTION_BLOCKED` | Status → `Resolved` while the gate is closed (BR-14). The body includes `unmet: ("OWNER" \| "ACTION_SINCE_REOPEN" \| "OPEN_FOLLOW_UPS")[]` |
| 409 | `CONFLICT` | Existing code; also used when a `clientRequestId` is reused by another user or on another Ticket (BR-10) |

Example:

```json
{ "error": { "code": "RESOLUTION_BLOCKED", "message": "This ticket cannot be resolved yet: record at least one action taken; complete or cancel 1 open follow-up.", "unmet": ["ACTION_SINCE_REOPEN", "OPEN_FOLLOW_UPS"] } }
```

`current` and `unmet` are the only additions to the envelope. They appear only on these codes, never on `403`, so a refused caller learns nothing about the resource.

### 1.3 Time

All timestamps in requests and responses are ISO-8601 UTC strings (`2026-10-03T07:05:00.000Z`). The client converts Bangkok local input to UTC before sending and formats responses in `Asia/Bangkok` (BR-25, AD-11). The server never formats dates for display.

### 1.4 Optimistic concurrency

| Resource | Field read | Field sent back | Required? |
| --- | --- | --- | --- |
| Ticket workflow (claim, owner, it-priority, status) | `version` in `StaffTicketDetail` | `expectedVersion` in the body | Optional (AD-07). The Lab 4 client always sends it |
| Action Taken (PATCH) | `version` in `Action` | `version` in the body | Required; missing → `400 fields.version` |

The server checks with a conditional write (`UPDATE … WHERE id = $1 AND version = $2`, then `version = version + 1`). If no row is updated, it answers `409 STALE_UPDATE`. A status change is also conditional on the `status` it read, so two simultaneous requests can never both apply, even without `expectedVersion`.

---

## 2. Resource Shapes

### Action

```json
{
  "id": "…",
  "ticketId": "…",
  "actionAt": "2026-10-03T07:05:00.000Z",
  "description": "Re-created the Outlook profile and cleared cached credentials.",
  "result": "Password prompt stopped for 2 hours, then returned.",
  "attachmentNotes": "See outlook-prompt.png in Attachments.",
  "performedBy": { "id": "…", "name": "Priya Raman", "role": "ITStaff" },
  "followUp": {
    "required": true,
    "note": "Check the Exchange auth policy with the mail team.",
    "assignee": { "id": "…", "name": "Chen Wei", "role": "ITStaff", "isActive": true },
    "status": "Open",
    "closedAt": null,
    "closedBy": null
  },
  "version": 0,
  "updatedBy": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

When no follow-up is needed, `followUp` is `{ "required": false, "note": null, "assignee": null, "status": null, "closedAt": null, "closedBy": null }`, so the shape is always the same. `assignee.isActive` drives the "assignee inactive" flag (BR-07). The Requester endpoint (§3.2) returns exactly this shape. Nothing in it is private (AD-03).

### StatusChange

```json
{ "id": "…", "fromStatus": "Open", "toStatus": "InProgress", "changedBy": { "id": "…", "name": "Priya Raman", "role": "ITStaff" }, "createdAt": "…" }
```

### StaffTicketDetail (Lab 3, extended)

L3 §2 `StaffTicketDetail`, plus:

```json
{
  "version": 4,
  "counts": { "comments": 3, "internalNotes": 2, "attachments": 1, "actions": 3, "openFollowUps": 1 },
  "resolutionGate": { "ok": false, "unmet": ["OPEN_FOLLOW_UPS"] },
  "permittedTransitions": ["WaitingForRequester", "Cancelled"]
}
```

`permittedTransitions` now also leaves out `Resolved` while `resolutionGate.ok` is `false` (BR-14). For an Administrator it is still `[]`, and `resolutionGate` is still returned for information.

### DashboardTicket

The compact row used by every dashboard list. It has no description, comment or note bodies (AC-30).

```json
{ "id": "…", "ticketNumber": "TKT-2026-900007", "summary": "Outlook keeps asking for the password", "status": "InProgress", "itPriority": "High", "updatedAt": "…", "resolvedAt": null }
```

### DashboardAction

```json
{ "id": "…", "ticketId": "…", "ticketNumber": "TKT-2026-900007", "descriptionPreview": "Re-created the Outlook profile and cleared…", "actionAt": "…", "followUpStatus": "Open" }
```

`descriptionPreview` is the first 120 characters, cut at a word boundary and ending in "…" when shortened.

### Metric

```json
{ "count": 3, "href": "/tickets?status=WaitingForRequester" }
```

`href` is a client route, not an API path. It is produced by the server from the same definition as the count (BR-27), so the client never builds drill-down URLs itself.

---

## 3. Endpoints

### 3.1 `GET /api/staff/tickets/:id/actions`

All Actions of a Ticket for IT Staff (FR-04, BR-11, AC-11).

| | |
| --- | --- |
| Auth | IT Staff · Administrator (router-level `requireRole`, as for all `/api/staff`) |
| Success | `200` — `{ "data": Action[] }`, ordered `actionAt desc, createdAt desc, id asc`. No pagination: a Ticket's work log is short (as L3 API-D-03) |
| Errors | `401`, `403`, `404` (unknown Ticket), `500` |

### 3.2 `GET /api/tickets/:id/actions`

The same list for the Ticket's Requester (FR-04, BR-04, AC-03, AC-08).

| | |
| --- | --- |
| Auth | Requester (owner) · IT Staff · Administrator — same access rule as `GET /api/tickets/:id/comments` (L3 §3.6) |
| Success | `200` — `{ "data": Action[] }`, same order |
| Errors | `401`, `403` (Requester, not owner — no Action data, AD-11 of Lab 3), `404` (staff/admin, unknown id), `500` |

### 3.3 `POST /api/staff/tickets/:id/actions`

Record an Action Taken (FR-01, FR-03, BR-01 … BR-06, BR-09, BR-10, BR-12, AC-01, AC-04, AC-05, AC-10).

| | |
| --- | --- |
| Auth | IT Staff · Administrator (no `staffOnly` here — AD-02) |
| Body | `{ "actionAt": "<ISO>", "description": "…", "result": "…", "attachmentNotes": "…" \| null, "followUpRequired": false, "followUpNote": "…", "followUpAssigneeId": "<uuid>", "clientRequestId": "<uuid>" }` |
| Validation | Per BR-05 / BR-06, each failure named in `fields`: `actionAt` (missing, not a date, > now + 5 min, < Ticket `createdAt`); `description` (1–2000); `result` (1–1000); `attachmentNotes` (≤ 500); `followUpRequired` (boolean, default `false`); when `true`, `followUpNote` (1–1000) and `followUpAssigneeId` (active `ITStaff`); when `false`, a non-null `followUpNote` or `followUpAssigneeId` → `400` (do not silently drop a follow-up the user believed they set); `clientRequestId` (UUID if present). `performedById`, `ticketId`, `followUpStatus`, `version` in the body are ignored |
| Order of checks | auth → role → Ticket exists (`404`) → `clientRequestId` replay (§3.3.1) → Ticket locked (`409 TICKET_LOCKED`) → body validation (`400`) → insert |
| Success | `201` — the created `Action`. `performedBy` = caller, `followUp.status` = `Open` when required, `version` = 0. `Ticket.updatedAt` is touched in the same transaction; `Ticket.version` is not (BR-12) |
| Errors | `400`, `401`, `403`, `404`, `409 TICKET_LOCKED`, `409 CONFLICT` (§3.3.1), `500` |

#### 3.3.1 `clientRequestId` replay (BR-10)

| Situation | Answer |
| --- | --- |
| No Action holds this `clientRequestId` | Insert normally |
| An Action holds it, same `performedById` and same `ticketId` | `200` with that Action; nothing written. Checked before the lock and the validation, so a retry after a successful first request always gets the same answer |
| An Action holds it with a different user or Ticket | `409 CONFLICT` "This request id has already been used." |
| Two identical requests race | The `@unique` constraint makes one insert fail; the route catches the unique violation and answers as in row 2 |

### 3.4 `PATCH /api/staff/tickets/:id/actions/:actionId`

Edit an Action, open/reassign/complete/cancel its follow-up (FR-02, FR-03, BR-03, BR-05 … BR-09, BR-12, BR-19, AC-06, AC-07, AC-09).

| | |
| --- | --- |
| Auth | IT Staff · Administrator |
| Body | `{ "version": 2, ...any subset of { "actionAt", "description", "result", "attachmentNotes", "followUpRequired", "followUpNote", "followUpAssigneeId", "followUpStatus" } }` |
| Lookup | The Action must belong to `:id`; an Action id from another Ticket → `404` (BR-01). Unknown Ticket or Action → `404` |
| Validation | Present fields per BR-05. Follow-up rules (BR-06, BR-07): <br>• `followUpRequired: true` on an Action without follow-up opens one: `followUpNote` and `followUpAssigneeId` are then required in the same body. <br>• `followUpRequired: false` on an Action with a follow-up → `400 fields.followUpRequired` "Cancel the follow-up instead." <br>• `followUpNote`, `followUpAssigneeId` are accepted only while `followUp.status = Open` (else `409 CONFLICT` "This follow-up is already closed."). <br>• `followUpStatus` accepts only `Completed` or `Cancelled`, only from `Open`; it stamps `followUpClosedAt = now`, `followUpClosedById = caller`. Any other value or source state → `400` / `409 CONFLICT`. <br>• `version` required (§1.4). <br>`performedById`, `ticketId`, `createdAt` in the body are ignored |
| Order of checks | auth → role → Ticket and Action exist → Ticket locked (`409 TICKET_LOCKED`) → body validation (`400`) → follow-up state (`409 CONFLICT`) → conditional update on `version` (`409 STALE_UPDATE`) |
| Success | `200` — the updated `Action` with `version + 1`, `updatedBy` = caller. `Ticket.updatedAt` touched, `Ticket.version` not (BR-12) |
| Errors | `400`, `401`, `403`, `404`, `409 TICKET_LOCKED` / `CONFLICT` / `STALE_UPDATE`, `500` |

There is no `DELETE` route. `DELETE /api/staff/tickets/:id/actions/:actionId` falls through to the API 404 handler (BR-08).

### 3.5 `GET /api/tickets/:id/history`

Status history, oldest first (FR-06, BR-18, AC-16).

| | |
| --- | --- |
| Auth | Requester (owner) · IT Staff · Administrator |
| Success | `200` — `{ "createdAt": "<Ticket.createdAt>", "createdBy": UserRef, "data": StatusChange[] }` ordered `createdAt asc, id asc`. `createdAt`/`createdBy` let the UI draw the synthetic "Created" row without storing it. `createdBy` is the Requester |
| Errors | `401`, `403`, `404`, `500` |

There are no write routes. History rows are written only inside the transactions of §4.2 (claim, owner, status) and §3.3 never writes one.

### 3.6 `GET /api/dashboard/requester`

Requester dashboard (FR-08, BR-21 … BR-23, BR-25 … BR-27, AC-02, AC-21, AC-23).

| | |
| --- | --- |
| Auth | Requester only. IT Staff / Administrator → `403` |
| Query | None. Any parameter (including `requesterId`) is ignored (BR-23) |
| Success | `200` — see below |
| Errors | `401`, `403`, `500` |

```json
{
  "generatedAt": "2026-10-03T07:10:00.000Z",
  "metrics": {
    "open":         { "count": 3, "href": "/tickets?status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened" },
    "waitingForMe": { "count": 1, "href": "/tickets?status=WaitingForRequester" },
    "resolved":     { "count": 0, "href": "/tickets?status=Resolved" },
    "closed":       { "count": 1, "href": "/tickets?status=Closed" }
  },
  "lists": {
    "needsAttention":   [ DashboardTicket ],
    "recentlyUpdated":  [ DashboardTicket ],
    "recentlyResolved": [ DashboardTicket ]
  },
  "totalTickets": 6
}
```

`totalTickets` (all statuses, including Cancelled) lets the client tell "no Tickets at all" (empty state with Create Ticket) apart from "Tickets, but none in these buckets" (BR-26). All counts and lists are read in one `prisma.$transaction([...])` (BR-21).

### 3.7 `GET /api/staff/dashboard`

IT Staff dashboard and its Administrator variant (FR-09, BR-21, BR-22, BR-24 … BR-27, AC-19 … AC-21).

| | |
| --- | --- |
| Auth | IT Staff · Administrator (router-level). Requester → `403` |
| Query | None |
| Success | `200` — see below |
| Errors | `401`, `403`, `500` |

```json
{
  "generatedAt": "…",
  "viewer": "ITStaff",
  "metrics": {
    "unassigned":               { "count": 4, "href": "/staff/queue?owner=unassigned&status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened" },
    "mine":                     { "count": 5, "href": "/staff/queue?owner=me&status=…" },
    "myFollowUps":              { "count": 2, "ticketCount": 2, "href": "/staff/queue?followUp=mine" },
    "requesterReportsResolved": { "count": 0, "href": "/staff/queue?requesterResolved=true&status=…" },
    "byStatus": {
      "New": { "count": 4, "href": "/staff/queue?status=New" },
      "Open": { … }, "InProgress": { … }, "WaitingForRequester": { … }, "Reopened": { … }, "Resolved": { … }
    },
    "byItPriority": {
      "High": { "count": 6, "href": "/staff/queue?itPriority=High&status=…" }, "Medium": { … }, "Low": { … }
    }
  },
  "lists": {
    "urgent":          [ DashboardTicket ],
    "recentlyUpdated": [ DashboardTicket ],
    "myRecentActions": [ DashboardAction ]
  },
  "users": null
}
```

For an Administrator, `viewer` is `"Administrator"`, `mine` and `myFollowUps` are `null` (BR-24), and `users` is:

```json
{ "activeByRole": { "Requester": 5, "ITStaff": 3, "Administrator": 1 }, "inactive": 2, "href": "/admin/users" }
```

`myFollowUps.ticketCount` is the number of distinct Tickets that hold those follow-ups. It equals the total on the Queue page that `href` opens (AC-20).

---

## 4. Changes to Existing Endpoints

### 4.1 `GET /api/staff/tickets/:id` (L3 §3.10)

Response gains `version`, `counts.actions`, `counts.openFollowUps` and `resolutionGate`, and `permittedTransitions` applies the gate (§2). Nothing is removed.

### 4.2 Claim, owner, IT Priority, status (L3 §3.12 – §3.15)

| Change | Detail |
| --- | --- |
| Body | Each accepts an optional `expectedVersion` (integer ≥ 0). Not an integer → `400 fields.expectedVersion` |
| Check | After the existing role/existence checks and before the existing rule checks: if `expectedVersion` is present and ≠ `Ticket.version` → `409 STALE_UPDATE` with `current.version` |
| Write | The update is conditional on `version` (and, for status, on the status read). On success `version` increments |
| History | Claim/assign that turns `New` into `Open`, and every status change, insert one `TicketStatusChange` in the same transaction (BR-18) |
| Status → Resolved | After the Lab 3 matrix and owner checks, the gate is evaluated (BR-14). If it is closed → `409 RESOLUTION_BLOCKED` with `unmet`. The owner condition is reported as `OWNER` inside `unmet`, but the existing L3 owner check runs first, so its Lab 3 `409 INVALID_TRANSITION` answer is unchanged and the Lab 3 tests still pass |
| Status → Cancelled | Also sets every `Open` follow-up on the Ticket to `Cancelled` in the same transaction (BR-16) |
| Response | Unchanged: `StaffTicketDetail`, now with the §4.1 fields |

### 4.3 `GET /api/staff/tickets` (L3 §3.9)

| New parameter | Values | Meaning |
| --- | --- | --- |
| `followUp` | `mine` | Only Tickets that have at least one Action with `followUpAssigneeId = caller` and `followUpStatus = Open`, with the Ticket in an active status. Administrator → `400` (they cannot be assignees, BR-24) |
| `requesterResolved` | `true` | Only Tickets with `requesterResolvedAt IS NOT NULL` |

Both combine (AND) with every existing filter. Any other value → `400` naming the parameter. All Lab 3 parameters keep their behaviour.

### 4.4 `GET /api/tickets` (Lab 2, Requester list)

| Change | Detail |
| --- | --- |
| `status` | Now repeatable (OR), same as the Queue: `?status=Open&status=InProgress`. A single value behaves exactly as in Lab 2/3. Invalid values → `400` naming `status` |
| `sort` | Gains `updatedAt:desc` and `updatedAt:asc`; default stays `createdAt:desc` |

### 4.5 `GET /api/health`

Unchanged in shape (`200` / `503`, `database: CONNECTED | UNREACHABLE`). Documented here because AC-31 now tests it, and the client uses it on the safe-failure screen to tell "server down" apart from "server error".

---

## 5. Capability Coverage

| Handout capability (§6) | Endpoint(s) |
| --- | --- |
| Create and update Actions Taken as permitted | 3.3, 3.4 (read: 3.1, 3.2) |
| Retrieve Requester dashboard data | 3.6 |
| Retrieve IT Staff dashboard data | 3.7 |
| Continue all approved APIs from Labs 2 and 3 | L3 §3.1 – §3.22, with the additive changes in §4 |
| Final health, validation and regression behaviour | 4.5; §1.2; API-36 … API-38 |
| Ticket resolution and conflict behaviour (§6.1) | §1.4, 4.2 |
| Dashboard contract (§6.2): calculations, time zone, drill-down, empty | specification.md §5 metric table, 3.6, 3.7, §1.3 |

---

## 6. Test Coverage

| Endpoint | API tests (tests.md) |
| --- | --- |
| 3.1, 3.2 list Actions | API-01, API-02 |
| 3.3 create Action | API-03 … API-06, API-10 … API-13 |
| 3.4 edit Action / follow-up | API-07 … API-11 |
| 3.5 history | API-19 |
| 4.1, 4.2 workflow changes | API-14 … API-22 |
| 3.6 Requester dashboard; 4.4 list filters | API-23 … API-28 |
| 3.7 staff dashboard; 4.3 queue filters | API-29 … API-35 |
| 4.5 health; regression; safe errors | API-36 … API-38 |

---

## 7. Open Decisions

| ID | Decision | Status |
| --- | --- | --- |
| API-D-01 | Lab 3 workflow endpoints keep `expectedVersion` optional. | Decided (AD-07). Revisit only if an external client existed that could not send it. |
| API-D-02 | Drill-down `href` values come from the server. | Decided: one definition produces both count and link (BR-27), so they cannot drift. |
| API-D-03 | No pagination on Actions or history. | Decided, as L3 API-D-03. A Ticket's work log is tens of entries at most. |
| API-D-04 | Dashboards are two endpoints rather than one `GET /api/dashboard` that branches on role. | Decided (AD-09). The Requester query path never touches staff-wide queries. |
