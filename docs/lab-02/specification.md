# Lab 2 — Sprint Engineering Specification

| Field | Detail |
| --- | --- |
| Project | TokTickIT |
| Sprint / Lab | CPE334 Lab 2 — Requester Ticketing MVP |
| Author | Thawat Boonsuk (67070501024) |
| Status | Draft |
| Last updated | _TBD_ |
| Related documents | [ui-spec.md](ui-spec.md), [tests.md](tests.md), [ai-use.md](ai-use.md) |

---

## 1. Sprint Goal

Deliver the Requester-side Ticketing MVP of TokTickIT: a Development Requester selector that stands in for real authentication, a Create Ticket form, a My Tickets list scoped to the selected requester, a read-only Ticket Detail page, and an attachment lifecycle that supports upload, download, and soft removal — all presented under the Zen Green Theme and responsive from mobile to desktop.

---

## 2. Stakeholder Request Interpretation

_In my own words, what the stakeholder is asking for:_

- **Who the user is:** _TBD_
- **What problem they have today:** _TBD_
- **What they expect to be able to do after this sprint:** _TBD_
- **What "good" looks like to them:** _TBD_
- **What I deliberately read as out of scope, and why:** _TBD_

---

## 3. Scope

### 3.1 Included

| # | Item | Notes |
| --- | --- | --- |
| S-01 | Development Requester selector | Dropdown of active requester users; stores the selection for the session. |
| S-02 | Create Ticket | Form with required/optional fields, category and related-system dropdowns, attachments. |
| S-03 | My Tickets | List of tickets belonging to the selected requester only. |
| S-04 | Requester Ticket Detail | Read-only view of one ticket the requester owns. |
| S-05 | Attachment lifecycle | Upload, download, soft removal with reason. |
| S-06 | Search, filter, sort, pagination | Applied to the My Tickets list. |
| S-07 | Ownership protection | Server-side enforcement that a requester can only read their own tickets. |
| S-08 | Change Requester | A control in the application shell that switches the active requester and reloads all requester-scoped data. |
| S-09 | Reference and seed data | Idempotent seed of categories, related systems and requester users (active and inactive). |

### 3.2 Excluded

| # | Item | Reason |
| --- | --- | --- |
| X-01 | Real login, auth tokens, passwords | Out of scope for this lab; replaced by the Development Requester selector. |
| X-02 | IT Staff workflow and dashboard | Belongs to a later sprint. |
| X-03 | Public comments, internal notes, actions taken | Staff-facing features. |
| X-04 | Ticket status lifecycle beyond `New` | No transitions are implemented this sprint. |
| X-05 | Hard deletion of attachments | Only soft removal is supported. |

---

## 4. Functional Requirements

| ID | Requirement | Description | Priority |
| --- | --- | --- | --- |
| FR-01 | Create Ticket | A requester can submit a new ticket with title, description, category, related system, priority and optional attachments. The backend persists it and returns the generated ticket number. | Must |
| FR-02 | Select Requester | The user picks a Development Requester from a dropdown of active users before using any other screen. The selection persists for the session and can be changed. | Must |
| FR-03 | My Tickets List | The requester sees only their own tickets, with search, filter, sort and pagination. | Must |
| FR-04 | Ticket Detail | The requester opens one of their tickets and sees all its fields read-only, plus its attachments. | Must |
| FR-05 | Attachment Upload / Download / Soft Removal | The requester attaches files at creation and from the detail page, downloads active files, and soft-removes a file with a reason. | Must |
| FR-06 | Change Requester | A "Change Requester" control is available in the header/shell on every screen. Switching the requester re-fetches all requester-scoped data (My Tickets, detail access) for the newly selected user. | Must |
| FR-07 | Resilient Create form | If the backend fails while a ticket is being submitted, the form shows an error state and keeps every value the user has already entered so the submission can be retried. | Must |
| FR-08 | Reference and seed data | Categories, related systems and requester users are seeded into the database by a script that can be run repeatedly without creating duplicates. | Must |

