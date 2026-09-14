# Lab 3 — UI Specification (Zen Green Theme)

Companion to [specification.md](specification.md). Extends the [Lab 2 UI spec](../lab-02/ui-spec.md): its tokens, component rules, editable/read-only styling, breakpoints and tap-target rule all stay in force. This document adds the badges, shell changes and five new screens Lab 3 needs, and re-runs the visual checklist. Data behind each screen is in [api-spec.md](api-spec.md).

---

## 1. Color Tokens

No new tokens. Lab 3 reuses `--zg-primary`, `--zg-secondary`, `--zg-pale`, `--zg-bg`, `--zg-surface`, `--zg-border`, `--zg-text`, `--zg-text-muted`, `--zg-error`, `--zg-warning`, `--zg-warning-bg`. One new semantic use: `--zg-warning` / `--zg-warning-bg` mark **Internal Notes** so private content is amber wherever it appears (§2).

### Editable vs. read-only controls

Unchanged. Lab 3 relies on this distinction heavily on the IT Staff Ticket Detail: the Requester-owned fields (summary, description, category, related system, requested priority, requester) are read-only values with muted labels; the operational fields (owner, IT priority, status) are real `select` controls with input chrome. A user must be able to tell at a glance which four things they can change.

---

## 2. Component Rules

All Lab 2 rules apply (labels above inputs, asterisk on required, errors under the field, form-level callout above actions, busy state on submit, one primary button per screen, focus ring in `--zg-secondary`, level written inside every badge).

### Badges

| Badge | Class | Values | Style |
| --- | --- | --- | --- |
| Status | `.zg-badge-status-{new,open,in-progress,waiting,resolved,closed,reopened,cancelled}` | the eight `TicketStatus` values, shown as "New", "Open", "In Progress", "Waiting for Requester", "Resolved", "Closed", "Reopened", "Cancelled" | New: pale fill / primary border (Lab 2). Open: `#EFF6FF` / `#93C5FD` / `#1E40AF`. In Progress: `--zg-warning-bg` / `--zg-warning` / `#92400E`. Waiting for Requester: `#F5F3FF` / `#C4B5FD` / `#5B21B6`. Resolved: `--zg-pale` / `--zg-secondary` / `#14532D`. Closed: `#F3F4F6` / `#9CA3AF` / `#374151`. Reopened: `#FFF7ED` / `#FDBA74` / `#9A3412`. Cancelled: `#F3F4F6` / `#D1D5DB` / `#6B7280` with strike-through label |
| Requested Priority | `.zg-badge-priority-{low,medium,high}` | Low / Medium / High | Unchanged from Lab 2 |
| IT Priority | `.zg-badge-it-priority-{low,medium,high}` | Low / Medium / High | Same fills as Requested Priority, plus a leading "IT" prefix in the label ("IT High") so the two columns are never confused when they differ |
| Role | `.zg-badge-role-{requester,it-staff,administrator}` | Requester / IT Staff / Administrator | Requester: `#F3F4F6` / `#9CA3AF` / `#374151`. IT Staff: `#EFF6FF` / `#93C5FD` / `#1E40AF`. Administrator: `--zg-pale` / `--zg-primary` / `#14532D` |
| Account status | `.zg-badge-active`, `.zg-badge-inactive` | Active / Inactive | Active: `--zg-pale` / `--zg-secondary`. Inactive: `#FEF2F2` / `--zg-error` / `#991B1B` |
| Owner | `.zg-owner` / `.zg-owner-unassigned` | name, or italic muted _Unassigned_ | Lab 2 `NotAssigned` placeholder, now shared |
| Requester resolution indicator | `.zg-badge-requester-resolved` | "Requester reports resolved" | `--zg-pale` fill, dashed `--zg-secondary` border, check icon; shown in the staff detail header and as an icon in the queue row |

Badge components are extracted once into `client/src/components/Badges.tsx` (`StatusBadge`, `PriorityBadge`, `ItPriorityBadge`, `RoleBadge`, `ActiveBadge`, `OwnerName`) and used by every screen; the Lab 2 copies in `MyTickets.tsx` and `TicketDetail.tsx` are removed.

