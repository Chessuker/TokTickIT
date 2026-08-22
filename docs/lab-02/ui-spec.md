# Lab 2 — UI Specification (Zen Green Theme)

Companion to [specification.md](specification.md). This document defines the visual language and screen-level behaviour of the Requester Ticketing MVP.

---

## 1. Color Tokens

| Token | Value | Used for |
| --- | --- | --- |
| `--zg-primary` | `#006B3C` | Application header background, primary button background |
| `--zg-secondary` | `#0B7A46` | Active tab underline, focus rings, links, primary button hover |
| `--zg-pale` | `#EAF6EF` | Selected table rows, success callouts, pale badges |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards, tables, modals |
| `--zg-border` | #D1D5DB | Card and input borders |
| `--zg-shadow` | 0 1px 3px rgba(0,0,0,0.1) | Card and modal elevation |
| `--zg-text` | #1F2937 | Body text |
| `--zg-text-muted` | #6B7280 | Helper text, timestamps, read-only values |
| `--zg-error` |#DC2626 | Validation errors, destructive confirmations |
| `--zg-warning` | #F59E0B | Warnings, e.g. the "not a real login" notice |

### Editable vs. read-only controls

| State | Appearance |
| --- | --- |
| Editable input | White surface, 1px `--zg-border`, focus ring in `--zg-secondary` |
| Read-only value | No input chrome; plain text on the card surface, label in `--zg-text-muted` |
| Disabled control | Muted background, muted text, no focus ring, `cursor: not-allowed` |

---

## 2. Component Rules

- Labels sit **above** their input, never inline or as placeholder-only.
- Required fields carry a red asterisk (`*`) directly after the label text.
- Validation errors appear **directly under the field they belong to**, in `--zg-error`, and the field border turns error-colored.
- Form-level errors (e.g. a failed submit) appear as a callout above the form actions.
- Buttons show a busy/submitting state: label swaps to a progress label, the button is disabled, and a spinner is shown.
- Primary action per screen is a single filled `--zg-primary` button; secondary actions are outlined or text buttons.
- Every interactive element has a visible focus ring in `--zg-secondary`.
- Badges: status and priority render as pill badges with sufficient contrast against `--zg-surface`.

| Badge | Value | Style |
| --- | --- | --- |
| Status | `New` | _TBD_ |
| Priority | `Low` / `Medium` / `High` | _TBD_ |

---

## 3. Screens

### 3.0 Application Shell (header)

| Element | Specification |
| --- | --- |
| Background | `--zg-primary`, full width, fixed at the top |
| App name | Left-aligned, on-primary text color |
| Current requester | Shows the name of the selected Development Requester |
| Change Requester | Button next to the requester name, available on **every** screen; returns to the selector and, once a new requester is chosen, clears and re-fetches all requester-scoped data (FR-06, BR-13) |
| Navigation | Links to My Tickets and Create Ticket; active item underlined in `--zg-secondary` |
| Mobile | Requester name and Change Requester collapse into a compact menu; no horizontal overflow |

### 3.1 Development Requester Selection

| Element | Specification |
| --- | --- |
| Heading | Names the screen and states its purpose |
| Warning callout | Amber; states clearly that this is **not** a real login and exists only for development/testing |
| Dropdown | Lists **active** requester users only; shows name (and department/email if available) |
| Continue button | Primary; disabled until a requester is chosen; navigates to My Tickets |
| Layout | Single centered card on `--zg-bg` |

### 3.2 Create Ticket

| Element | Specification |
| --- | --- |
| Field order | Title → Description → Category → Related System → Priority → Attachments |
| Required fields | _TBD — mark which fields are required_ |
| Dropdowns | Category and Related System populated from the API; placeholder option shown until chosen |
| Upload area | Dropzone with an explicit "Browse files" button; helper text lists allowed types (JPG, PNG, WEBP, PDF), size limit (5 MB) and file cap (5) |
| File preview list | One row per staged file: name, size, type icon, remove control |
| Actions | Primary "Create Ticket" with busy state; secondary "Cancel" returns to My Tickets |
| Success | Confirmation showing the generated Ticket Number, with a link to the ticket detail |
| Backend failure | Error callout above the form actions; **all entered values stay in the form** and the submit button returns to its idle state so the user can retry (FR-07, AC-12) |

### 3.3 My Tickets

| Element | Specification |
| --- | --- |
| Desktop (≥ 992 px) | Table: Ticket Number, Title, Category, Status, Priority, Created At, action to open detail |
| Mobile (< 768 px) | Card list; each card shows Ticket Number, Title, badges and Created At, and is tappable |
| Search bar | Free-text search across _TBD (title / ticket number / description)_ — maps to the `search` query parameter |
| Filters | Category and Status — map to the `category` and `status` query parameters |
| Sort | `sort` parameter; Created At descending by default, plus _TBD_ |
| Pagination | Page controls with current page, total pages, and page size; `page` / `pageSize` parameters; default page size _TBD_ |
| Empty state | Requester has no tickets at all: message plus a call to action to create the first ticket |
| No-results state | Search/filter matched nothing: message offering to clear the filters — visually distinct from the empty state (AC-15) |
| Selected row | Background `--zg-pale` |

### 3.4 Requester Ticket Detail (read-only)

| Element | Specification |
| --- | --- |
| Header | Ticket Number, Title, Status badge, Priority badge, Created At |
| Fields | All ticket fields rendered read-only — no inputs, no edit affordance |
| Attachment list — active | File name, size, uploaded at, Download action |
| Attachment list — removed | Rendered muted with a "Removed" marker, removal reason and removal timestamp; no Download action |
| Remove action | Opens a modal requiring a removal reason; confirm button is disabled until a reason is entered |
| Removal modal | Title, reason textarea (required), Cancel and Confirm; Confirm shows a busy state |
| Access denied | If the ticket does not belong to the selected requester, the screen shows an access-denied message instead of ticket data |

---

## 4. Responsive Breakpoints

| Breakpoint | Width | Behaviour |
| --- | --- | --- |
| Desktop | ≥ 992 px | Table layouts, multi-column forms, side-by-side filters |
| Tablet | 768 – 991 px | Condensed table or two-column form; filters wrap |
| Mobile | < 768 px | Single-column forms, card lists instead of tables, full-width buttons, stacked filters |

Rules that hold at every width: no horizontal page overflow; wide content (tables) scrolls inside its own container; tap targets at least _TBD_ px.

---

## 5. Visual Inspection Checklist

| # | Item | Desktop | Tablet | Mobile |
| --- | --- | --- | --- | --- |
| V-01 | Font family, sizes and weights match the theme | ☐ | ☐ | ☐ |
| V-02 | Consistent padding and spacing inside cards and tables | ☐ | ☐ | ☐ |
| V-03 | No horizontal overflow on the page body | ☐ | ☐ | ☐ |
| V-04 | No clipped or truncated text, badges or buttons | ☐ | ☐ | ☐ |
| V-05 | Focus ring visible on every interactive element | ☐ | ☐ | ☐ |
| V-06 | Every input has an accessible label | ☐ | ☐ | ☐ |
| V-07 | Color contrast sufficient for text and badges | ☐ | ☐ | ☐ |
| V-08 | Error messages appear under the correct field | ☐ | ☐ | ☐ |
| V-09 | Busy/submitting states visible on all submit buttons | ☐ | ☐ | ☐ |
| V-10 | Removed attachments visually distinct from active ones | ☐ | ☐ | ☐ |

_Screenshots recording this checklist are referenced in [tests.md](tests.md)._
