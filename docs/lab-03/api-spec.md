# Lab 3 — REST API Specification

Companion to [specification.md](specification.md). Extends the [Lab 2 API](../lab-02/api-spec.md): every Lab 2 endpoint keeps its path, body and response shape; only the way the caller is identified changes (§1.1). Requirement, rule and criterion ids (FR-, BR-, AC-) refer to specification.md; test ids (API-) refer to [tests.md](tests.md).

---

## 1. Conventions

### 1.1 Authentication: session cookie

Lab 2's `X-Requester-Id` header is removed. The caller is identified by the cookie set at login:

| | |
| --- | --- |
| Cookie name | `toktickit_session` |
| Value | 32 random bytes, base64url. Only its SHA-256 is stored (`Session.tokenHash`) |
| Attributes | `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` (8 h); `Secure` when `NODE_ENV=production` |
| Lifetime | Absolute: 8 h from login (`Session.expiresAt`). No sliding renewal in Lab 3 |
| Revocation | Logout deletes the row. Deactivation, role change and set-initial-password delete every row for that user (BR-10) |
| CORS | `Access-Control-Allow-Origin: <CLIENT_ORIGIN>` (default `http://localhost:5173`), `Access-Control-Allow-Credentials: true`. The client calls `fetch` with `credentials: 'include'` |
| CSRF | All mutating endpoints accept only `Content-Type: application/json` (or `multipart/form-data` for the existing attachment upload, which is owner-scoped) and are never `GET`. Combined with `SameSite=Lax`, a cross-site form post cannot carry the cookie to a state-changing endpoint (AD-01) |

Middleware chain on every protected route:

1. `requireAuth` — reads the cookie, hashes it, loads the session and its user. No cookie, unknown token, expired session, or inactive user → `401 UNAUTHORIZED` (and the cookie is cleared). Then, if `user.mustChangePassword` and the route is not `GET /api/auth/me`, `POST /api/auth/change-password` or `POST /api/auth/logout` → `403 PASSWORD_CHANGE_REQUIRED`. Publishes `res.locals.user` (`SessionUser`, §2).
2. `requireRole(...roles)` — `403 FORBIDDEN` when `user.role` is not listed.
3. Ownership — Requester-scoped routes reuse `findTicketForRequester(ticketId, user.id)` / `loadOwnedAttachment` from Lab 2, now fed from the session user (BR-03). A `requesterId` in any body or query is ignored (AC-03).

### 1.2 Error envelope

Unchanged from Lab 2:

```json
{ "error": { "code": "FORBIDDEN", "message": "You do not have access to this resource.", "fields": { "email": "…" }, "correlationId": "…" } }
```

`fields` appears only on `400 VALIDATION_FAILED` and on `409 CONFLICT` for a duplicate email (so the UI can place it under the field). `correlationId` appears only on `500`.

**Error codes** (Lab 2 codes stay; `REQUESTER_REQUIRED` is removed):

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Body/query/path input invalid; `fields` names each |
| 401 | `UNAUTHORIZED` | No valid session |
| 401 | `INVALID_CREDENTIALS` | Login failed — same message for unknown email and wrong password (BR-06) |
| 403 | `FORBIDDEN` | Wrong role, not the owner, or Administrator attempting a ticket mutation |
| 403 | `ACCOUNT_INACTIVE` | Login with correct credentials on an inactive account (BR-06) |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Session valid, `mustChangePassword` set, route not in the allow-list (BR-02) |
| 404 | `NOT_FOUND` | Ticket/attachment/user id does not exist *and* the caller would be allowed to see it if it did |
| 409 | `CONFLICT` | Duplicate email; self-deactivation; last active Administrator |
| 409 | `INVALID_TRANSITION` | Status change not in the matrix, owner missing, or resolution indication on a terminal ticket |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | Unchanged |
| 429 | `TOO_MANY_ATTEMPTS` | Login throttled (BR-07) |
| 500 | `INTERNAL_ERROR` | Generic message + `correlationId` |

### 1.3 Safe errors