### Public vs Internal (BR-04, handout §8.4)

| | Public Comments | Internal Notes |
| --- | --- | --- |
| Panel heading | "Public Comments" with a speech-bubble icon | "Internal Notes" with a lock icon and an amber "Internal — not visible to the requester" caption |
| Entry style | White card, `--zg-border` left border | `--zg-warning-bg` card, 4 px `--zg-warning` left border |
| Composer | Label "Add public comment"; placeholder "Reply to the requester…" | Label "Add internal note"; placeholder "Private note for IT Staff…"; amber border on the textarea |
| Submit button | Primary "Post Comment" | Outlined amber "Add Internal Note" |
| Body rendering | Text node, `white-space: pre-wrap`, never HTML | Same |

The two composers are never on screen at the same time (they live in separate tabs), so a note cannot be typed into the wrong box.

### Confirmation dialog

Reuses `.zg-modal`. Title names the action ("Mark as Resolved?", "Cancel this ticket?"), one sentence of consequence, Cancel (secondary) and Confirm (primary; `--zg-error` fill for Cancel-ticket and Deactivate-user). Confirm shows a busy state; the dialog stays open on failure and shows the error inside it.

### Feedback states (handout §8.6)

Every screen below implements the states from this table where the row says so:

| State | Presentation |
| --- | --- |
| Loading | `.zg-spinner` centred in the card/table area with "Loading…" text; controls disabled |
| Saving | Button busy state (label swap + spinner), form disabled |
| Success | Green `.zg-callout-success` for 4 s, or inline change of the data (badge/list updates) |
| Validation | Field-level `.zg-field-error` under the control; form-level callout if the server returned no `fields` |
| Empty | Illustration-free message + primary call to action |
| No-results | Message "No tickets match your search or filters" + "Clear filters" button; visually distinct from Empty |
| Forbidden | `.zg-state-denied`: lock icon, "You don't have access to this page", link to the role's home |
| Not found | `.zg-state-denied` variant: "This ticket/user could not be found", link back |
| Conflict | Amber `.zg-callout-warning` with the server message, inline where the action was taken; the control reverts to its previous value |
| Safe failure | Red `.zg-callout-error` "Something went wrong. Please try again." + Retry; entered values preserved |

---

## 3. Screens

Modes per screen are listed as **view / create / edit** where the screen has them.

### 3.0 Application Shell (header) — all roles

| Element | Specification |
| --- | --- |
| Background | `--zg-primary`, full width, sticky top (unchanged) |
| App name | Left, on-primary; links to the role's home |
| Navigation | Requester: My Tickets, Create Ticket. IT Staff: Queue. Administrator: Users, Queue. Only the current role's links render; active item underlined in `--zg-secondary` |
| Profile menu | Right: avatar initials, user name, role badge (`RoleBadge`, on-primary outline variant), chevron. Opens a menu with "Change password" and "Log out" |
| Log out | Calls `POST /api/auth/logout`, clears client state, navigates to `/login` with `replace`; the browser Back button lands on `/login` again because every guarded route re-checks `/api/auth/me` |
| Removed | The Development Requester block and the Change Requester button (FR-05) |
| Mobile | Nav collapses into a hamburger; profile menu becomes a full-width sheet with name, role badge and the two actions; all targets ≥ 44 px |
| Role home | Requester → `/tickets`; IT Staff → `/staff/queue`; Administrator → `/admin/users` |
| Route guards | `RequireAuth` redirects unauthenticated users to `/login?from=<path>`; a user with `mustChangePassword` is sent to `/change-password` from any route except `/login`, `/change-password`; `RequireAuth roles={[…]}` renders the Forbidden state when the role does not match (AC-11) |

### 3.1 Login (`/login`) — mode: create session

