# Lab 2 — REST API Specification

Companion to [specification.md](specification.md). That document owns the requirements (FR), business rules (BR), and acceptance criteria (AC) referenced here; this one owns the wire contract: paths, methods, parameters, request and response shapes, validation, pagination, ownership checks, and error behaviour.

---

## 1. Conventions

| Item | Decision |
| --- | --- |
| Base URL | `http://localhost:5000` in development (`VITE_API_URL` on the client) |
| Prefix | All endpoints live under `/api` |
| Request content type | `application/json`, except attachment upload which is `multipart/form-data` |
| Response content type | `application/json`, except attachment download which streams the stored file |
| Timestamps | ISO 8601 UTC strings, e.g. `2026-08-23T04:15:00.000Z` |
| Identifiers | UUID v4 strings |

### 1.1 Requester context

Lab 2 has no authentication (X-01). The selected Development Requester is passed as a request header on **every** requester-scoped endpoint:

```
X-Requester-Id: 6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2
```

**Decision:** a single header rather than a `requesterId` query parameter or body field. One mechanism means one place to enforce ownership (a middleware), the same rule applies to `GET`, `POST`, and `PATCH` alike, and the identifier never leaks into URLs, logs, or browser history. It also maps cleanly onto the `Authorization` header that replaces it in Lab 3.

| Situation | Response |
| --- | --- |
| Header missing or malformed on a requester-scoped endpoint | `400` `REQUESTER_REQUIRED` |
| Header names a requester that does not exist | `403` `FORBIDDEN` |
| Header names an inactive requester | `403` `FORBIDDEN` |

Reference-data endpoints (`/api/categories`, `/api/related-systems`, `/api/requesters`) do **not** require the header.

### 1.2 Error envelope