- `500` bodies are always the fixed generic message; the cause is logged server-side against the correlation id.
- Login never says which of email/password was wrong (BR-06). `ACCOUNT_INACTIVE` is returned only after a successful password check.
- A `403` body never includes the resource: no ticket fields, attachment names, note bodies or user records.
- No response ever includes `passwordHash`, a session token or `Session` rows.

### 1.4 Missing vs forbidden

| Situation | Answer |
| --- | --- |
| Requester opens a ticket/attachment owned by someone else | `403 FORBIDDEN` (Lab 2 behaviour retained, AD-11) |
| Requester calls any `/api/staff/*` or `/api/admin/*` route, including Internal Notes of their own ticket | `403 FORBIDDEN` before any lookup (AC-04) |
| IT Staff / Administrator opens a ticket id that does not exist | `404 NOT_FOUND` |
| Administrator opens a user id that does not exist | `404 NOT_FOUND` |
| Unauthenticated call to anything except login | `401 UNAUTHORIZED` |

---

## 2. Resource Shapes

### SessionUser

Returned by login, `GET /api/auth/me`, and embedded wherever a user is referenced.

```json
{ "id": "…", "name": "Jennifer Anderson", "email": "jennifer.anderson@kmutt.ac.th", "role": "Requester", "mustChangePassword": false }
```

`role` ∈ `Requester | ITStaff | Administrator`. Embedded references (`requester`, `owner`, `author`) use the reduced form `UserRef`: `{ "id", "name", "role" }`.

### AdminUser

```json
{ "id": "…", "name": "Priya Raman", "email": "priya.raman@kmutt.ac.th", "department": null, "role": "ITStaff", "isActive": true, "mustChangePassword": false, "lastLoginAt": "2026-09-14T08:12:00.000Z", "createdAt": "…", "updatedAt": "…" }
```

### TicketListItem / TicketDetail (Requester endpoints)

Lab 2 shapes unchanged, plus three fields on both:

```json
{ "itPriority": "High", "owner": { "id": "…", "name": "Priya Raman", "role": "ITStaff" }, "requesterResolvedAt": null }
```

`owner` is `null` when unassigned. `status` may now be any of the eight `TicketStatus` values. `priority` keeps its Lab 2 name and meaning (Requested Priority).

### StaffTicketListItem

```json
{
  "id": "…", "ticketNumber": "TKT-2026-000042", "summary": "Laptop battery drains quickly",
  "status": "InProgress", "requestedPriority": "Medium", "itPriority": "High",
  "category": { "id": "…", "name": "Hardware" },
  "requester": { "id": "…", "name": "Jennifer Anderson", "role": "Requester" },
  "owner": { "id": "…", "name": "Priya Raman", "role": "ITStaff" },
  "requesterResolvedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```

### StaffTicketDetail

`StaffTicketListItem` plus:

```json
{
  "description": "…",
  "relatedSystem": { "id": "…", "name": "Corporate Laptop" },
  "requester": { "id": "…", "name": "…", "email": "…", "department": "Registrar", "role": "Requester" },
  "resolvedAt": null, "closedAt": null,
  "attachments": [ /* Lab 2 Attachment[] */ ],
  "counts": { "comments": 3, "internalNotes": 2, "attachments": 1 },
  "permittedTransitions": ["WaitingForRequester", "Resolved", "Cancelled"]
}
```

`permittedTransitions` is computed server-side from the matrix and the owner rule, so the UI never encodes the matrix (BR-18, BR-19). For an Administrator it is always `[]`.

### Comment / InternalNote (same shape)

```json
{ "id": "…", "body": "We are investigating the issue on your device.", "author": { "id": "…", "name": "Priya Raman", "role": "ITStaff" }, "createdAt": "2026-09-14T09:30:00.000Z" }
```

### Assignee

```json
{ "id": "…", "name": "Priya Raman" }
```

### Pagination envelope

Unchanged from Lab 2: `{ "data": [...], "pagination": { "page", "pageSize", "totalItems", "totalPages", "hasNextPage", "hasPreviousPage" } }`.

---

## 3. Endpoints

### 3.1 `POST /api/auth/login`

Authenticate and start a session (FR-01, AC-01, AC-05 … AC-07).

