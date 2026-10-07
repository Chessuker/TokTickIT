# Lab 4 — UI Specification (Zen Green Theme)

Companion to [specification.md](specification.md). Extends the [Lab 3 UI spec](../lab-03/ui-spec.md) and, through it, Lab 2. All tokens, component rules, badges, the Public-vs-Internal rule, the feedback-state table, breakpoints and the tap-target rule stay in force. This document adds what Lab 4 needs: dashboards, the Actions Taken area, the workflow and history additions, final-polish rules, and the visual checklist V-15 … V-20. Data behind each screen is in [api-spec.md](api-spec.md).

---

## 1. Tokens and Shared Components

### 1.1 Tokens

No new colour tokens. Lab 4 uses the existing `--zg-*` set. New semantic uses:

| Use | Token |
| --- | --- |
| Metric card value | `--zg-primary`, 2rem, weight 700, `font-variant-numeric: tabular-nums` |
| Metric card hover / focus | `--zg-pale` fill, `--zg-secondary` 2 px focus ring (L3 V-05 rule) |
| Actions Taken panel | White card, `--zg-secondary` 4 px left border. **Green, not amber**: amber stays reserved for Internal Notes (L3 §2) |
| Open follow-up | `--zg-warning-bg` / `--zg-warning` badge (something is still pending) |

### 1.2 New badges (added to `Badges.tsx`)

| Badge | Class | Label | Style |
| --- | --- | --- | --- |
| Follow-up Open | `.zg-badge-followup-open` | "Follow-up open" + clock icon | `--zg-warning-bg` / `--zg-warning` / `#92400E` |
| Follow-up Completed | `.zg-badge-followup-completed` | "Follow-up done" + check icon | `--zg-pale` / `--zg-secondary` / `#14532D` |
| Follow-up Cancelled | `.zg-badge-followup-cancelled` | "Follow-up cancelled" + strike-through | `#F3F4F6` / `#D1D5DB` / `#4B5563` (same as the Cancelled status, already measured ≥ 4.5:1) |
| Assignee inactive | `.zg-badge-inactive` (existing) | "Inactive" after the assignee name | L3 Account status badge |
| Shared with requester | `.zg-caption-shared` | "Visible to the requester" + eye icon | Muted caption under the Actions Taken heading |

Every badge carries its meaning in text and icon, not only in colour (V-17).

### 1.3 Metric card (`MetricCard`)

| Part | Rule |
| --- | --- |
| Element | One `<a>` (React Router `Link`) wrapping the whole card, so the whole card is the click and tap target (≥ 44 px) |
| Content | Label (muted, 0.875rem), value (§1.1), cue "View" with chevron. A zero value adds the caption "None right now" (BR-26) |
| Accessible name | `aria-label="{label}: {count} {noun}"`, e.g. "Waiting for you: 1 ticket", "My open follow-ups: 2 follow-ups across 2 tickets". Singular/plural is correct |
| Null metric | An Administrator's `mine` / `myFollowUps` is `null`, and the card is not rendered (no "N/A" card) |
| Loading | Skeleton block the size of the value; the label is visible so the layout does not jump |
| Group | Cards sit in a `<section aria-labelledby>` with a visually hidden heading ("Ticket counts") |

### 1.4 Dashboard list (`DashboardList`)

`.zg-card` with a heading, an optional "View all" link (to the matching list) and up to 5 rows. Row = ticket number (link) · summary (one line, truncated with full text in `title`) · `StatusBadge` · time formatted as `3 Oct 2026, 14:05` (Asia/Bangkok), with relative "2 h ago" shown as a `title`. Each row is one link. The empty list shows its own one-line message (§3.1, §3.2).

### 1.5 Date and time

One helper, `formatBangkok(iso)`, used everywhere a timestamp is shown (Lab 4 screens and, as part of the polish, the Lab 2/3 screens that formatted dates their own way). `datetime-local` inputs show Bangkok time; the helper `toUtcIso(local)` converts them before sending (AD-11).

---

