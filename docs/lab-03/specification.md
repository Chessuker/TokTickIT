# Lab 3 — Sprint Engineering Specification

| Field | Detail |
| --- | --- |
| Project | TokTickIT |
| Sprint / Lab | CPE334 Lab 3 — Users, Roles, IT Staff Ticketing, and Admin Screens |
| Author | Thawat Boonsuk (67070501024) |
| Status | Draft — contract for Sprint 3, written before implementation |
| Last updated | 2026-09-15 |
| Extends | [Lab 2 specification](../lab-02/specification.md) — everything there stays in force unless a section below changes it |
| Related documents | [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md), [tests.md](tests.md), [reviewer.md](reviewer.md), [ai-use.md](ai-use.md) |

---

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real email/password authentication and three server-enforced roles (Requester, IT Staff, Administrator). IT Staff get a Ticket Queue and an operational Ticket Detail where they claim or reassign tickets, set IT Priority, move tickets through a defined status workflow, talk to the Requester through Public Comments and keep private Internal Notes. Administrators get one minimalist User Management screen. Every Lab 2 Requester function keeps working on the authenticated identity, and no existing Ticket or Attachment data is lost by the migration.

---

## 2. Stakeholder Request Interpretation

- **Who the users are now:** three kinds of people share one application. Requesters (as in Lab 2) submit and follow their own tickets. IT Staff work the queue. One or more Administrators keep the account list correct.
- **What problem they have today:** anyone can pick any requester from a dropdown, nobody can work a ticket after it is created, and there is no way to add a user without editing the seed. The system has no notion of who is allowed to do what.
- **What they expect after this sprint:**
  - Sign in with an email and password. A user given an initial password by an Administrator must pick a new one before seeing anything else.
  - See only the navigation and actions their role permits, and be refused by the server, not just the UI, when they try anything else.
  - Requesters keep creating and managing their own tickets and attachments exactly as in Lab 2, now under their own account, and can comment on a ticket and say "this looks fixed".
  - IT Staff find work in a searchable, filterable, sortable, paginated queue; open a ticket; take it or hand it to a colleague; set an IT Priority separate from what the Requester asked for; move it through New → … → Closed; and write comments the Requester sees and notes the Requester never sees.
  - Administrators list, search, create, edit, activate/deactivate users, give them one role, and reset an initial password. Nothing more.
- **What "good" looks like:** the same Zen Green screens, extended rather than replaced; a Requester who tampers with a request still only ever sees their own data; an Administrator cannot lock everyone out by deactivating the last Administrator; a wrong password and an unknown email produce the same answer.
- **What I read as out of scope, and why:** everything in §3.2. In particular Actions Taken, SLA, notifications and any email delivery are named as later sprints by the handout, and self-registration would contradict "Administrators create accounts".

---

## 3. Scope

### 3.1 Included

- Login, logout, current-user retrieval, mandatory first-login password change (FR-01 … FR-03).
- Server-side role-based authorization and Requester ownership checks on every protected endpoint (FR-04).
- Migration of `RequesterUser` into a real `User` model with credentials, role and activation state; removal of the Development Requester selector and its client state (FR-05, FR-14).
- All Lab 2 Requester functions (Create Ticket, My Tickets, Ticket Detail, attachment lifecycle) on the authenticated identity (FR-05).
- Public Comments on a ticket and the Requester's "Problem Appears Resolved" indication (FR-06, FR-07).
- IT Staff Ticket Queue with search, filters, sorting and pagination (FR-08).
- IT Staff Ticket Detail: ownership (claim/assign/reassign/unassign), IT Priority, permitted status transitions, Internal Notes, read access to attachments (FR-09 … FR-12).
- Minimalist Administrator User Management: list, search, optional role filter, create, edit, one-role assignment, activate/deactivate, set a new initial password, with the safety rules in §5 (FR-13).
- Idempotent seed covering all three roles, active and inactive accounts, realistic tickets, comments and notes (FR-14).
- Zen Green extensions: Login and Change Password screens, role-aware application shell, status/priority/role badges, Public-vs-Internal visual distinction (ui-spec.md).

### 3.2 Excluded

| ID | Excluded | Why |
| --- | --- | --- |
| X-01 | Email invitations, password-reset email, MFA, social login, SSO | Handout §4.2 |
| X-02 | Self-registration and Requester-created accounts | Accounts come only from an Administrator (handout §3) |
| X-03 | Actions Taken by IT Staff, and the rule blocking resolution while actions are incomplete | Deferred to Lab 4 (handout §4.5) |
| X-04 | SLA calculation, escalation, notification services | Handout §4.2 |
| X-05 | Dashboards or KPI analytics beyond queue counts | Handout §4.2 |
| X-06 | Multi-tenant organisations, departments, customer administration | Handout §4.2. The existing `department` column is kept but is read-only and not editable by anyone |
| X-07 | Production deployment or cloud infrastructure | Handout §4.2 |
| X-08 | Multiple roles per user, role history, account audit history | One `role` column (handout §5.1) |
| X-09 | User deletion, bulk operations, import/export | Deactivation replaces deletion (handout §4.4) |
| X-10 | Profile photo, extended profile fields | Handout §4.2 |
| X-11 | Account unlocking UI, administrator approval workflows | Login throttling is time-based and self-clearing (BR-07), so nothing needs unlocking |
| X-12 | Mandatory pagination, multi-column sorting or multiple simultaneous filters on the user list | Handout §8.5 "not required"; the list is small and one search + one optional role filter is enough |
| X-13 | Editing or deleting a Public Comment or Internal Note | Append-only in Lab 3 (handout §4.6) |
| X-14 | IT Staff or Administrator creating tickets on a Requester's behalf | Not requested; keeps ownership rules simple |
| X-15 | Requester reopening a Resolved/Closed ticket | Requester can only *indicate* resolution (BR-05); reopening is an IT Staff transition |