| | |
| --- | --- |
| Auth | None. A caller who already has a valid session gets a fresh session (old row deleted) |
| Body | `{ "email": "…", "password": "…" }` |
| Validation | `email` required, trimmed, lower-cased, ≤ 254 chars, must contain `@`. `password` required, non-empty, ≤ 72 bytes. Failures → `400 VALIDATION_FAILED` |
| Success | `200` — `SessionUser`; `Set-Cookie: toktickit_session=…` (§1.1); `lastLoginAt` stamped; failure counter for the email reset |
| Errors | `401 INVALID_CREDENTIALS` (unknown email or wrong password — identical message "Invalid email or password."), `403 ACCOUNT_INACTIVE` ("This account is inactive. Please contact an administrator."), `429 TOO_MANY_ATTEMPTS` ("Too many failed attempts. Try again in a few minutes."), `500` |

Order of checks: validation → throttle (5 failures / 15 min per email, BR-07) → load user by email → bcrypt compare (against a fixed dummy hash when the user is missing, so timing is uniform) → inactive check → create session. The throttle counts `401 INVALID_CREDENTIALS` only; `403 ACCOUNT_INACTIVE` does not increment it (BR-07).

### 3.2 `POST /api/auth/logout`

End the session (FR-03, AC-08).

| | |
| --- | --- |
| Auth | Session cookie. Allowed while `mustChangePassword` is set |
| Success | `204`; the session row is deleted and the cookie is cleared (`Max-Age=0`) |
| Errors | `401` if there is no valid session (the cookie is still cleared) |

### 3.3 `GET /api/auth/me`

Return the current user (FR-03).

| | |
| --- | --- |
| Auth | Session cookie. Allowed while `mustChangePassword` is set — the client uses this to decide whether to route to Change Password |
| Success | `200` — `SessionUser` |
| Errors | `401` |

### 3.4 `POST /api/auth/change-password`

Set a new password (FR-02, AC-02, AC-09, AC-10).

| | |
| --- | --- |
| Auth | Session cookie. Allowed (and required) while `mustChangePassword` is set |
| Body | `{ "currentPassword": "…", "newPassword": "…", "confirmPassword": "…" }` |
| Validation | `currentPassword` must match the stored hash → otherwise `400` with `fields.currentPassword = "Current password is incorrect."`. `newPassword` per BR-08 (8–72 chars, upper, lower, digit, special) and ≠ `currentPassword` → `fields.newPassword`. `confirmPassword` must equal `newPassword` → `fields.confirmPassword` |
| Success | `200` — `SessionUser` with `mustChangePassword: false`. Other sessions of the user are deleted; the current one is kept (BR-11) |
| Errors | `400 VALIDATION_FAILED`, `401`, `500` |

A wrong `currentPassword` is `400` (a field error), not `401`, because the caller *is* authenticated; answering `401` would log them out for a typo.

---

### 3.5 Lab 2 Requester endpoints (unchanged paths)

`POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/attachments`, `GET /api/attachments/:id`, `GET /api/attachments/:id/download`, `PATCH /api/attachments/:id/remove`.

Changes relative to the Lab 2 spec (FR-05, AC-03, AC-13):

| Aspect | Lab 2 | Lab 3 |
| --- | --- | --- |
| Caller identity | `X-Requester-Id` header | Session cookie; `requireAuth` + `requireRole('Requester')` for create/list/add/remove |
| `requesterId` in body/query | Rejected | Ignored (AC-03) |
| Missing identity | `400 REQUESTER_REQUIRED` | `401 UNAUTHORIZED` |
| `GET /api/tickets/:id`, `GET /api/attachments/:id`, `…/download` | Owner only | Owner, **or** any IT Staff / Administrator (read-only continuity, AC-24). The response shape is the Lab 2 `TicketDetail` plus `itPriority`, `owner`, `requesterResolvedAt` |
| `POST …/attachments`, `PATCH …/remove` | Owner only | Owner only; IT Staff / Administrator → `403 FORBIDDEN` (BR-14) |
| `status` filter on `GET /api/tickets` | `New` only | Any of the eight values |
| `POST /api/tickets` | — | Also sets `itPriority = priority` (BR-16) |

### 3.6 `GET /api/tickets/:id/comments`

List Public Comments, newest first (FR-06, AC-14).