## 2. Feedback States

The Lab 3 feedback table (L3 §2 "Feedback states") applies unchanged to every Lab 4 screen. Lab 4 adds:

| State | Presentation |
| --- | --- |
| Stale update (`409 STALE_UPDATE`) | Amber `.zg-callout-warning` inline where the action was taken: "Someone else changed this ticket (or action) after you opened it. Reload to see the latest version." Primary button **Reload** re-fetches; the user's typed text in an open form is kept and re-applied on top of the reloaded data. The changed control is not reverted silently |
| Locked (`409 TICKET_LOCKED`) | Not normally reachable, because the create control is hidden on a locked Ticket. If reached (another user resolved meanwhile), it is shown as the Conflict callout with the server message, and the panel switches to read-only |
| Resolution blocked | Not an error state: an informational `.zg-callout-info` under the status select (§3.4) |
| Duplicate submit | Every primary button goes busy and is disabled on first click until the request settles (L3 V-09, now applied to every form in the app) |
| Recoverable failure on a form | Values kept, error callout above the actions, focus moved to the callout (`tabindex=-1`) so screen-reader users hear it |

---

## 3. Screens

### 3.0 Application Shell — changes

| Element | Lab 4 |
| --- | --- |
| Navigation | Requester: **Dashboard**, My Tickets, Create Ticket. IT Staff: **Dashboard**, Queue. Administrator: **Dashboard**, Users, Queue. Active item underlined in `--zg-secondary` and `aria-current="page"` |
| Role home | `/dashboard` for all roles (BR-31). Login, the `Home` redirect and the "app name" link all go there. `from=` deep links keep working (L3 §3.1) |
| Areas | `/dashboard` is open to every role; the page itself picks Requester or Staff/Admin content (AD-09) |
| Leftovers removed | Any Lab 1/2 copy, unused routes, duplicate badge/date helpers, dead CSS selectors (FR-13) |

### 3.1 Requester Dashboard (`/dashboard`, Requester) — mode: view

| Element | Specification |
| --- | --- |
| Header | "Welcome, {first name}!" + muted "Here's the latest on your requests." · outline **Refresh** button (busy while reloading; keeps the old numbers visible until the new ones arrive) |
| Metric cards | Four, in this order: My open tickets · Waiting for you · Resolved · Closed (specification.md §5). "Waiting for you" > 0 gets a `--zg-warning` left border and the caption "Reply needed", so it stands out without relying on colour alone |
| Lists | **Needs your reply** (WaitingForRequester, 5) · **Recently updated** (5) · **Recently resolved** (5). Each row opens `/tickets/:id`. "View all" on Recently updated → `/tickets?sort=updatedAt:desc` |
| Quick actions | Card with **Create Ticket** (primary) and **View My Tickets** (secondary) |
| Empty (no Tickets at all, `totalTickets = 0`) | Cards and lists replaced by one empty panel: "You haven't raised any tickets yet." + primary **Create Ticket** |
| Empty lists | "Nothing needs your reply." · "No recent updates." · "Nothing resolved yet." |
| Loading | Skeleton cards + skeleton rows; Quick actions usable immediately |
| Failure | Safe-failure callout with **Retry** in place of cards and lists; Quick actions stay usable |
| Forbidden | Not reachable (the page renders the staff variant for staff); a direct API call by staff gets `403` (AC-21) |
| Not duplicating My Tickets | No search, filters, pagination or table here. Lists are capped at 5 and link out |

### 3.2 IT Staff / Administrator Dashboard (`/dashboard`, IT Staff or Administrator) — mode: view