| Element | Specification |
| --- | --- |
| Layout | Single centred `.zg-card` (max 420 px) on `--zg-bg`; app name and clock icon in a `--zg-primary` band at the top of the card (as the handout mockup) |
| Heading | "Sign in to your account" |
| Fields | Email address (type `email`, autocomplete `username`), Password (autocomplete `current-password`, show/hide toggle with `aria-pressed`) |
| Client validation | Email required and well-formed; password required. Shown under the field on submit, cleared on edit |
| Submit | Primary "Sign In", full width; busy state "Signing in…" |
| Invalid credentials (`401`) | Red callout above the button: "Invalid email or password. Please try again." Password field cleared, email kept, focus to password |
| Inactive account (`403 ACCOUNT_INACTIVE`) | Amber callout: "This account is inactive. Please contact an administrator." No further detail |
| Throttled (`429`) | Amber callout: "Too many failed attempts. Try again in a few minutes."; button disabled for 30 s |
| Safe failure | Red callout with Retry; values preserved |
| Success | If `mustChangePassword` → `/change-password`; else → `from` param if it belongs to the role, otherwise the role home |
| Already signed in | Visiting `/login` with a valid session redirects to the role home |
| Forgot password | Not offered (X-01); a short muted line says "Contact an administrator to reset your password." |

### 3.2 Change Password (`/change-password`) — mode: edit

| Element | Specification |
| --- | --- |
| Layout | Same centred card as Login |
| Heading | "Change Your Password"; sub-line "You must change your password to continue." when `mustChangePassword`, otherwise "Choose a new password." |
| Fields | Current (temporary) password · New password · Confirm new password; each with show/hide |
| Rules panel | Pale card listing the BR-08 rules; each rule gets a check mark live as the new password satisfies it (`aria-live="polite"`) |
| Client validation | All three required; new ≠ current; confirm = new; rules satisfied. Server `400` `fields` are mapped onto the same three fields |
| Submit | Primary "Continue" (forced mode) / "Save password" (voluntary); busy state |
| Success | Forced mode: navigate to the role home. Voluntary mode: success callout and stay |
| Shell | In forced mode the header shows only the app name and Log out — no navigation, because none of it is reachable (AC-02) |
| Cancel | Voluntary mode only: returns to the previous screen |

### 3.3 Requester Ticket Detail (`/tickets/:id`) — additions to Lab 2 §3.4

| Element | Specification |
| --- | --- |
| Header additions | `ItPriorityBadge`, owner name or _Unassigned_, and, once set, the "Requester reports resolved" indicator |
| "Problem appears resolved" | Secondary button in the header, shown while status ∉ {Resolved, Closed, Cancelled} and `requesterResolvedAt` is null. Opens the confirmation dialog ("Tell IT Staff this looks fixed?"). On success the button is replaced by the indicator with the timestamp (AC-15) |
| Public Comments panel | Below attachments. Composer (textarea, 2000-char counter, "Post Comment") then the list newest-first: avatar initials, author name, `RoleBadge`, relative time with full timestamp on hover, body. Empty: "No comments yet." |
| Validation | Empty/whitespace → "Comment cannot be empty." under the textarea; > 2000 → counter turns red and submit disabled |
| Not offered | Internal Notes, owner, IT priority, status controls — none render for a Requester, and the API refuses them anyway |
| Access denied / not found | Unchanged Lab 2 behaviour |

### 3.4 IT Staff Ticket Queue (`/staff/queue`) — mode: view

| Element | Specification |
| --- | --- |
| Toolbar | Search input (placeholder "Search by ticket number or summary…", debounced 300 ms) · "Filters" toggle revealing: Status (multi-select chips), IT Priority, Owner (Anyone / Me / Unassigned / each active IT Staff), Category · Sort select · "Clear filters" |
| Result line | "Showing 1 to 10 of 87 tickets" |
| Desktop table (≥ 992 px) | Columns in order: Ticket No. · Created · Summary · Category · Req. Priority · IT Priority · Status · Owner · Updated · Open. Sortable headers (Ticket No., Created, IT Priority, Status, Updated) show a sort icon; `aria-sort` set. Summary truncates to two lines with full text on hover/focus. Requester-resolved rows show the check icon before the status badge |
| Why these nine | Ticket No. and Summary identify the work; Created and Updated order it; Category routes it; the two priorities show what was asked vs what IT decided; Status and Owner say whether it is being handled and by whom. Requester name is left to the detail screen: the queue is about work, not people, and a tenth column pushes the table past the container |
| Tablet (768 – 991 px) | Table keeps all columns and scrolls inside its wrapper (Lab 2 rule) |
| Mobile (< 768 px) | Card per ticket: first line Ticket No. + Status badge; second line Summary (two lines max); third line IT Priority badge, Owner; footer Created / Updated. Whole card is the tap target |
| Open action | Table: "Open" text button; card: whole card. Navigates to `/staff/tickets/:id` |
| Pagination | Same component as My Tickets: Prev / Next, ≤ 5 numbered buttons, page-size 5 / 10 / 25 / 50, default 10; any filter change returns to page 1 |
| Ownership at a glance | Owner column shows the name, or _Unassigned_ in italic muted text; rows owned by the current user get a small "You" tag after the name |
| States | Loading (skeleton rows), Empty ("No tickets in the system yet."), No-results, Forbidden (Requester visiting the URL), Safe failure with Retry |
| Administrator | Same screen, read-only; the toolbar is identical and the Open action leads to the read-only detail |