---

## 5. Business Rules

| ID | Rule |
| --- | --- |
| BR-01 | The backend generates a unique Ticket Number for every ticket. The client never supplies or edits it. |
| BR-02 | Every new ticket is created with status `New`. No other status is reachable in this sprint. |
| BR-03 | The Development Requester selector is a testing mechanism only. It is not authentication and must be clearly labelled as such in the UI. |
| BR-04 | Ownership: a requester may only read, list, or modify tickets and attachments belonging to the requester currently selected. Any other access is rejected by the server with `403`. |
| BR-05 | Allowed attachment types: JPG, PNG, WEBP, PDF. Any other type is rejected with `415`. |
| BR-06 | Maximum attachment size: 5 MB per file. Larger files are rejected with `413`. |
| BR-07 | Maximum of 5 attachments per ticket, counting active files only. |
| BR-08 | Attachments are soft-removed, never hard-deleted. A removal reason is required. |
| BR-09 | A soft-removed attachment can no longer be downloaded; the server rejects requests for its download URL. |
| BR-10 | A soft-removed attachment stays visible on the detail page, marked as removed, with its reason and removal timestamp. |
| BR-11 | Only requesters with `isActive = true` are returned by the requester API and shown in the selector. Inactive requesters are never selectable. |
| BR-12 | The seed script is idempotent: running it any number of times leaves exactly one row per seeded entity and never fails on re-run. |
| BR-13 | Changing the active requester discards the previous requester's loaded data; no ticket of the previous requester may remain visible after the switch. |

---

## 6. UI Specification Summary

Full details live in [ui-spec.md](ui-spec.md). Summary:

- **Theme:** Zen Green — primary `#006B3C`, secondary `#0B7A46`, pale `#EAF6EF`, page background `#F5F7F6`, surfaces `#FFFFFF`.
- **Layout:** fixed application header with the app name and the currently selected requester; content area on a neutral background with white cards.
- **Badges:** status badge (`New`) and priority badge on list rows and in the detail header.
- **Navigation:** Requester selection → My Tickets → Create Ticket / Ticket Detail. Any screen entered without a selected requester redirects to the selector.
- **Responsive:** table layout on desktop, stacked card list on mobile; breakpoints per the Responsive Breakpoints section of `ui-spec.md`.

---

## 7. Data Changes

PostgreSQL via Prisma. New and changed models:

### `RequesterUser`

| Field | Type | Notes |
| --- | --- | --- |
| id | String (uuid) | PK |
| name | String | Displayed in the selector |
| email | String | Unique |
| department | String? | _TBD_ |
| isActive | Boolean | Only active users appear in the selector |
| createdAt / updatedAt | DateTime | |

### `Ticket`

| Field | Type | Notes |
| --- | --- | --- |
| id | String (uuid) | PK |
| ticketNumber | String | Unique, server-generated (BR-01) |
| title | String | |
| description | String | |
| status | Enum | `New` only this sprint (BR-02) |
| priority | Enum | `Low` / `Medium` / `High` / _TBD_ |
| requesterId | String | FK → `RequesterUser.id` |
| categoryId | String | FK → `Category.id` |
| relatedSystemId | String? | FK → `RelatedSystem.id` |
| createdAt / updatedAt | DateTime | |

### `Attachment`

| Field | Type | Notes |
| --- | --- | --- |
| id | String (uuid) | PK |
| ticketId | String | FK → `Ticket.id` |
| fileName | String | Original file name |
| mimeType | String | Validated against BR-05 |
| sizeBytes | Int | Validated against BR-06 |
| storagePath | String | _TBD — storage location decision_ |
| isRemoved | Boolean | Soft-removal flag (BR-08) |
| removedReason | String? | Required when `isRemoved` is true |
| removedAt | DateTime? | |
| uploadedAt | DateTime | |

### `Category`

Existing model, reused. _Field changes: TBD._

### `RelatedSystem`

| Field | Type | Notes |
| --- | --- | --- |
| id | String (uuid) | PK |
| name | String | Unique |
| isActive | Boolean | _TBD_ |