| Element | Specification |
| --- | --- |
| Header | "Welcome back, {first name}!" + "Here's what's happening in the queue." · **Refresh** |
| Primary cards (row 1) | Unassigned · My open tickets · My open follow-ups ("across N tickets") · Requester reports resolved. Administrator: the two "My" cards are not rendered |
| By status (row 2) | Compact cards: New · Open · In Progress · Waiting · Reopened · Resolved, each with its `StatusBadge` as the label, so the colour and the text match the Queue |
| By IT Priority | Three compact cards: IT High · IT Medium · IT Low with `ItPriorityBadge` labels |
| Lists | **Urgent** (active, IT High, longest untouched first) · **Recently updated** · **My recent actions** (ticket number, description preview, action time, follow-up badge → `/staff/tickets/:id#actions`, which opens the Actions Taken tab) |
| Administrator extra | **Users** card: active Requesters / IT Staff / Administrators and inactive count, linking to `/admin/users` |
| Quick actions | **Open Queue** · **My Queue** (`/staff/queue?owner=me`) · **Unassigned** (`/staff/queue?owner=unassigned`). Administrator: **Open Queue** · **Users** |
| Empty | Each card shows 0 + "None right now"; lists: "No urgent tickets." · "No recent updates." · "You haven't recorded any actions yet." |
| Loading / failure | As §3.1 |
| Forbidden | A Requester never sees this variant; direct API → `403` |

### 3.3 Actions Taken — Staff Ticket Detail (`/staff/tickets/:id`, tab "Actions Taken")

Tabs become: **Actions Taken (n)** · Public Comments (n) · Internal Notes (n) · Attachments (n) · **History**. Actions Taken is the default tab, and `#actions` in the URL selects it.

| Element | Specification |
| --- | --- |
| Heading | "Actions Taken" + caption "Visible to the requester" (§1.2) + count + open follow-ups count when > 0 |
| Record button | Primary **Record action** (IT Staff and Administrator). Hidden on a locked Ticket (BR-09); then a muted line "This ticket is {status}. Reopen it to record more work." |
| **Create mode** | Inline card above the list (not a modal, so the list stays visible for reference). Fields in order: **Action Date/Time*** (`datetime-local`, defaults to now, Bangkok time) · **Action Description*** (textarea, counter /2000) · **Result*** (textarea, counter /1000) · **Follow-up required?** (switch, default off) → reveals **Follow-up Note*** (textarea, /1000) and **Assign follow-up to*** (select of active IT Staff from `/api/staff/assignees`, default = Ticket owner if any, else the current user when they are IT Staff) · **Attachment Notes** (input, /500, hint "Name the file in Attachments to look at, e.g. error-log.png"). **Performed by** shown read-only as "You ({name})". Actions: primary **Save action**, secondary **Cancel** (asks to discard if anything was typed) |
| Validation | Client mirrors BR-05/BR-06; server `fields` mapped to the same controls; message under each field; form keeps values on any error |
| Duplicate protection | `clientRequestId` generated when the form opens and reused for every retry of that form (BR-10); button busy on submit |
| List (desktop ≥ 992 px) | Table: **Date/Time** · **Description** (2 lines, expand on view) · **Result** (2 lines) · **Performed by** (name + "Owner" tag when the performer is the current Ticket owner) · **Follow-up** (badge + assignee name + "Inactive" badge if flagged) · row action **View**. BR-11 order; no client-side re-sorting |
| List (tablet / mobile) | Card per Action: date/time and performer on the first line, description, "Result:" paragraph, follow-up block, attachment notes with paperclip icon. Whole card opens view mode |
| **View mode** | Expanded card (desktop: row expands in place; mobile: card expands). All fields in full, plus "Created {time} by {performer}" and, if edited, "Edited {time} by {editor}". Buttons: **Edit**; if follow-up Open: **Mark follow-up done**, **Cancel follow-up** (both confirm). Read-only fields use the L2/L3 read-only style |
| **Edit mode** | Same form as create, prefilled; Performed by and created time shown read-only. The follow-up switch is disabled once on (hint: "To drop a follow-up, cancel it."). Follow-up note/assignee disabled once the follow-up is closed. Save sends `version` |
| Complete / cancel follow-up | Confirmation dialog: "Mark this follow-up as done?" / "Cancel this follow-up?" (red confirm), then a PATCH with `followUpStatus`. On success the badge changes and the gate hint (§3.4) updates |
| Stale edit | §2 Stale update; the typed edits stay in the form, **Reload** fetches the latest Action, and the user can re-apply and save |
| Administrator | Same controls as IT Staff (AD-02). The assignee select still lists only IT Staff |
| States | Loading (skeleton rows) · Empty: "No actions recorded yet." + **Record action** (or the locked line) · Safe failure with Retry · Not found / Forbidden as L3 §3.5 |