| | |
| --- | --- |
| Auth | Requester (owner) · IT Staff · Administrator |
| Success | `200` — `{ "data": Comment[] }` (no pagination; a ticket thread is small) |
| Errors | `401`, `403` (Requester, not owner), `404` (staff/admin, unknown id), `500` |

### 3.7 `POST /api/tickets/:id/comments`

Append a Public Comment (FR-06, BR-22, BR-23, AC-14).

| | |
| --- | --- |
| Auth | Requester (owner) · IT Staff. Administrator → `403` |
| Body | `{ "body": "…" }` — trimmed, 1–2000 chars; `400` with `fields.body` otherwise |
| Success | `201` — the created `Comment`; `Ticket.updatedAt` is touched |
| Errors | `400`, `401`, `403`, `404`, `500` |

Allowed in every status, including `Closed` and `Cancelled` — a late reply is still useful to IT Staff, who may reopen.

### 3.8 `POST /api/tickets/:id/resolution-indication`

Requester says the problem appears resolved (FR-07, BR-05, BR-21, AC-15).

| | |
| --- | --- |
| Auth | Requester (owner) only |
| Body | none |
| Success | `200` — `TicketDetail` with `requesterResolvedAt` set. Idempotent: a second call returns `200` with the original timestamp |
| Errors | `401`, `403`, `409 INVALID_TRANSITION` (status is `Resolved`, `Closed` or `Cancelled`), `500` |

---

### 3.9 `GET /api/staff/tickets`

IT Staff Ticket Queue (FR-08, AC-16, AC-17).

| | |
| --- | --- |
| Auth | IT Staff · Administrator |
| Success | `200` — pagination envelope of `StaffTicketListItem` |
| Errors | `400`, `401`, `403`, `500` |