Every non-2xx response uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "fields": {
      "summary": "Summary must be between 5 and 150 characters.",
      "categoryId": "Category not found."
    }
  }
}
```

`fields` is present only for `VALIDATION_FAILED`. `message` is always safe to display to the end user.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | One or more fields failed validation |
| `REQUESTER_REQUIRED` | 400 | `X-Requester-Id` missing or malformed |
| `ATTACHMENT_LIMIT_REACHED` | 400 | Ticket already has 5 active attachments (BR-07) |
| `FORBIDDEN` | 403 | Ownership violation, unknown/inactive requester, or download of a removed attachment |
| `NOT_FOUND` | 404 | Ticket or attachment does not exist |
| `FILE_TOO_LARGE` | 413 | Attachment exceeds 5 MB (BR-06) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Attachment type not allowed (BR-05) |
| `INTERNAL_ERROR` | 500 | Unexpected server failure |

### 1.3 Safe errors

- `500` responses always return the generic message `"Something went wrong. Please try again."` and never expose stack traces, SQL, Prisma error text, file-system paths, or environment values.
- The full error is logged server-side with a correlation id; the same id is returned as `error.correlationId` so a report can be traced without leaking internals.
- Validation messages name the field and the rule, never the stored value of another requester's data.

### 1.4 Missing resource vs. forbidden

| Case | Response | Why |
| --- | --- | --- |
| Id does not exist at all | `404 NOT_FOUND` | Nothing to protect |
| Id exists but belongs to another requester | `403 FORBIDDEN` | AC-03 requires an explicit access-denied signal |

This distinction confirms the existence of another requester's ticket to a caller who guesses its id. That is accepted for Lab 2: the selector is an open testing mechanism with no secrets behind it, and AC-03 is graded on the `403`. When real authentication arrives in Lab 3 this must be revisited — the usual fix is to answer `404` in both cases.

---

## 2. Resource Shapes

### Requester

```json
{
  "id": "6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2",
  "name": "Jennifer Anderson",
  "email": "jennifer.anderson@kmutt.ac.th",
  "department": "Registrar"
}
```

`isActive` is never returned: the API only ever exposes active requesters (BR-11).

### Category

```json
{ "id": "…", "name": "Network", "description": "Connectivity, Wi-Fi, VPN, and network performance." }
```

### RelatedSystem

```json
{ "id": "…", "name": "Campus Wi-Fi" }
```

### TicketListItem

```json
{
  "id": "…",
  "ticketNumber": "TKT-2026-000042",
  "summary": "Laptop battery drains quickly",
  "status": "New",
  "priority": "Medium",
  "category": { "id": "…", "name": "Hardware" },
  "relatedSystem": { "id": "…", "name": "Corporate Laptop" },
  "attachmentCount": 2,
  "createdAt": "2026-08-23T04:15:00.000Z"
}
```

`relatedSystem` is `null` when the ticket has none. `attachmentCount` counts **active** attachments only.

### TicketDetail

`TicketListItem` plus:

```json
{
  "description": "The battery drops from 100% to 20% within an hour…",
  "requester": { "id": "…", "name": "Jennifer Anderson", "email": "…", "department": "Registrar" },
  "updatedAt": "2026-08-23T04:15:00.000Z",
  "attachments": [ /* Attachment[] — active first, then removed */ ]
}
```

### Attachment

```json
{
  "id": "…",
  "fileName": "battery-report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 184320,
  "uploadedAt": "2026-08-23T04:15:00.000Z",
  "isRemoved": false,
  "removedReason": null,
  "removedAt": null,
  "downloadUrl": "/api/attachments/…/download"
}
```

For a removed attachment, `isRemoved` is `true`, `removedReason` and `removedAt` are populated, and `downloadUrl` is `null` — the metadata stays visible but the file is unreachable (BR-09, BR-10).

---

## 3. Endpoints

### 3.1 `GET /api/requesters`

Retrieve active Development Requesters for the selector.

| | |
| --- | --- |
| Requester header | Not required |
| Parameters | None |
| Success | `200` — `{ "data": Requester[] }`, sorted by `name` ascending |
| Errors | `500` |

Only rows with `isActive = true` are returned (BR-11, AC-14). An empty list is a valid `200`; the UI shows a "no active requesters" state rather than an error.

---

### 3.2 `GET /api/categories`

| | |
| --- | --- |
| Requester header | Not required |
| Parameters | None |
| Success | `200` — `{ "data": Category[] }`, sorted by `name` ascending |
| Errors | `500` |

Active categories only.

---

### 3.3 `GET /api/related-systems`

| | |
| --- | --- |
| Requester header | Not required |
| Parameters | None |
| Success | `200` — `{ "data": RelatedSystem[] }`, sorted by `name` ascending |
| Errors | `500` |

Active related systems only.

---

### 3.4 `POST /api/tickets`

Create one validated ticket for the selected requester (FR-01, AC-01).

**Request**

```json
{
  "summary": "Laptop battery drains quickly",
  "description": "The battery drops from 100% to 20% within an hour of unplugging.",
  "categoryId": "…",
  "relatedSystemId": "…",
  "priority": "Medium"
}
```

`requesterId` is **not** in the body — it comes from `X-Requester-Id`, so a client cannot create a ticket on someone else's behalf.

**Validation**

| Field | Rules |
| --- | --- |
| `summary` | Required. Trimmed. 5–150 characters after trimming. |
| `description` | Required. Trimmed. 10–5000 characters after trimming. |
| `categoryId` | Required. Must reference an existing active category. |
| `relatedSystemId` | Required. Must reference an existing active related system. |
| `priority` | Required. One of `Low`, `Medium`, `High`. |

Unknown body fields are ignored. `status` and `ticketNumber` are rejected if supplied — they are server-owned (BR-01, BR-02).

**`relatedSystemId` is required on create.** An earlier draft of this table made it optional. Issue #4 marks the field
with a red asterisk alongside the other four, and a ticket that names no system is materially harder to route, so the
create contract requires it. The column stays nullable in the schema — that is a later-sprint concern (a system can be
retired and the foreign key is `SetNull`), not a licence to omit it here.

**Success** — `201`, body is the created `TicketDetail` with `attachments: []`.

The ticket number is generated server-side as `TKT-YYYY-XXXXXX` inside the same transaction as the insert, with the unique constraint on `ticketNumber` as the final guard against a concurrent collision.

**Errors** — `400 VALIDATION_FAILED`, `400 REQUESTER_REQUIRED`, `403 FORBIDDEN`, `500`.

Attachments are uploaded separately (§3.7) after the ticket exists, so a failing upload never loses a valid ticket. If the ticket is created but a subsequent upload fails, the ticket stands and the UI reports which files did not attach — the compensation strategy is "keep the ticket, report the files", not a rollback.

---

### 3.5 `GET /api/tickets`

List the selected requester's tickets (FR-03, AC-04, AC-10).

| | |
| --- | --- |
| Requester header | Required |
| Success | `200` — paginated envelope below |
| Errors | `400`, `403`, `500` |

**Query parameters**

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `search` | string | — | Trimmed; case-insensitive partial match against `summary`, `description`, and `ticketNumber`. Ignored when empty after trimming. Max 150 characters. |
| `category` | uuid | — | Filters by `categoryId`. Must be a well-formed uuid. |
| `status` | enum | — | One of the `TicketStatus` values. Only `New` exists this sprint (X-04). |
| `sort` | string | `createdAt:desc` | One of `createdAt:desc`, `createdAt:asc`, `ticketNumber:desc`, `ticketNumber:asc`, `priority:desc`, `priority:asc`. |
| `page` | integer | `1` | ≥ 1. |
| `pageSize` | integer | `10` | One of `10`, `20`, `50`. |

- **Secondary sort:** every sort is tie-broken by `id` ascending, so pagination is stable and no row can appear on two pages.
- **Priority ordering:** `priority:desc` means `High → Medium → Low`, not alphabetical.
- **Invalid parameters** are rejected with `400 VALIDATION_FAILED` naming the offending parameter — they are never silently ignored, because a silently dropped filter shows the requester the wrong result set and looks like a data bug.
- **Out-of-range page:** a `page` beyond the last one returns `200` with `data: []` and the real `totalItems`, not a `404`.
- **Ownership** is applied before every filter: the query is always scoped to `X-Requester-Id` (BR-04). No parameter can widen it.

**Response**

```json
{
  "data": [ /* TicketListItem[] */ ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 34,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

The UI distinguishes two zero-result cases (AC-15) from this response: `totalItems === 0` **with** no active search/filter is the empty state; `totalItems === 0` **with** an active search/filter is the no-results state.

---

### 3.6 `GET /api/tickets/:id`

Retrieve one owned ticket (FR-04, AC-05).

| | |
| --- | --- |
| Requester header | Required |
| Success | `200` — `TicketDetail`, attachments ordered active-first then by `uploadedAt` descending |
| Errors | `400 REQUESTER_REQUIRED`, `403 FORBIDDEN` (owned by someone else), `404 NOT_FOUND`, `500` |

Read-only: there is no `PATCH`/`PUT` on a ticket this sprint.

---

### 3.7 `POST /api/tickets/:id/attachments`

Upload one attachment to an owned ticket (FR-05).

| | |
| --- | --- |
| Requester header | Required |
| Content type | `multipart/form-data` |
| Field | `file` — exactly one file per request |

**Validation** (checked in this order so the most specific error wins)

| Check | Failure |
| --- | --- |
| Ticket exists | `404 NOT_FOUND` |
| Ticket belongs to the requester | `403 FORBIDDEN` |
| File present | `400 VALIDATION_FAILED` |
| MIME type in `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | `415 UNSUPPORTED_MEDIA_TYPE` (AC-07) |
| Size ≤ 5 MB (5 × 1024 × 1024 bytes) | `413 FILE_TOO_LARGE` (AC-06) |
| Ticket has < 5 **active** attachments | `400 ATTACHMENT_LIMIT_REACHED` (AC-08) |

- The type check uses the sniffed content type, not the client-supplied extension — a `.pdf` rename of an executable is rejected.
- The size limit is enforced by the upload middleware so an oversized body is refused while streaming, not after being buffered.
- Soft-removed attachments do **not** count toward the limit of five.
- The original `fileName` is stored for display but never used as a path. Files are written under a generated uuid name, so `../` and reserved Windows names cannot escape the storage directory.

**Success** — `201`, body is the created `Attachment`.

**Errors** — `400`, `403`, `404`, `413`, `415`, `500`.

---

### 3.8 `GET /api/attachments/:id`

Retrieve attachment metadata without downloading the file.

| | |
| --- | --- |
| Requester header | Required |
| Success | `200` — `Attachment` |
| Errors | `400`, `403`, `404`, `500` |

Metadata is returned for removed attachments too (BR-10) — with `downloadUrl: null`.

---

### 3.9 `GET /api/attachments/:id/download`

Download an active attachment.

| | |
| --- | --- |
| Requester header | Required |
| Success | `200` — file stream with `Content-Type` set to the stored `mimeType`, `Content-Length`, and `Content-Disposition: attachment; filename="…"` using the original file name |
| Errors | `400`, `403`, `404`, `500` |

| Case | Response |
| --- | --- |
| Attachment does not exist | `404 NOT_FOUND` |
| Attachment belongs to another requester's ticket | `403 FORBIDDEN` |
| Attachment is soft-removed | `403 FORBIDDEN` (AC-09, BR-09) |
| Row exists but the stored file is missing on disk | `404 NOT_FOUND`, logged as an integrity error |

A removed attachment answers `403` rather than `404` because the resource genuinely exists and the requester can see its metadata — the refusal is about state, not existence.

---

### 3.10 `PATCH /api/attachments/:id/remove`

Soft-remove an attachment (FR-05, AC-09, BR-08).

**Request**

```json
{ "reason": "Uploaded the wrong screenshot" }
```

**Validation**

| Field | Rules |
| --- | --- |
| `reason` | Required. Trimmed. 3–500 characters after trimming. |

| Check | Failure |
| --- | --- |
| Attachment exists | `404 NOT_FOUND` |
| Attachment's ticket belongs to the requester | `403 FORBIDDEN` |
| Reason valid | `400 VALIDATION_FAILED` |
| Attachment not already removed | `400 VALIDATION_FAILED` — removal is not repeatable |

**Effect** — sets `isRemoved = true`, `removedReason`, and `removedAt = now()`. The row and the stored file are never deleted; only the requester who owns the ticket may remove its attachments.

**Success** — `200`, body is the updated `Attachment` with `downloadUrl: null`.

**Errors** — `400`, `403`, `404`, `500`.

---

## 4. Capability Coverage

Mapping to the ten capabilities the lab sheet requires.

| # | Required capability | Endpoint |
| --- | --- | --- |
| 1 | Retrieve active Categories | `GET /api/categories` |
| 2 | Retrieve active Related Systems | `GET /api/related-systems` |
| 3 | Retrieve active Development Requesters | `GET /api/requesters` |
| 4 | Create a Ticket | `POST /api/tickets` |
| 5 | Retrieve the selected Requester's Tickets | `GET /api/tickets` |
| 6 | Retrieve one owned Ticket | `GET /api/tickets/:id` |
| 7 | Upload an Attachment | `POST /api/tickets/:id/attachments` |
| 8 | Retrieve Attachment metadata | `GET /api/attachments/:id` |
| 9 | Download an active Attachment | `GET /api/attachments/:id/download` |
| 10 | Soft-remove an Attachment | `PATCH /api/attachments/:id/remove` |

---

## 5. Test Coverage

Planned tests for this contract are listed in [tests.md](tests.md).

| Endpoint | Tests |
| --- | --- |
| `GET /api/requesters` | API-12 |
| `POST /api/tickets` | API-01, API-02, API-03 |
| `GET /api/tickets` | API-04, API-05, API-06, API-13 |
| `GET /api/tickets/:id` | API-05 |
| `POST /api/tickets/:id/attachments` | API-07, API-08, API-09 |
| `GET /api/attachments/:id/download` | API-11 |
| `PATCH /api/attachments/:id/remove` | API-10, API-14 |

---

## 6. Open Decisions

| ID | Decision | Status |
| --- | --- | --- |
| API-D-01 | Attachment storage location — local disk under `server/uploads/` vs. object storage | _TBD_ |
| API-D-02 | Whether `search` also matches the category or related-system name | _TBD_ |
| API-D-03 | Rate limiting on upload | Out of scope for Lab 2 |
| API-D-04 | Response caching headers for reference data | _TBD_ |
