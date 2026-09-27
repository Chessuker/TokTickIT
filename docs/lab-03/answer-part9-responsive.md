# Answer Part 9 — Zen Green UI and Responsive Evidence

Link: [`docs/lab-03/ui-spec.md`](ui-spec.md) — rendered in full after this page. Its §5 is the **completed visual checklist** (V-01 … V-14): design consistency, role navigation, badges, editable vs read-only fields, validation placement, focus, clipping, overlap and horizontal overflow, each ticked at all three widths with the evidence named.

Every screenshot below was written by `CAPTURE=1 npx playwright test e2e/lab-03/visual.spec.ts` (E2E-07) on a freshly seeded database. The same spec runs without the flag in every test run and **asserts** what a screenshot can only show:

| Check | How it is measured |
| --- | --- |
| No horizontal page overflow (V-03) | `documentElement.scrollWidth ≤ innerWidth` on every screen at 1280, 820 and 375 px |
| Focus indicator on every control (V-05) | the first 25 tab stops on Login, Queue, staff detail and Users each draw an outline or focus shadow |
| Every input labelled; password toggles announce state (V-06) | each `input` / `select` / `textarea` has a label; each toggle has `aria-pressed` |
| Badge contrast ≥ 4.5 : 1 (V-07) | WCAG contrast computed for every badge on the queue (all eight statuses), staff detail, Internal Notes and Users |
| Role navigation (V-10) | each role's exact link list |
| Clean console (Definition of Done) | no console error or uncaught exception on each role's happy path |

This pass found and fixed three defects no earlier check had caught: the queue page scrolling sideways at 820 px, the mobile header sheet running off-screen, and the Cancelled badge at 4.39 : 1.

---

## 1. Login and Change Password

![Login — desktop 1280](../../artifacts/lab-03/screenshots/authentication/login-desktop.png)

| Login — tablet 820 | Login — mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/authentication/login-tablet.png) | ![](../../artifacts/lab-03/screenshots/authentication/login-mobile.png) |

![Change Password (forced) — desktop 1280](../../artifacts/lab-03/screenshots/authentication/change-password-desktop.png)

| Change Password — tablet 820 | Change Password — mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/authentication/change-password-tablet.png) | ![](../../artifacts/lab-03/screenshots/authentication/change-password-mobile.png) |

The mobile header collapses behind **Menu**; opened, navigation and the profile stack full-width under the bar:

| Mobile header sheet |
| --- |
| ![](../../artifacts/lab-03/screenshots/authentication/shell-mobile.png) |

## 2. IT Staff Ticket Queue

![Queue — desktop 1280, table](../../artifacts/lab-03/screenshots/staff-queue/queue-desktop.png)

| Tablet 820 — table scrolls in its wrapper | Mobile 375 — cards |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/staff-queue/queue-tablet.png) | ![](../../artifacts/lab-03/screenshots/staff-queue/queue-mobile.png) |

## 3. IT Staff Ticket Detail

![Staff detail — desktop 1280](../../artifacts/lab-03/screenshots/staff-ticket-detail/detail-desktop.png)

| Tablet 820 | Mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/staff-ticket-detail/detail-tablet.png) | ![](../../artifacts/lab-03/screenshots/staff-ticket-detail/detail-mobile.png) |

Public Comments and Internal Notes are visibly distinct (V-12), and confirmations are sized for a phone (V-14):

![Internal Notes (amber) vs Public Comments](../../artifacts/lab-03/screenshots/staff-ticket-detail/notes-vs-comments.png)

| Confirmation on mobile |
| --- |
| ![](../../artifacts/lab-03/screenshots/staff-ticket-detail/confirm-mobile.png) |

## 4. Administrator User Management

![Users — desktop 1280, list + panel](../../artifacts/lab-03/screenshots/user-management/users-desktop.png)

| Tablet 820 — panel above list | Mobile 375 — cards |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/user-management/users-tablet.png) | ![](../../artifacts/lab-03/screenshots/user-management/users-mobile.png) |

## 5. Requester screens changed in Lab 3

The shared badges, IT Priority, owner, Public Comments and "Problem appears resolved" reach the Requester's screens too.

![My Tickets — desktop 1280](../../artifacts/lab-03/screenshots/requester/my-tickets-desktop.png)

| My Tickets — tablet 820 | My Tickets — mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/requester/my-tickets-tablet.png) | ![](../../artifacts/lab-03/screenshots/requester/my-tickets-mobile.png) |

![Requester Ticket Detail — desktop 1280](../../artifacts/lab-03/screenshots/requester/ticket-detail-desktop.png)

| Ticket Detail — tablet 820 | Ticket Detail — mobile 375 |
| --- | --- |
| ![](../../artifacts/lab-03/screenshots/requester/ticket-detail-tablet.png) | ![](../../artifacts/lab-03/screenshots/requester/ticket-detail-mobile.png) |