---

## 4. Functional Requirements

| ID | Requirement | Description | Priority |
| --- | --- | --- | --- |
| FR-01 | Login | A user signs in with email and password. On success the server establishes an authenticated session and returns the user's identity and role. On failure the response is generic; an inactive account receives a distinct but non-revealing message. | Must |
| FR-02 | Mandatory password change | A user flagged `mustChangePassword` is routed to a Change Password screen after login and cannot reach any other screen or data endpoint until a new valid password is saved. | Must |
| FR-03 | Current user, shell and logout | The application shell shows the authenticated user's name and role, role-specific navigation, and Logout. Logout invalidates the session on the server; direct access afterwards is refused. | Must |
| FR-04 | Server-side authorization | Every protected endpoint checks authentication, role and (for Requesters) ownership on the server. Hidden or disabled UI controls are feedback only. | Must |
| FR-05 | Requester regression | Create Ticket, My Tickets, Ticket Detail and the attachment lifecycle from Lab 2 work unchanged for a logged-in Requester, using the session identity. The Development Requester selector, the `X-Requester-Id` header and the Change Requester action are removed. | Must |
| FR-06 | Public Comments | A Requester (own ticket) or IT Staff (any ticket) appends a Public Comment; Requester, IT Staff and Administrator can read them, newest first, with author and time. | Must |
| FR-07 | Problem Appears Resolved | A Requester marks their own non-terminal ticket as "appears resolved". The ticket records the time; IT Staff see an indicator; the status does not change. | Must |
| FR-08 | IT Staff Ticket Queue | IT Staff see all tickets in a paginated list with search, filters (status, IT priority, owner, category), sorting, ownership and status badges, and an Open action. Administrators see the same list read-only. | Must |
| FR-09 | Ticket ownership | IT Staff claim an unassigned ticket, assign or reassign it to an active IT Staff user, or unassign it. | Must |
| FR-10 | IT Priority | IT Staff change a ticket's IT Priority (Low/Medium/High) independently of the Requested Priority, which stays as submitted. | Must |
| FR-11 | Status workflow | IT Staff move a ticket only along the transitions in §5 (Transition matrix). Terminal-looking moves ask for confirmation in the UI; the server rejects anything not in the matrix. | Must |
| FR-12 | Internal Notes | IT Staff append Internal Notes to a ticket; IT Staff and Administrators read them; Requesters are refused without seeing any content. | Must |
| FR-13 | Administrator user management | An Administrator lists users (Name, Email, Role, Status, Edit), searches by name or email, optionally filters by role, creates a user with one role and an initial password, edits name/email/role/activation, and sets a new initial password. Safety rules BR-24 … BR-27 apply. | Must |
| FR-14 | Migration and seed | Existing `RequesterUser` rows become `User` rows with role Requester and a documented initial password; all Lab 2 tickets and attachments keep their owner. The seed is idempotent and creates the accounts, tickets, comments and notes listed in §7. | Must |

---

## 5. Business Rules

BR-01 … BR-05 are the handout's mandatory rules, kept verbatim.

### Authentication and session

| ID | Rule |
| --- | --- |
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| BR-03 | The authenticated user identity, not a requesterId supplied by the client, determines ownership of Requester operations. |
| BR-04 | Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator. |
| BR-05 | A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed. |
| BR-06 | A failed login (unknown email or wrong password) answers `401 INVALID_CREDENTIALS` with the same message in both cases. Only when the credentials are correct *and* the account is inactive does the server answer `403 ACCOUNT_INACTIVE`, so an attacker cannot learn whether an email exists without already knowing its password. |
| BR-07 | After 5 failed logins for the same email within 15 minutes the server answers `429 TOO_MANY_ATTEMPTS` for that email until the window passes. The counter is in-memory (local lab), resets on a successful login, and is never shown to the user beyond "try again later". |
| BR-08 | Password policy: 8–72 characters, at least one upper-case letter, one lower-case letter, one digit and one non-alphanumeric character. Applies to Change Password and to any initial password an Administrator sets. |
| BR-09 | Passwords are stored only as bcrypt hashes (cost 10). A password or hash never appears in any API response, log line or seed output. |
| BR-10 | A session is a random 256-bit token stored hashed in the `Session` table and delivered in an `httpOnly`, `SameSite=Lax` cookie. It expires 8 hours after login. Logout deletes the session row; an expired or deleted session answers `401 UNAUTHORIZED`. Deactivating a user, changing their role, or setting a new initial password deletes all of that user's sessions. |
| BR-11 | Change Password requires the current password, a new password satisfying BR-08 that differs from the current one, and a matching confirmation. Success clears `mustChangePassword` and keeps the current session. |
| BR-12 | Email addresses are unique case-insensitively and stored lower-cased and trimmed. Login matching is case-insensitive. |
| BR-13 | Every user has exactly one role: `Requester`, `ITStaff` or `Administrator`. |