### 3.4 Workflow additions — Staff Ticket Detail operations card

| Element | Specification |
| --- | --- |
| Status select | Options = current status + `permittedTransitions` (server decides, as Lab 3) |
| Gate hint | When `resolutionGate.ok` is false and the Ticket is in a status from which Resolved is in the matrix: `.zg-callout-info` "Resolve is unavailable until:" followed by one bullet per `unmet` value: "an owner is assigned" · "at least one action is recorded since the ticket was reopened" (or "…is recorded" if never reopened) · "{n} open follow-up(s) are completed or cancelled" — each bullet links to the place to fix it (owner select / Actions Taken tab) |
| Confirmations | Lab 3 dialogs kept (Resolved, Closed, Cancelled). The Cancel dialog adds "{n} open follow-up(s) will be cancelled." when n > 0 (BR-16) |
| After success | Header `StatusBadge`, operations card, gate hint, tab counts and History refresh from the response and a history re-fetch, with no full page reload (AC-14) |
| Stale | `409 STALE_UPDATE` on status/owner/IT Priority: the select keeps the user's choice highlighted, and the §2 callout offers **Reload** (AC-17) |
| Requester-resolved | Lab 3 indicator kept in the header; on the operations card it also shows "Requester reports resolved on {date} — review the actions before resolving" |

### 3.5 History tab (Staff and Requester Ticket Detail)

| Element | Specification |
| --- | --- |
| Layout | Vertical timeline, oldest at top. First row "Created by {requester}" at Ticket `createdAt`. Then one row per change: `StatusBadge(from)` → `StatusBadge(to)` · {name} + `RoleBadge` · time |
| Legacy | When the Ticket predates Lab 4 and has no stored rows: muted line "Status history is recorded from Lab 4 onward." under the Created row |
| Read-only | No controls of any kind (BR-18) |
| Requester | Shown as a collapsible "Status history" section below "Work done by IT" (§3.6) |
| States | Loading, safe failure with Retry |

### 3.6 Requester Ticket Detail (`/tickets/:id`) — additions

| Element | Specification |
| --- | --- |
| Work done by IT | Card above Public Comments, heading "Work done by IT ({n})". Read-only list of Actions in the §3.3 mobile-card layout at every width: date/time, performer, description, result, follow-up badge and note ("Next step: …"), attachment notes. No buttons at all. Empty: "IT Staff haven't recorded any work yet." |
| Status history | §3.5, collapsed by default |
| Unchanged | Everything from L3 §3.3 ("Problem appears resolved", comments, attachments) |

### 3.7 My Tickets and Queue — drill-down support

| Screen | Change |
| --- | --- |
| My Tickets (`/tickets`) | Filters and sort now live in the URL (as the Lab 3 Queue already does), so a dashboard link opens it pre-filtered. The Status filter becomes multi-select chips (same component as the Queue). A filter set from a link shows in the chips and can be cleared with "Clear filters". The result line reads "Showing 1 to 3 of 3 tickets" (it must match the card, AC-20) |
| Queue (`/staff/queue`) | Two new filter chips that appear only when set from the URL: "My open follow-ups" (`followUp=mine`) and "Requester reports resolved" (`requesterResolved=true`), each removable. "Clear filters" removes them |

---

## 4. Responsive Breakpoints

Unchanged: Desktop ≥ 992 px, Tablet 768 – 991 px, Mobile < 768 px; no horizontal page overflow; wide tables scroll inside their wrapper; 44 px tap targets below 768 px.