### 3.5 IT Staff Ticket Detail (`/staff/tickets/:id`) — modes: view (Administrator), edit (IT Staff)

| Element | Specification |
| --- | --- |
| Breadcrumb | "Queue › Ticket Detail" and a "Back to Queue" outline button that preserves the queue's query string |
| Header | Ticket No., Summary, `StatusBadge`, `PriorityBadge` (requested), `ItPriorityBadge`, requester-resolved indicator |
| Read-only group | Ticket No., Category, Related System, Requester (name, email, department), Requested Priority, Summary, Description, Created, Updated — rendered as read-only values (§1) |
| Operational group (IT Staff) | Three controls on one row at desktop, stacked on mobile: **Ticket Owner** `select` (Unassigned + active IT Staff from `/api/staff/assignees`) with a "Claim" button beside it when the current user is not the owner; **IT Priority** `select`; **Current Status** `select` listing only `permittedTransitions` from the API plus the current value. Each control saves on change (optimistic, with busy indicator on that control) and reverts with an inline conflict callout on `409` |
| Confirmations | Status → Resolved / Closed / Cancelled and reassigning a ticket that already has a different owner open the confirmation dialog first |
| Owner required | Choosing In Progress or Resolved while unassigned is blocked client-side with the hint "Assign an owner first"; the server rule is the real guard (AC-22) |
| Tabs | Public Comments (count) · Internal Notes (count) · Attachments (count). Tab panels follow WAI-ARIA tabs (arrow-key navigation) |
| Public Comments tab | As §3.3, composer visible to IT Staff |
| Internal Notes tab | Amber panel per §2; composer visible to IT Staff only |
| Attachments tab | Lab 2 attachment list, read-only: Download on active files, removed files muted with reason; no upload area and no Remove control (AC-24) |
| Administrator view | Operational controls render as read-only values (owner name, IT priority badge, status badge); both composers hidden; a muted line "Administrators can view but not change tickets." |
| States | Loading, Not found (`404`), Forbidden (Requester), Conflict (inline, per control), Safe failure (per action, entered comment/note text preserved) |
| Mobile | Read-only group becomes a single-column definition list; operational controls stack full-width; tabs become a scrollable tab strip |

### 3.6 Administrator User Management (`/admin/users`) — modes: view list, create, edit