### Ownership and roles

| ID | Rule |
| --- | --- |
| BR-14 | All Lab 2 ticket and attachment operations remain owner-scoped: a Requester reaching another Requester's ticket or attachment is answered `403 FORBIDDEN` exactly as in Lab 2 (BR-04 there), with no ticket, attachment or note content in the body. IT Staff and Administrators may read any ticket and download any active attachment but may not add or remove attachments. |
| BR-15 | A Ticket has zero or one owner. The owner must be an active user with role `ITStaff`. Claim sets the caller as owner; assign/reassign sets another active IT Staff; unassign clears the owner. An inactive or non-IT-Staff target is rejected with `400 VALIDATION_FAILED`. |
| BR-16 | `itPriority` is copied from the Requested Priority when a ticket is created (and by the migration for existing tickets). Only IT Staff may change it afterwards. The Requested Priority is immutable once the ticket exists. |
| BR-17 | Administrators have read-only access to the queue, ticket detail, comments and internal notes. Any ticket mutation by an Administrator is `403 FORBIDDEN`. |

### Status workflow

| ID | Rule |
| --- | --- |
| BR-18 | Statuses are `New`, `Open`, `InProgress`, `WaitingForRequester`, `Resolved`, `Closed`, `Reopened`, `Cancelled`. A status change is accepted only if the pair appears in the transition matrix below; anything else is `409 INVALID_TRANSITION`. Only IT Staff may change status. |
| BR-19 | Moving to `InProgress` or `Resolved` requires an owner (`409 INVALID_TRANSITION` otherwise). Claiming a `New` ticket sets it to `Open` in the same operation. |
| BR-20 | `Resolved` stamps `resolvedAt`; `Closed` stamps `closedAt`; `Reopened` clears `resolvedAt`, `closedAt` and `requesterResolvedAt`. `Cancelled` is terminal. |
| BR-21 | The Requester's "appears resolved" indication sets `requesterResolvedAt` on an owned ticket whose status is not `Resolved`, `Closed` or `Cancelled`. Repeating it is a no-op (`200`, same timestamp). On a terminal ticket it is `409 INVALID_TRANSITION`. |

**Transition matrix** (rows = current status, ✓ = permitted for IT Staff; ⚠ = UI asks for confirmation first):

| From \ To | Open | InProgress | WaitingForRequester | Resolved | Closed | Reopened | Cancelled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New | ✓ | ✓ (owner) | – | – | – | – | ⚠ |
| Open | – | ✓ (owner) | ✓ | ⚠ (owner) | – | – | ⚠ |
| InProgress | – | – | ✓ | ⚠ (owner) | – | – | ⚠ |
| WaitingForRequester | – | ✓ (owner) | – | ⚠ (owner) | – | – | ⚠ |
| Resolved | – | – | – | – | ⚠ | ✓ | – |
| Closed | – | – | – | – | – | ✓ | – |
| Reopened | – | ✓ (owner) | ✓ | ⚠ (owner) | – | – | ⚠ |
| Cancelled | – | – | – | – | – | – | – |

### Comments and notes

| ID | Rule |
| --- | --- |
| BR-22 | Public Comments and Internal Notes are append-only. Body is trimmed, must be 1–2000 characters, and is stored and rendered as plain text (never interpreted as HTML). Author and creation time are set by the server. |
| BR-23 | A Requester may comment only on their own ticket; IT Staff may comment on any ticket; an Administrator may read but not create comments. Internal Notes are created by IT Staff only and read by IT Staff and Administrators; a Requester calling any Internal Note endpoint is answered `403 FORBIDDEN` with no note content, count or existence hint. |

### Administrator safety

| ID | Rule |
| --- | --- |
| BR-24 | An Administrator creates a user with name, unique email, exactly one role, activation state and an initial password; the new user has `mustChangePassword = true`. A duplicate email is `409 CONFLICT`; an unknown role is `400 VALIDATION_FAILED`. |
| BR-25 | An Administrator may edit only name, email, role and `isActive`. An Administrator cannot deactivate their own account (`409 CONFLICT`). |
| BR-26 | The system always keeps at least one active Administrator: deactivating the last active Administrator or changing their role is `409 CONFLICT`. |
| BR-27 | Setting a new initial password stores its hash, sets `mustChangePassword = true` and deletes the user's sessions, so the user must sign in with it and change it. Users are never deleted; deactivation is the only way to retire an account, and a deactivated user's existing sessions are deleted immediately. |

### Regression, migration and safety

| ID | Rule |
| --- | --- |
| BR-28 | The migration renames `RequesterUser` to `User` in place: ids, emails, names, `department` and `isActive` are preserved, every migrated row gets role `Requester`, `mustChangePassword = true`, and the documented local initial password. Ticket and attachment counts and `requesterId` values are identical before and after. |
| BR-29 | The seed is idempotent (upsert by `email` / `ticketNumber`) and never deletes. Seeded credentials are for local development only and are listed in the README, never in a response. |
| BR-30 | Every protected endpoint distinguishes `401` (no valid session), `403` (authenticated but not permitted, or password change pending), `400` (invalid input), `404` (missing resource the caller could otherwise access), `409` (conflict or invalid transition) and `500` (generic message with a correlation id). `500` bodies never contain stack traces, SQL or file paths. |