| Screen | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Requester Dashboard | 4 cards in one row; lists in a 2-column grid (Needs reply + Recently updated left, Recently resolved + Quick actions right) | 2 × 2 cards; lists one column | Cards 2 × 2 (values stay large); everything else one column, Quick actions first |
| Staff Dashboard | Primary cards 4 in a row; status cards 6 in a row; priority cards 3 in a row; lists 2 columns | Primary 2 × 2; status 3 × 2; priority 3; lists one column | Primary 2 × 2; status 2 × 3; priority 3 in a row (compact); lists one column |
| Actions Taken | Table with expandable rows; create/edit form two columns (date + follow-up switch left, texts right) | Cards; form one column | Cards; form one column; sticky Save/Cancel bar at the bottom of the form so the keyboard does not hide it |
| History | Timeline with badges inline | Same | Badges wrap under the name; times on their own line |
| Tabs (5 now) | One row | One row, may scroll | Scrollable tab strip (L3 rule) with the active tab scrolled into view |

---

## 5. Visual and Accessibility Checklist

Lab 3's V-01 … V-14 are re-run on **every** screen (Lab 2, 3 and 4) as the final regression. V-15 … V-20 are new. Filled in by Issue #58 against the running stack on a freshly seeded database, at 1280 / 820 / 375 px. Every row names its evidence: an automated check in `e2e/lab-04/visual.spec.ts` (E2E-07), a component test, or screenshots under `artifacts/lab-04/screenshots/`.

| # | Item | Desktop | Tablet | Mobile | Evidence |
| --- | --- | --- | --- | --- | --- |
| V-01 | Font family, sizes, weights consistent across all screens | ☐ | ☐ | ☐ | |
| V-02 | Cards, tables, padding reuse `.zg-card` / `.zg-table`; no one-off styles | ☐ | ☐ | ☐ | |
| V-03 | No horizontal page overflow on any screen | ☐ | ☐ | ☐ | |
| V-04 | No clipped or truncated badges, buttons, metric values or table columns | ☐ | ☐ | ☐ | |
| V-05 | Visible focus ring on every interactive element, including metric cards and tabs | ☐ | ☐ | ☐ | |
| V-06 | Every input has an accessible label; switches have `role="switch"` + `aria-checked` | ☐ | ☐ | ☐ | |
| V-07 | Contrast ≥ 4.5:1 for all text and badges, including the new follow-up badges | ☐ | ☐ | ☐ | |
| V-08 | Validation messages under the correct field on every form (Action create/edit added) | ☐ | ☐ | ☐ | |
| V-09 | Busy state and single submission on every primary button | ☐ | ☐ | ☐ | |
| V-10 | Role navigation renders only the role's links; Dashboard first and marked current | ☐ | ☐ | ☐ | |
| V-11 | Editable vs read-only unambiguous (Action view vs edit mode; operations card) | ☐ | ☐ | ☐ | |
| V-12 | Public Comments, Internal Notes and Actions Taken visibly distinct (white / amber / green-bordered, captions) | ☐ | ☐ | ☐ | |
| V-13 | Badges consistent across Dashboard, Queue, My Tickets, both details, Users | ☐ | ☐ | ☐ | |
| V-14 | No overlap between sticky header, menus, dialogs, sticky form bar and content | ☐ | ☐ | ☐ | |
| V-15 | Every metric card is a single link whose accessible name has label + value; zero shows "None right now" | ☐ | ☐ | ☐ | |
| V-16 | Every card's drill-down list total equals the card value | ☐ | ☐ | ☐ | |
| V-17 | Status, follow-up, priority and role cues have text/icon as well as colour | ☐ | ☐ | ☐ | |
| V-18 | Dialogs trap focus, close on Escape, and return focus to the trigger | ☐ | ☐ | ☐ | |
| V-19 | No console errors or warnings on each role's happy path; no broken links (all `href`s resolve) | ☐ | ☐ | ☐ | |
| V-20 | No placeholder text, lorem ipsum, "TODO", debug output or obsolete Lab 1/2 UI anywhere | ☐ | ☐ | ☐ | |