| Element | Specification |
| --- | --- |
| Layout | Desktop: two columns — list (60 %) and side panel (40 %). Tablet: list full width, panel as a modal sheet. Mobile: list as cards, panel as a full-screen sheet |
| Toolbar | Heading "Users" · primary "Create User" · Search (name or email, debounced) · Role filter select (All roles / Requester / IT Staff / Administrator) |
| List (desktop/tablet) | Table: Name · Email · Role (`RoleBadge`) · Status (`ActiveBadge`) · Edit. Sorted by name; no pagination (X-12) |
| List (mobile) | Card: Name, Email, Role badge, Status badge, Edit button |
| Row for the current user | Name suffixed with "(you)" |
| Create panel | Heading "Create New User"; fields Full Name*, Email Address*, Role* (select), Active (toggle, default Yes), Initial Password* (with show/hide and the BR-08 rules panel). Actions: primary "Save User", secondary "Cancel". Server `409` on email shows under the Email field |
| Edit panel | Heading "Edit User"; fields Full Name*, Email Address*, Role*, Active (toggle). Actions: "Save Changes", "Cancel". A separate "Set new initial password" section with one password field and an outlined "Set Initial Password" button; success callout "Password set — the user must change it at next login." |
| Deactivate | The Active toggle turned off then Save opens the confirmation dialog ("Deactivate this user? They will be signed out immediately."). For the current user the toggle is disabled with the hint "You cannot deactivate your own account." For the last active Administrator the toggle and the Role select are disabled with the hint "At least one active administrator is required." The server guard (`409`) is still shown inline if reached (AC-29) |
| No delete | No delete control anywhere (BR-27) |
| Not offered | Email invitation, "send reset email" checkbox, department, photo — the handout mockup's "Send password reset email" is deliberately absent (X-01) |
| States | Loading, Empty ("No users yet" cannot occur — the current Administrator always exists — so only No-results: "No users match."), Forbidden (non-Administrator), Not found (edit of a deleted-by-migration id), Validation, Conflict, Safe failure |

---

## 4. Responsive Breakpoints

Unchanged from Lab 2: Desktop ≥ 992 px, Tablet 768 – 991 px, Mobile < 768 px; no horizontal page overflow; wide tables scroll inside their wrapper; 44 px tap targets below 768 px.

Lab 3 additions:

| Screen | Tablet | Mobile |
| --- | --- | --- |
| Login / Change Password | Same centred card | Card fills width with 16 px gutters; keyboard does not cover the submit button (card scrolls) |
| Queue | Table scrolls in wrapper; filters wrap to two rows | Cards; filters in a collapsible sheet |
| Staff Ticket Detail | Read-only group two columns; operational controls one row | Everything single column; tabs scroll horizontally |
| Users | List full width; panel as modal sheet | Cards; panel full screen |
| Shell | Nav inline; profile shows initials + chevron | Hamburger + profile sheet |

---

## 5. Visual Inspection Checklist

To be checked at 1280 px, 820 px and 375 px against the running stack once Issues 2–6 are merged; evidence recorded in [tests.md](tests.md) §4 and `artifacts/lab-03/screenshots/`.

| # | Item | Desktop | Tablet | Mobile | Evidence |
| --- | --- | --- | --- | --- | --- |
| V-01 | Font family, sizes and weights match the theme on all new screens | ☐ | ☐ | ☐ | |
| V-02 | Consistent card/table padding; new screens reuse `.zg-card` / `.zg-table` | ☐ | ☐ | ☐ | |
| V-03 | No horizontal page overflow (`body.scrollWidth === innerWidth`) | ☐ | ☐ | ☐ | |
| V-04 | No clipped or truncated badges, buttons, or the nine queue columns | ☐ | ☐ | ☐ | |
| V-05 | Focus ring visible on every interactive element, including tabs and the profile menu | ☐ | ☐ | ☐ | |
| V-06 | Every input has an accessible label; password toggles have `aria-pressed` | ☐ | ☐ | ☐ | |
| V-07 | Contrast ≥ 4.5:1 for all new badge colours and the amber Internal Note panel | ☐ | ☐ | ☐ | |
| V-08 | Validation messages sit under the correct field on Login, Change Password, Create/Edit User, comment and note composers | ☐ | ☐ | ☐ | |
| V-09 | Busy state visible on Sign In, Continue, Post Comment, Add Internal Note, Save User, Set Initial Password, Confirm | ☐ | ☐ | ☐ | |
| V-10 | Role navigation: only the current role's links and destinations are rendered | ☐ | ☐ | ☐ | |
| V-11 | Editable vs read-only styling is unambiguous on the staff detail (three selects vs the rest) | ☐ | ☐ | ☐ | |
| V-12 | Public Comments and Internal Notes are visibly distinct (heading, colour, composer) | ☐ | ☐ | ☐ | |
| V-13 | Status, Requested Priority, IT Priority and Role badges are consistent across queue, detail, My Tickets and Users | ☐ | ☐ | ☐ | |
| V-14 | No overlap between the sticky header, profile menu, modal sheets and page content | ☐ | ☐ | ☐ | |