### Authorization matrix

| Operation | Requester | IT Staff | Administrator |
| --- | --- | --- | --- |
| Login / logout / `GET me` / change password | ✓ | ✓ | ✓ |
| Create ticket, list own tickets, view own ticket | ✓ owner | – | – |
| Add / remove attachment | ✓ owner | – | – |
| View / download attachment | ✓ owner | ✓ read | ✓ read |
| Read Public Comments | ✓ owner | ✓ | ✓ |
| Create Public Comment | ✓ owner | ✓ | – |
| Indicate problem appears resolved | ✓ owner | – | – |
| Ticket Queue, staff Ticket Detail | – | ✓ | ✓ read |
| Claim / assign / reassign / unassign | – | ✓ | – |
| Set IT Priority | – | ✓ | – |
| Change status | – | ✓ | – |
| Read Internal Notes | – (403, no content) | ✓ | ✓ |
| Create Internal Note | – | ✓ | – |
| List / search users, create, edit, set initial password | – | – | ✓ |

---

## 6. UI Specification Summary

Full details live in [ui-spec.md](ui-spec.md). Summary:

- **Theme:** unchanged Zen Green tokens. New pill badges for the eight statuses, IT Priority (same scale as Requested Priority, labelled "IT"), and the three roles.
- **Shell:** header shows the app name, role-specific navigation (Requester: My Tickets, Create Ticket · IT Staff: Queue · Administrator: Users, Queue), and a Profile menu with the user's name, role badge, Change Password and Logout. The Development Requester block and Change Requester button are gone.
- **Screens:** Login; Change Password (also reachable voluntarily from the Profile menu); Requester Ticket Detail gains a Public Comments panel and a "Problem appears resolved" action; IT Staff Ticket Queue (desktop table, tablet/mobile cards); IT Staff Ticket Detail with editable operational fields, tabs for Public Comments / Internal Notes / Attachments; Administrator Users list with a side panel for create/edit.
- **Modes and feedback:** every screen names its loading, saving, success, validation, empty, no-results, forbidden, not-found, conflict and safe-failure feedback in ui-spec.md §3, and the visual checklist V-01 … V-14 is run at 1280 / 820 / 375 px.
- **Public vs Internal:** Internal Notes use an amber left border, an "Internal" label and a distinct composer heading so a private note is not typed into the public box.

---

## 7. Data Changes

PostgreSQL via Prisma. One migration, `20260915000000_lab03_users_roles_workflow`, written by hand so that existing rows are transformed rather than recreated.

### `User` (renamed from `RequesterUser`; legacy Lab 1 `User` table dropped)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | Unchanged — the same ids that `Ticket.requesterId` already points at |
| `name` | `String` | Editable by Administrator |
| `email` | `String @unique` | Lower-cased, trimmed (BR-12) |
| `department` | `String?` | Kept from Lab 2, read-only in Lab 3 |
| `role` | `Role @default(Requester)` | `enum Role { Requester, ITStaff, Administrator }` |
| `passwordHash` | `String` | bcrypt. Migration fills existing rows with the hash of the documented initial password (BR-28) |
| `mustChangePassword` | `Boolean @default(true)` | Set by create-user, set-initial-password and the migration; cleared by Change Password |
| `isActive` | `Boolean @default(true)` | Unchanged |
| `lastLoginAt` | `DateTime?` | Stamped on successful login |
| `createdAt`, `updatedAt` | `DateTime` | Unchanged |
| relations | `tickets Ticket[] @relation("TicketRequester")`, `ownedTickets Ticket[] @relation("TicketOwner")`, `sessions Session[]`, `comments TicketComment[]`, `internalNotes TicketInternalNote[]` | |

The legacy Lab 1 `User` table (id, email, name) held only the seed row `admin@toktickit.xyz` and was served by `/api/users`, which no screen uses. It is dropped in the same migration; its email is reused as the seeded Administrator.

### `Session` (new)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | |
| `tokenHash` | `String @unique` | SHA-256 of the raw cookie token; the raw token is never stored |
| `userId` | `String` | FK → `User`, `onDelete: Cascade` |
| `expiresAt` | `DateTime` | login time + 8 h (BR-10) |
| `createdAt` | `DateTime @default(now())` | |

### `Ticket` (changed)

| Field | Change |
| --- | --- |
| `status` | `TicketStatus` enum extended to `New, Open, InProgress, WaitingForRequester, Resolved, Closed, Reopened, Cancelled`. Existing rows stay `New` |
| `priority` | Unchanged; it *is* the Requested Priority and is immutable after create (BR-16). The API exposes it as `requestedPriority` on staff endpoints and keeps `priority` on Lab 2 endpoints |
| `itPriority` | New `TicketPriority`; migration runs `UPDATE "Ticket" SET "itPriority" = "priority"` |
| `ownerId` | New `String?`, FK → `User` `@relation("TicketOwner")`, `onDelete: SetNull` |
| `requesterResolvedAt` | New `DateTime?` (BR-21) |
| `resolvedAt`, `closedAt` | New `DateTime?` (BR-20) |
| `requester` | Relation target renamed to `User` (`@relation("TicketRequester")`); `onDelete: Restrict` unchanged |