**Query parameters**

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `search` | string | — | Trimmed; case-insensitive partial match on `ticketNumber` and `summary`. Max 150 chars. Empty after trim = absent |
| `status` | enum, repeatable | — | Any of the eight values; `status=Open&status=InProgress` is OR |
| `itPriority` | enum | — | `Low` / `Medium` / `High` |
| `owner` | string | — | `me` (caller's id), `unassigned`, or an IT Staff uuid |
| `category` | uuid | — | Filters by `categoryId` |
| `sort` | string | `updatedAt:desc` | `updatedAt`, `createdAt`, `ticketNumber`, `itPriority`, `status` × `asc` / `desc`. `itPriority` orders High → Medium → Low; `status` orders by workflow position (New, Open, InProgress, WaitingForRequester, Reopened, Resolved, Closed, Cancelled) |
| `page` | integer | `1` | ≥ 1 |
| `pageSize` | integer | `10` | One of `5`, `10`, `25`, `50` |

Tie-break on `id asc`; invalid parameters → `400 VALIDATION_FAILED` naming the parameter; out-of-range page → `200` with `data: []`. No parameter is Requester-scoped: the queue always spans all Requesters.

### 3.10 `GET /api/staff/tickets/:id`

Ticket for IT Staff operations (FR-09 … FR-12, AC-24).

| | |
| --- | --- |
| Auth | IT Staff · Administrator |
| Success | `200` — `StaffTicketDetail` |
| Errors | `401`, `403`, `404`, `500` |

### 3.11 `GET /api/staff/assignees`

Active IT Staff for the owner dropdown (FR-09).

| | |
| --- | --- |
| Auth | IT Staff · Administrator |
| Success | `200` — `{ "data": Assignee[] }` sorted by name |
| Errors | `401`, `403`, `500` |

### 3.12 `POST /api/staff/tickets/:id/claim`

Take ownership (FR-09, BR-15, BR-19, BR-31, AC-18).

| | |
| --- | --- |
| Auth | IT Staff |
| Body | none |
| Success | `200` — `StaffTicketDetail`; `owner` = caller; if status was `New` it becomes `Open` |
| Errors | `401`, `403`, `404`, `409 INVALID_TRANSITION` (status `Closed` or `Cancelled`), `500` |

Claiming a ticket that already has another owner is allowed (it is a reassign-to-self); the previous owner is simply replaced.

### 3.13 `PATCH /api/staff/tickets/:id/owner`

Assign, reassign or unassign (FR-09, BR-15, BR-31, AC-19).

| | |
| --- | --- |
| Auth | IT Staff |
| Body | `{ "ownerId": "<uuid>" }` or `{ "ownerId": null }` |
| Validation | `ownerId` must be an active user with role `ITStaff` → otherwise `400 VALIDATION_FAILED` with `fields.ownerId`. `null` unassigns |
| Success | `200` — `StaffTicketDetail`. Assigning a `New` ticket sets `Open` (same rule as claim, BR-31) |
| Errors | `400`, `401`, `403`, `404`, `409 INVALID_TRANSITION` (unassigning while `InProgress`, or any change on `Closed`/`Cancelled` — BR-31), `500` |

### 3.14 `PATCH /api/staff/tickets/:id/it-priority`

Set IT Priority (FR-10, BR-16, BR-31, AC-20).

| | |
| --- | --- |
| Auth | IT Staff |
| Body | `{ "itPriority": "Low" \| "Medium" \| "High" }` |
| Success | `200` — `StaffTicketDetail`; `requestedPriority` untouched |
| Errors | `400`, `401`, `403`, `404`, `409 INVALID_TRANSITION` (`Closed`/`Cancelled`, BR-31), `500` |

### 3.15 `PATCH /api/staff/tickets/:id/status`

Change status (FR-11, BR-18 … BR-20, AC-21, AC-22).

| | |
| --- | --- |
| Auth | IT Staff |
| Body | `{ "status": "<TicketStatus>" }` |
| Validation | Unknown value → `400`. Pair not in the matrix, or `InProgress`/`Resolved` without an owner → `409 INVALID_TRANSITION` with message naming the current status and the permitted targets |
| Success | `200` — `StaffTicketDetail` with updated `status`, timestamps per BR-20 and recomputed `permittedTransitions` |
| Errors | `400`, `401`, `403`, `404`, `409`, `500` |

### 3.16 `GET /api/staff/tickets/:id/internal-notes`

List Internal Notes, newest first (FR-12, BR-04, BR-23, AC-04, AC-23).

| | |
| --- | --- |
| Auth | IT Staff · Administrator. Requester → `403 FORBIDDEN` from `requireRole`, before the ticket is looked up |
| Success | `200` — `{ "data": InternalNote[] }` |
| Errors | `401`, `403`, `404`, `500` |

### 3.17 `POST /api/staff/tickets/:id/internal-notes`

Append an Internal Note (FR-12, BR-22, BR-23, AC-23).

| | |
| --- | --- |
| Auth | IT Staff only (Administrator → `403`) |
| Body | `{ "body": "…" }` — trimmed, 1–2000 chars |
| Success | `201` — the created `InternalNote` |
| Errors | `400`, `401`, `403`, `404`, `500` |

---

### 3.18 `GET /api/admin/users`

User list (FR-13, AC-25).

| | |
| --- | --- |
| Auth | Administrator |
| Query | `search` (trimmed, ≤ 150, case-insensitive partial on `name` or `email`), `role` (optional, one of the three). Invalid → `400` |
| Success | `200` — `{ "data": AdminUser[] }` sorted by `name asc`. No pagination (X-12) |
| Errors | `400`, `401`, `403`, `500` |

### 3.19 `POST /api/admin/users`

Create a user (FR-13, BR-24, AC-26).

| | |
| --- | --- |
| Auth | Administrator |
| Body | `{ "name": "…", "email": "…", "role": "Requester" \| "ITStaff" \| "Administrator", "isActive": true, "initialPassword": "…" }` |
| Validation | `name` 1–100 chars; `email` valid, ≤ 254, lower-cased; `role` one of three; `isActive` boolean (default `true`); `initialPassword` per BR-08 |
| Success | `201` — `AdminUser` with `mustChangePassword: true` |
| Errors | `400 VALIDATION_FAILED`, `409 CONFLICT` (email in use — `fields.email` set so the UI places it), `401`, `403`, `500` |

### 3.20 `GET /api/admin/users/:id`

One user for the edit panel.

| | |
| --- | --- |
| Auth | Administrator |
| Success | `200` — `AdminUser` |
| Errors | `401`, `403`, `404`, `500` |

### 3.21 `PATCH /api/admin/users/:id`

Edit basic account information (FR-13, BR-25 … BR-27, AC-27, AC-29).

| | |
| --- | --- |
| Auth | Administrator |
| Body | Any subset of `{ "name", "email", "role", "isActive" }`. Unknown fields (including `password`, `department`) are ignored |
| Validation | As in 3.19 for the fields present |
| Guards | `isActive: false` on the caller's own id → `409 CONFLICT` ("You cannot deactivate your own account."). `isActive: false` or `role` ≠ `Administrator` on the last active Administrator → `409 CONFLICT` ("At least one active administrator is required."). Duplicate email → `409 CONFLICT` with `fields.email` |
| Success | `200` — `AdminUser`. If `isActive` became `false` or `role` changed, all of the user's sessions are deleted |
| Errors | `400`, `401`, `403`, `404`, `409`, `500` |

### 3.22 `POST /api/admin/users/:id/initial-password`

Set a new initial password (FR-13, BR-27, AC-28).

| | |
| --- | --- |
| Auth | Administrator |
| Body | `{ "initialPassword": "…" }` per BR-08 |
| Success | `200` — `AdminUser` with `mustChangePassword: true`; the user's sessions are deleted |
| Errors | `400`, `401`, `403`, `404`, `500` |

Allowed on the caller's own account (an Administrator may reset themselves; they will then be forced to change it on next login).

---

### 3.23 Removed endpoints

`GET /api/requesters`, `GET /api/users`, `POST /api/users` are deleted with the selector and the legacy Lab 1 `User` table. Calls answer `404` like any unknown route.

---

## 4. Capability Coverage

| Handout capability (§6) | Endpoint(s) |
| --- | --- |
| Login, logout, current user, mandatory password change | 3.1 – 3.4 |
| Authenticated continuation of Lab 2 Requester APIs | 3.5 |
| IT Staff queue with search, filters, sorting, pagination | 3.9 |
| Retrieve one ticket for IT Staff operations | 3.10 |
| Claim, assign, reassign ownership | 3.12, 3.13 (assignee list 3.11) |
| Update IT Priority and permitted status | 3.14, 3.15 |
| Create and retrieve Public Comments | 3.6, 3.7 |
| Create and retrieve Internal Notes for permitted roles | 3.16, 3.17 |
| Requester indicates problem appears resolved | 3.8 |
| Administrator user list with search and optional role filter | 3.18 |
| Create user with one role | 3.19 |
| Update name, email, role, activation | 3.21 |
| Set / reset initial password | 3.22 |

---

## 5. Test Coverage

| Endpoint | API tests (tests.md) |
| --- | --- |
| 3.1 login | API-01 … API-06 |
| 3.2 logout · 3.3 me | API-07, API-09 |
| 3.4 change-password | API-10 … API-12 |
| Authorization matrix (cross-role, unauthenticated) | API-13 … API-18 |
| 3.5 Requester regression | API-19 … API-21 |
| 3.6 – 3.8 comments, resolution indication | API-08, API-22 … API-25 |
| 3.9 queue · 3.11 assignees | API-26 … API-30 |
| 3.10, 3.12 – 3.15 staff detail and operations | API-31 … API-37 |
| 3.16 – 3.17 internal notes | API-08, API-38, API-39 |
| 3.18 – 3.22 admin users | API-40 … API-48 |

---

## 6. Open Decisions

| ID | Decision | Status |
| --- | --- | --- |
| API-D-01 | Absolute 8 h session with no sliding renewal. | Decided — simpler to test; a working day fits. Revisit if Lab 4 adds long-running screens. |
| API-D-02 | `permittedTransitions` computed on the server and returned in `StaffTicketDetail`. | Decided — the client renders what it is given; the matrix lives in one module (`ticketWorkflow.ts`). |
| API-D-03 | Comments and notes are unpaginated arrays. | Decided — threads are short in this product; revisit if a ticket exceeds ~100 entries. |
| API-D-04 | Claim on an already-owned ticket replaces the owner silently. | Decided — matches "claim or reassign" in the handout; a confirmation is a UI concern (ui-spec.md 3.6). |
