# Lab 2 — UI Specification (Zen Green Theme)

Companion to [specification.md](specification.md). This document defines the visual language and screen-level behaviour of the Requester Ticketing MVP; the data behind each screen is specified in [api-spec.md](api-spec.md).

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
| Status | `New` | Pill, `--zg-pale` fill, `--zg-primary` border, `#14532D` text |
| Priority | `Low` | Pill, `#EFF6FF` fill, `#93C5FD` border, `#1E40AF` text |
| Priority | `Medium` | Pill, `--zg-warning-bg` fill, `--zg-warning` border, `#92400E` text |
| Priority | `High` | Pill, `#FEF2F2` fill, `--zg-error` border, `#991B1B` text |

Priority is never encoded by colour alone — the level is written in the badge —
so the ordering survives a monochrome print and a red/green colour deficiency.

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
| Field order | Summary → Description → Category → Related System → Priority → Attachments |
| Required fields | Summary/Title, Description, Category, Related System and Requested Priority — each carries a red `*` after its label. Attachments are optional. |
| Dropdowns | Category and Related System populated from the API; placeholder option shown until chosen |
| Upload area | Dropzone with an explicit "Browse files" button; helper text lists allowed types (JPG, PNG, WEBP, PDF), size limit (5 MB) and file cap (5) |
| File preview list | One row per staged file: name, size, type icon, remove control |
| Actions | Primary "Create Ticket" with busy state; secondary "Cancel" returns to My Tickets |
| Success | Confirmation showing the generated Ticket Number, with a link to the ticket detail |
| Backend failure | Error callout above the form actions; **all entered values stay in the form** and the submit button returns to its idle state so the user can retry (FR-07, AC-12) |

### 3.3 My Tickets

| Element | Specification |
| --- | --- |
| Desktop (≥ 768 px) | Table: Ticket No., Created Date, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, Last Updated, and a Detail action. Fixed column layout so all ten columns fit the container; the table scrolls inside its own wrapper below 66 rem, the width at which every fixed column still holds its content |
| IT Priority / Ticket Owner | Rendered as an italic muted _Unassigned_ placeholder. Both are IT-triage fields with no column in the Lab 2 schema; an explicit placeholder keeps "not yet assigned" from reading as missing data |
| Mobile (< 768 px) | Card list; each card shows Ticket No., Status badge, Summary, Priority and Category, and the four dates/owner fields as a two-column definition list. The whole card is the tap target |
| Search bar | Free-text, case-insensitive, matched against `summary`, `description` and `ticketNumber` — maps to the `search` query parameter. Debounced 300 ms so typing does not fire a request per keystroke |
| Filters | Category and Status — map to the `category` and `status` query parameters. A "Clear Filters" button resets search, category and status together, and is disabled when none is active |
| Sort | `sort` parameter; Created At descending by default, plus Created At ascending, Ticket No. either way, and Priority either way (High-first for descending) |
| Pagination | Previous / Next, a window of at most five numbered page buttons, "Page _n_ of _m_", and a page-size selector of 10 / 20 / 50; `page` / `pageSize` parameters, default page size 10. Any change to search, filter, sort or page size returns to page 1 |
| Empty state | Requester has no tickets at all: message plus a call to action to create the first ticket |
| No-results state | Search/filter matched nothing: message offering to clear the filters — visually distinct from the empty state (AC-15) |
| Selected row | Background `--zg-pale` |

### 3.4 Requester Ticket Detail (read-only)

| Element | Specification |
| --- | --- |
| Header | Ticket Number, Summary, Status badge, Priority badge, Created At |
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

Rules that hold at every width: no horizontal page overflow; wide content (tables) scrolls inside its own container.

**Tap targets — resolved (Issue #7): 44 px minimum below 768 px.** WCAG 2.2 AA (2.5.8) sets the floor at 24 px, which every control already cleared, but 44 px is the size a thumb hits reliably and it is what the mobile layout now enforces on buttons, page numbers and the header toggle. Above 768 px the denser 28–38 px controls stay: a pointer does not need the slack, and inflating the table's Detail action would cost a row of vertical space on every screen to solve a problem that only exists on touch.

---

## 5. Visual Inspection Checklist

Checked on 2026-09-05 against the running stack at 1280 px, 820 px and 375 px.
Where a row could be measured rather than eyeballed it was: the evidence column
names what was actually read off the page.

| # | Item | Desktop | Tablet | Mobile | Evidence |
| --- | --- | --- | --- | --- | --- |
| V-01 | Font family, sizes and weights match the theme | ☑ | ☑ | ☑ | One `--zg-font` stack on `body`; no component overrides the family |
| V-02 | Consistent padding and spacing inside cards and tables | ☑ | ☑ | ☑ | Card and cell padding come from `.zg-card` / `.zg-table td`, not from per-screen rules |
| V-03 | No horizontal overflow on the page body | ☑ | ☑ | ☑ | `document.body.scrollWidth` equals the viewport width on all three screens at all three widths |
| V-04 | No clipped or truncated text, badges or buttons | ☑ | ☑ | ☑ | Every leaf element compared `scrollWidth` against `clientWidth`; the only hit is the intentionally `visually-hidden` file input |
| V-05 | Focus ring visible on every interactive element | ☑ | ☑ | ☑ | `.zg-app :focus-visible` computes to `2px solid rgb(11, 122, 70)` = `--zg-secondary` |
| V-06 | Every input has an accessible label | ☑ | ☑ | ☑ | Every `input` / `select` / `textarea` has a `label[for]`, a wrapping label, or `aria-label(ledby)`; zero unlabelled |
| V-07 | Color contrast sufficient for text and badges | ☑ | ☑ | ☑ | Lowest measured ratio 4.83:1 (muted dates and the _Unassigned_ placeholder), above the 4.5:1 AA floor; badges 6.84 – 8.21:1 |
| V-08 | Error messages appear under the correct field | ☑ | ☑ | ☑ | Each `.zg-field-error` sits below its own control's bounding box, in `#DC2626`, with the control's border matching |
| V-09 | Busy/submitting states visible on all submit buttons | ☑ | ☑ | ☑ | Create Ticket, Confirm removal and Download each swap label, disable, and show a spinner (UI-08, UI-06) |
| V-10 | Removed attachments visually distinct from active ones | ☑ | ☑ | ☑ | Muted surface, dashed border, struck-through name, `Removed` badge, no Download control |

Two things this pass changed rather than confirmed:

- **Tablet.** The Create Ticket form now lays its short fields out two to a row from 768 px, with Summary, Description and the upload area still spanning the full width. The header keeps its nav and requester block on one line at that width by dropping the small "Requester" caption, whose meaning the name below it already carries.
- **Table minimum width.** `.zg-table` is pinned to 66 rem, the width of the page container. Wider makes the desktop table scroll and hides the Detail action; narrower squeezes the percentage columns until a ticket number runs under the date beside it. Below 992 px the wrapper scrolls within that width, which is the documented tablet behaviour.

_Screenshots recording this checklist are collected in [answer-part9-screenshots.md](answer-part9-screenshots.md); the run that produced them is recorded in [tests.md](tests.md)._