### `TicketComment` and `TicketInternalNote` (new, identical shape)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | |
| `ticketId` | `String` | FK → `Ticket`, `onDelete: Cascade` |
| `authorId` | `String` | FK → `User`, `onDelete: Restrict` |
| `body` | `String` | 1–2000 chars, plain text (BR-22) |
| `createdAt` | `DateTime @default(now())` | |

Two tables rather than one with a `visibility` column: a query that forgets a `where` on visibility would leak notes to Requesters, whereas a query against `TicketComment` cannot return a note at all (AD-03).

### Indexes

| Model | Index | Serves |
| --- | --- | --- |
| `User` | `@@index([role, isActive])` | Assignee list (active IT Staff), Admin role filter, "last active Administrator" check |
| `Session` | `@@index([userId])`, `@@index([expiresAt])` | Delete-all-for-user on deactivation; expiry sweep |
| `Ticket` | `@@index([ownerId, status])`, `@@index([itPriority])`, `@@index([updatedAt])` | Queue filters "mine / unassigned", IT-priority filter, default queue ordering. Lab 2 indexes stay |
| `TicketComment`, `TicketInternalNote` | `@@index([ticketId, createdAt])` | Newest-first listing per ticket |

### Migration strategy (BR-28)

1. `DROP TABLE "User"` (legacy, no FKs point at it).
2. `ALTER TABLE "RequesterUser" RENAME TO "User"`; rename its indexes and the FK constraint on `Ticket.requesterId`.
3. Create enum `Role`; add `role`, `passwordHash` (default `''`), `mustChangePassword` (default `true`), `lastLoginAt` to `User`.
4. `ALTER TYPE "TicketStatus" ADD VALUE …` for the seven new statuses.
5. Add `itPriority` (nullable), `UPDATE SET "itPriority" = "priority"`, then `SET NOT NULL`; add `ownerId`, `requesterResolvedAt`, `resolvedAt`, `closedAt`, FK and indexes.
6. Create `Session`, `TicketComment`, `TicketInternalNote`.
7. The seed (not the migration) writes the real bcrypt hash for every user whose `passwordHash` is `''`, so no hash is hard-coded in SQL. Until the seed runs, a migrated user cannot log in (`''` never matches), which is the safe default.

### Seed data (idempotent, BR-29)

| Set | Rows | Notes |
| --- | --- | --- |
| Requesters | 4 active (Jennifer Anderson, Sarah Johnson, David Lee, Michael Brown), 1 inactive (Alex Smith) | The five Lab 2 rows, upserted by email. Jennifer is seeded with `mustChangePassword = false` and password `Requester1!` so E2E can log straight in; the other four keep `Welcome123!` + `mustChangePassword = true` (first-login E2E uses Sarah) |
| IT Staff | 3 active (Nattapong Srisuk, Priya Raman, Chen Wei), 1 inactive (Robert Wilson) | Password `Staff1!pass`, `mustChangePassword = false` |
| Administrator | 1 active (`admin@toktickit.xyz`, "System Administrator") | Password `Admin1!pass`, `mustChangePassword = false` |
| Categories, Related Systems | unchanged from Lab 2 | |
| Tickets | 24 across the four active Requesters; every status at least twice; every priority; ~⅓ unassigned, the rest spread over the three active IT Staff | Upserted by `ticketNumber` (`TKT-2026-9000xx`), so they never collide with user-created tickets |
| Public Comments | ~2 per non-`New` ticket, alternating Requester / owner | Plain, non-sensitive text |
| Internal Notes | 1–2 on `InProgress` / `WaitingForRequester` / `Resolved` tickets | Plain, non-sensitive text |

All seeded passwords are documented in `README.md` under "Local development accounts" and nowhere else.

---

## 8. API Contract

Full request/response shapes, validation and error codes are in [api-spec.md](api-spec.md). Summary:

| Area | Method and path | Roles |
| --- | --- | --- |
| Auth | `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` | any (login: anonymous) |
| Requester (Lab 2, now session-scoped) | `POST /api/tickets` · `GET /api/tickets` · `GET /api/tickets/:id` · `POST /api/tickets/:id/attachments` · `GET /api/attachments/:id` · `GET /api/attachments/:id/download` · `PATCH /api/attachments/:id/remove` | Requester (owner); attachment reads also IT Staff / Administrator |
| Comments | `GET /api/tickets/:id/comments` · `POST /api/tickets/:id/comments` · `POST /api/tickets/:id/resolution-indication` | per authorization matrix |
| Staff queue and detail | `GET /api/staff/tickets` · `GET /api/staff/tickets/:id` · `GET /api/staff/assignees` | IT Staff, Administrator (read) |
| Staff operations | `POST /api/staff/tickets/:id/claim` · `PATCH /api/staff/tickets/:id/owner` · `PATCH /api/staff/tickets/:id/it-priority` · `PATCH /api/staff/tickets/:id/status` | IT Staff |
| Internal notes | `GET /api/staff/tickets/:id/internal-notes` · `POST /api/staff/tickets/:id/internal-notes` | read: IT Staff, Administrator · create: IT Staff |
| Admin | `GET /api/admin/users` · `POST /api/admin/users` · `GET /api/admin/users/:id` · `PATCH /api/admin/users/:id` · `POST /api/admin/users/:id/initial-password` | Administrator |
| Removed | `GET /api/requesters` · `GET/POST /api/users` | — |