### Seed data (idempotent)

| Entity | Minimum required | Notes |
| --- | --- | --- |
| `Category` | 4 categories | Reuses the Lab 1 seed set unless changed; _final list TBD_ |
| `RelatedSystem` | ≥ 6 systems | _list TBD_ |
| `RequesterUser` (active) | ≥ 4 users | Appear in the selector |
| `RequesterUser` (inactive) | ≥ 1 user | Must **not** appear in the selector (BR-11) |

The seed uses upsert-by-unique-key so it can be re-run safely (BR-12).

### Indexes

| Index | Purpose |
| --- | --- |
| `Ticket.ticketNumber` (unique) | Enforces BR-01 |
| `Ticket.requesterId` | My Tickets listing and ownership checks |
| `Ticket.createdAt` | Default sort order |
| `Attachment.ticketId` | Attachment listing |

---

## 8. API Contract

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/requesters` | — | `200` list of **active** requesters only (BR-11) | `500` |
| GET | `/api/categories` | — | `200` list of categories | `500` |
| GET | `/api/related-systems` | — | `200` list of related systems | `500` |
| POST | `/api/tickets` | ticket fields + requester id | `201` created ticket incl. `ticketNumber` | `400`, `403`, `500` |
| GET | `/api/tickets` | query: `requesterId`, `search`, `category`, `status`, `sort`, `page`, `pageSize` | `200` paginated list + page metadata | `400`, `403`, `500` |
| GET | `/api/tickets/:id` | — | `200` ticket detail with attachments | `403`, `404`, `500` |
| POST | `/api/tickets/:id/attachments` | multipart file | `201` attachment metadata | `400`, `403`, `404`, `413`, `415`, `500` |
| GET | `/api/attachments/:id/download` | — | `200` file stream | `403`, `404`, `500` |
| PATCH | `/api/attachments/:id/remove` | `{ reason }` | `200` updated attachment | `400`, `403`, `404`, `500` |

### Status code meanings

| Code | Meaning in this API |
| --- | --- |
| 200 | Request succeeded |
| 201 | Resource created |
| 400 | Validation failure (missing or invalid field, missing removal reason, attachment limit exceeded) |
| 403 | Ownership violation, or download of a removed attachment |
| 404 | Ticket or attachment not found |
| 413 | Attachment exceeds 5 MB |
| 415 | Unsupported attachment type |
| 500 | Unhandled server error |

_Exact request and response payload shapes: TBD._

---

## 9. Acceptance Criteria

| ID | Criterion |
| --- | --- |
| AC-01 | **Given** a requester is selected and the Create Ticket form is filled with valid data, **when** the form is submitted, **then** the ticket is persisted with status `New` and the UI shows the generated Ticket Number. |
| AC-02 | **Given** no requester has been selected, **when** any application screen is opened, **then** the user is redirected to the Development Requester selection screen; **and given** a requester is already selected, **when** the user switches to another requester via "Change Requester", **then** all requester-scoped data reloads for the new requester and none of the previous requester's data remains visible. |
| AC-03 | **Given** a requester is selected, **when** they request a ticket or attachment that belongs to another requester, **then** the server responds `403` and the UI shows an access-denied message. |
| AC-04 | **Given** a requester is selected, **when** My Tickets is opened, **then** only tickets owned by that requester are listed. |
| AC-05 | **Given** a ticket was just created, **when** its detail page is opened, **then** all ticket fields are shown read-only. |
| AC-06 | **Given** a file larger than 5 MB, **when** it is uploaded, **then** the server responds `413` and the UI shows a size error under the upload control. |
| AC-07 | **Given** a file whose type is not JPG, PNG, WEBP or PDF, **when** it is uploaded, **then** the server responds `415` and the UI shows a type error. |
| AC-08 | **Given** a ticket already has 5 active attachments, **when** a sixth is uploaded, **then** the upload is rejected and the UI explains the limit. |
| AC-09 | **Given** an active attachment, **when** the requester removes it with a reason, **then** it is marked removed with reason and timestamp, remains visible as removed, and is no longer downloadable. |
| AC-10 | **Given** the My Tickets list, **when** search, filter, sort or pagination is applied, **then** the list updates accordingly and stays scoped to the selected requester. |
| AC-11 | **Given** the app is viewed at mobile, tablet and desktop widths, **when** each screen is inspected, **then** the layout matches the responsive rules in `ui-spec.md` with no clipping or horizontal overflow. |
| AC-12 | **Given** the Create Ticket form has been filled in, **when** the backend fails during submit, **then** an error state is shown and every entered value is preserved so the user can retry without re-typing. |
| AC-13 | **Given** a seeded database, **when** the seed script is run again, **then** it completes successfully and creates no duplicate rows. |
| AC-14 | **Given** an inactive requester exists, **when** the selector is opened, **then** that requester is not listed. |
| AC-15 | **Given** a search or filter that matches nothing, **when** it is applied to My Tickets, **then** a no-results state is shown, distinct from the empty state shown when the requester has no tickets at all. |

---

## 10. Definition of Done

### 10.1 Product

- [ ] All functional requirements FR-01 … FR-08 implemented.
- [ ] All acceptance criteria AC-01 … AC-15 verified.
- [ ] All automated tests listed in [tests.md](tests.md) pass on `main`.
- [ ] Responsive behaviour verified at the three breakpoints.
- [ ] No console errors and no unhandled server errors on the happy path.
- [ ] Zen Green Theme applied per [ui-spec.md](ui-spec.md).
- [ ] Ownership rule enforced server-side, not only in the UI.

### 10.2 Course delivery

- [ ] Work delivered through a pull request from a feature branch.
- [ ] Pull request reviewed by an assigned reviewer.
- [ ] Evidence attached: screenshots, test run output, traceability matrix.
- [ ] Screenshot of the `docs/lab-02/` commit kept as evidence that the specification was written before any implementation code (Issue #1).
- [ ] Every Kanban issue (#1–#7) closed with its acceptance criteria met.
- [ ] All `docs/lab-02/` documents complete and committed.

---

## 11. Assumptions and Decisions

| ID | Assumption / Decision | Rationale |
| --- | --- | --- |
| AD-01 | Ticket Number format is `TKT-YYYY-XXXXXX`, where `YYYY` is the creation year and `XXXXXX` a zero-padded sequence. | Human-readable, sortable, and unique per BR-01. |
| AD-02 | The selected requester is kept client-side for the session and sent to the API with each request. | No auth this sprint; keeps the server stateless. |
| AD-03 | _TBD — attachment storage location_ | |
| AD-04 | _TBD — default page size for My Tickets_ | |
| AD-05 | _TBD — default sort order_ | |

---

## Appendix — GitHub Issue Traceability

Mapping between the Kanban issues and the requirements in this document.

| Issue | Title | Covers |
| --- | --- | --- |
| #1 | Sprint Specifications, Architecture & Test Planning | This document, `ui-spec.md`, `tests.md` |
| #2 | Database Schema & Idempotent Seed Data | FR-08, BR-11, BR-12, §7 Data Changes and Seed data, AC-13 |
| #3 | Development Requester Context & Simulated Login | FR-02, FR-06, BR-03, BR-11, BR-13, AC-02, AC-14 |
| #4 | Ticket Creation API & UI with Validation | FR-01, FR-07, BR-01, BR-02, AC-01, AC-12 |
| #5 | My Tickets List with Filtering, Search & Pagination | FR-03, BR-04, AC-03, AC-04, AC-10, AC-15 |
| #6 | Requester Ticket Detail & Soft Attachment Lifecycle | FR-04, FR-05, BR-04 … BR-10, AC-03, AC-05 … AC-09 |
| #7 | UI Refinement, Responsive Layout & End-to-End Tests | AC-11, `ui-spec.md` checklist, §5 of `tests.md`, `ai-use.md` |