**Authentication mechanism:** opaque session token in an `httpOnly` cookie (`toktickit_session`), validated on every request by `requireAuth`; role gate `requireRole(...)`; ownership resolved by the existing `findTicketForRequester` helper now fed from the session user (BR-03).

### Status code meanings

| Code | Error code | Meaning |
| --- | --- | --- |
| 200 / 201 / 204 | — | Success |
| 400 | `VALIDATION_FAILED` | Invalid body, query or path input; `fields` names each problem |
| 401 | `UNAUTHORIZED` · `INVALID_CREDENTIALS` | No valid session · login failed (generic) |
| 403 | `FORBIDDEN` · `ACCOUNT_INACTIVE` · `PASSWORD_CHANGE_REQUIRED` | Role or ownership refused · valid credentials but inactive · session valid but password change pending |
| 404 | `NOT_FOUND` | Resource missing (only where the caller could otherwise access it) |
| 409 | `CONFLICT` · `INVALID_TRANSITION` | Duplicate email, last-Administrator or self-deactivation guard · status/ownership rule violated |
| 413 / 415 | `FILE_TOO_LARGE` · `UNSUPPORTED_MEDIA_TYPE` | Unchanged from Lab 2 |
| 429 | `TOO_MANY_ATTEMPTS` | Login throttled (BR-07) |
| 500 | `INTERNAL_ERROR` | Generic message + correlation id |

---

## 9. Acceptance Criteria

AC-01 … AC-04 are the handout's examples, kept verbatim.

| ID | Criterion |
| --- | --- |
| AC-01 | **Given** an active user with valid credentials, **when** the user logs in, **then** the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | **Given** a user who must change the initial password, **when** login succeeds, **then** normal application screens remain unavailable until a valid new password is saved. |
| AC-03 | **Given** an authenticated Requester, **when** the client supplies another requesterId, **then** the backend still applies the authenticated identity and does not return another Requester's data. |
| AC-04 | **Given** a Requester account, **when** an Internal Note endpoint is requested, **then** the operation is rejected without exposing note content. |
| AC-05 | **Given** an unknown email or a wrong password, **when** login is attempted, **then** the server answers `401 INVALID_CREDENTIALS` with an identical message for both cases and the UI shows "Invalid email or password". |
| AC-06 | **Given** an inactive account with correct credentials, **when** login is attempted, **then** the server answers `403 ACCOUNT_INACTIVE`, no session is created, and the UI says the account is inactive and to contact an administrator. |
| AC-07 | **Given** five failed logins for one email within 15 minutes, **when** a sixth attempt is made, **then** the server answers `429 TOO_MANY_ATTEMPTS` even with the correct password. |
| AC-08 | **Given** a logged-in user, **when** they log out, **then** the session row is deleted, the cookie is cleared, `GET /api/auth/me` answers `401`, and navigating back to an application URL redirects to Login. |
| AC-09 | **Given** the Change Password screen, **when** the new password breaks BR-08, equals the current password, or the confirmation differs, **then** the server answers `400` with field errors and the UI shows them under the correct fields. |
| AC-10 | **Given** a user with `mustChangePassword`, **when** a valid new password is saved, **then** `mustChangePassword` is cleared, the same session continues, and the user lands on their role's home screen. |
| AC-11 | **Given** any role, **when** the shell renders, **then** only that role's navigation is shown, and typing another role's URL shows a forbidden state without loading data. |
| AC-12 | **Given** direct API calls, **when** a Requester calls a staff or admin endpoint, IT Staff calls an admin endpoint, an Administrator calls a ticket-mutation endpoint, or anyone calls a protected endpoint without a session, **then** the answers are `403`, `403`, `403` and `401` respectively with no resource data. |
| AC-13 | **Given** a logged-in Requester, **when** they create a ticket, list My Tickets, open a detail and add/download/remove an attachment, **then** everything behaves as the Lab 2 acceptance criteria describe, no `X-Requester-Id` header is sent, and `/select-requester` no longer exists. |
| AC-14 | **Given** a Requester on their own ticket, **when** they post a Public Comment, **then** it appears newest-first with their name and server time; an empty or whitespace body is `400`; a comment on another Requester's ticket is `403`. |
| AC-15 | **Given** a Requester on an own ticket that is not Resolved/Closed/Cancelled, **when** they click "Problem appears resolved", **then** `requesterResolvedAt` is set, the status is unchanged, IT Staff see the indicator, and any attempt by the Requester to set status is `403`. |
| AC-16 | **Given** IT Staff on the Ticket Queue, **when** the page loads, **then** tickets of all Requesters are listed with Ticket No, Created, Summary, Category, Requested Priority, IT Priority, Status, Owner and Updated, 10 per page, newest-updated first, with page metadata. |
| AC-17 | **Given** the queue, **when** search, a status/priority/owner/category filter, a sort or a page is applied, **then** the list updates accordingly; a filter matching nothing shows a no-results state distinct from the empty state; an invalid parameter is `400`. |
| AC-18 | **Given** an unassigned `New` ticket, **when** IT Staff click Claim, **then** the owner becomes the caller and the status becomes `Open`. |
| AC-19 | **Given** a ticket, **when** IT Staff reassign it to another active IT Staff, **then** the owner changes; reassigning to an inactive or non-IT-Staff user is `400`. |
| AC-20 | **Given** a ticket, **when** IT Staff change the IT Priority, **then** it is saved and the Requested Priority is unchanged. |
| AC-21 | **Given** a ticket, **when** IT Staff request a transition in the matrix, **then** it is applied (with a confirmation dialog for Resolved, Closed and Cancelled); a transition not in the matrix is `409 INVALID_TRANSITION` and the UI keeps the previous status. |
| AC-22 | **Given** an unassigned ticket, **when** IT Staff try `InProgress` or `Resolved`, **then** the server answers `409` and the UI explains an owner is required. |
| AC-23 | **Given** a ticket, **when** IT Staff add an Internal Note, **then** it appears in the Internal Notes panel with author and time; an Administrator can read it; the note is absent from every Requester-facing response. |
| AC-24 | **Given** a ticket with attachments, **when** IT Staff or an Administrator open the staff detail, **then** active attachments are listed and downloadable, removed ones are shown as removed, and no add or remove control is offered (a direct call is `403`). |
| AC-25 | **Given** an Administrator on Users, **when** the list loads, searches by partial name or email, or filters by role, **then** matching users show Name, Email, Role badge, Active/Inactive badge and Edit. |
| AC-26 | **Given** the Create User panel, **when** a valid user is saved, **then** it appears in the list with `mustChangePassword`; a duplicate email is `409` shown under the email field; a missing field or unknown role is `400` shown under its field. |
| AC-27 | **Given** the Edit User panel, **when** name, email, role or activation is changed and saved, **then** the list reflects it and a deactivated user's next request answers `401`. |
| AC-28 | **Given** a user, **when** the Administrator sets a new initial password, **then** the user's next login succeeds only with it and is immediately routed to Change Password. |
| AC-29 | **Given** the Administrator's own account or the last active Administrator, **when** deactivation (or, for the last Administrator, a role change) is attempted, **then** the server answers `409 CONFLICT` and the UI shows the reason inline. |
| AC-30 | **Given** a Requester or IT Staff, **when** they open `/admin/users` or call any `/api/admin/*` endpoint, **then** the UI shows a forbidden state and the API answers `403` with no user data. |
| AC-31 | **Given** a Lab 2 database with tickets and attachments, **when** the Lab 3 migration and seed run, **then** ticket and attachment counts are unchanged, every `requesterId` still resolves, `itPriority` equals `priority`, and each former requester can log in with the documented initial password and is forced to change it. |
| AC-32 | **Given** a seeded database, **when** the seed runs again, **then** it succeeds and creates no duplicate users, tickets, comments or notes. |
| AC-33 | **Given** Login, Change Password, Queue, Staff Ticket Detail and Users at 1280 / 820 / 375 px, **when** each is inspected, **then** it matches ui-spec.md with no clipping or horizontal overflow. |
| AC-34 | **Given** the backend is unreachable or answers `500`, **when** Login, the Queue, Staff Ticket Detail or Users is used, **then** a safe failure message is shown, entered values are preserved, and no stack trace or internal detail is displayed. |

Every AC maps to at least one planned test in [tests.md](tests.md) §3.

---

## 10. Definition of Done

### 10.1 Product

- [ ] FR-01 … FR-14 implemented; BR-01 … BR-30 enforced on the server.
- [ ] AC-01 … AC-34 verified by the tests named in [tests.md](tests.md); every test passes on `main` from the documented commands; none skipped, disabled or commented out.
- [ ] Authorization matrix and transition matrix implemented exactly as in §5; direct-API evidence captured for each refused row.
- [ ] Migration applied to a database holding Lab 2 data with counts and ownership verified (AC-31); seed re-run twice with identical row counts (AC-32).
- [ ] No plaintext password, hash or session token in any response, log or committed file; secrets only in `.env` (git-ignored) with `.env.example` updated.
- [ ] Development Requester selector, `X-Requester-Id`, `/api/requesters`, `/api/users` and the sessionStorage requester key removed from client, server, tests and E2E helpers.
- [ ] Every screen in ui-spec.md §3 shows its loading, validation, success, empty/no-results, forbidden, not-found, conflict and safe-failure feedback; V-01 … V-14 checked at the three viewports.
- [ ] No console errors on the happy path of each role; no unhandled promise rejections in the server log.
- [ ] `README.md` documents setup, migration, seed, local accounts and test commands for Lab 3.

### 10.2 Course delivery

- [ ] Sprint decomposed into GitHub Issues (see Appendix) tracked on the Kanban; all in Done at submission.
- [ ] Every Issue delivered through `feature/<issue>-<slug>` → pull request → `lab3-staging`; one release pull request `lab3-staging` → `main`. No direct commits to `main` or `lab3-staging`.
- [ ] Each pull request peer-reviewed; `reviewer.md` records reviewer identity, PR links, comments given and received, responses and approvals.
- [ ] The contract (this file, api-spec.md, ui-spec.md, tests.md) merged before the first implementation PR; the merge is screenshotted as evidence for Answer Part 2.
- [ ] `ai-use.md` names the LLM and lists 6–10 key prompts with a reflection.
- [ ] Screenshots under `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/` at desktop, tablet and mobile.
- [ ] One PDF with "Answer Part 1" … "Answer Part 9" in order, built from `docs/lab-03/answer-part*.md`.

---

## 11. Assumptions and Decisions

| ID | Assumption / Decision | Rationale |
| --- | --- | --- |
| AD-01 | Session = random token in an `httpOnly` `SameSite=Lax` cookie, stored hashed in a `Session` table, rather than a JWT. | Logout and deactivation must revoke access immediately (handout §6.1 "logout invalidation"); a server-side row makes that a `DELETE`, whereas a JWT would need a denylist to achieve the same. `SameSite=Lax` covers CSRF for the cookie because every mutating endpoint is a JSON `POST`/`PATCH` that a cross-site form cannot produce; the API also refuses non-JSON bodies. |
| AD-02 | `RequesterUser` is renamed to `User` in place instead of creating a new table and copying rows. | Ticket ownership must stay correct (handout §5.2). Renaming keeps every id and foreign key untouched, so there is nothing to re-point and nothing to get wrong. |
| AD-03 | Public Comments and Internal Notes are two tables. | The only difference is who may read them, and that difference is the security boundary. Separate tables make "return notes to a Requester" impossible by query shape rather than by remembering a filter. |
| AD-04 | Administrators are read-only on tickets; the owner must be IT Staff. | The handout keeps the two roles "conceptually separate" and lets the matrix decide. Read access satisfies BR-04 (Administrators see Internal Notes) and lets an Administrator check what a user is asking about; write access would double every staff test for no requested benefit. |
| AD-05 | Requested Priority keeps its column and Lab 2 API name `priority`; `itPriority` is a new column. | Renaming would break every Lab 2 test and client call for a cosmetic gain. Staff endpoints expose both under unambiguous names (`requestedPriority`, `itPriority`). |
| AD-06 | Claiming a `New` ticket sets `Open` automatically. | "Open" means "someone has looked at it". Claim is exactly that event, and it removes a second click from the most common action. |
| AD-07 | Login throttling is in-memory per email, 5 failures per 15 minutes. | Handout §4.4 asks for a login-attempt rule; a table would be over-engineering for a single-process lab server. The limit is per email, not per IP, because the lab runs behind `localhost`. Restarting the server clears it, which is acceptable locally and documented as such. |
| AD-08 | Password policy is the one shown in the handout's mockup (8+, upper, lower, digit, special) with a 72-byte ceiling. | Matches the reference screen; 72 bytes is bcrypt's input limit, so longer input would be silently truncated. |
| AD-09 | Comment and note bodies are 1–2000 characters, rendered as text nodes. | Long enough for a paragraph of troubleshooting, short enough to keep a thread readable on a phone. React escapes by default; the spec forbids `dangerouslySetInnerHTML` so the limit is the only remaining control. |
| AD-10 | Queue defaults: 10 per page (5/10/25/50 selectable), sorted `updatedAt desc`; searchable fields are ticket number and summary. | Same page sizes as My Tickets for a consistent feel. "Recently touched" is what an IT Staff scanning for work wants first; ticket number and summary are the two fields people quote back. |
| AD-11 | Other Requester's ticket by id stays `403` (Lab 2 behaviour) rather than `404`. | Lab 2 AC-03 and its tests already require `403`; ids are UUIDs so confirming existence reveals nothing useful; and the body never contains the resource. Internal Note endpoints are the exception in the other direction: they answer `403` to Requesters regardless of ticket ownership. |
| AD-12 | Cross-origin cookies: server sets `Access-Control-Allow-Origin` to `CLIENT_ORIGIN` (default `http://localhost:5173`) with `credentials: true`; the client sends `credentials: 'include'`. | Keeps the Lab 2 topology (Vite on 5173, API on 5000) without adding a proxy; `localhost` ports are same-site so `SameSite=Lax` still applies. |
| AD-13 | The seed writes bcrypt hashes; the migration leaves `passwordHash = ''`. | No hash is committed in SQL, and a migrated-but-unseeded user simply cannot log in, which is the safe failure. |
| AD-14 | `department` stays on `User` but is not exposed for editing. | Dropping the column would discard Lab 2 data for no reason; adding editing would expand the Administrator screen beyond the handout's "basic account information". |

---

## Appendix — GitHub Issue Traceability

Issue numbers are filled in once the Issues exist on GitHub.

| Issue | Title | Covers |
| --- | --- | --- |
| #TBD-1 | Sprint 3 engineering contract | This document, `api-spec.md`, `ui-spec.md`, `tests.md` |
| #TBD-2 | Authentication foundation | FR-01 … FR-05, FR-14, BR-01 … BR-14, BR-28 … BR-30, §7, AC-01 … AC-13, AC-31, AC-32 |
| #TBD-3 | Requester regression, Public Comments and resolution indication | FR-05 … FR-07, BR-21 … BR-23, AC-13 … AC-15 |
| #TBD-4 | IT Staff Ticket Queue | FR-08, AD-10, AC-16, AC-17, AC-34 |
| #TBD-5 | IT Staff Ticket operations | FR-09 … FR-12, BR-15 … BR-23, AC-18 … AC-24 |
| #TBD-6 | Administrator user management | FR-13, BR-24 … BR-27, AC-25 … AC-30 |
| #TBD-7 | E2E, visual inspection, release integration | AC-33, AC-34, ui-spec.md §5, tests.md §4–§5, `ai-use.md`, PDF |
