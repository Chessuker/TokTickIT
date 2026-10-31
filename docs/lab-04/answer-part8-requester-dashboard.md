# Answer Part 8 — Working Requester Dashboard and Final Regression UI

Screen: `/dashboard` as a Requester (Jennifer Anderson; Ploy Charoen, who has no Tickets). Images captured on a freshly migrated and seeded database. Contract: specification.md BR-21 … BR-27, api-spec.md §3.6, §4.4, ui-spec.md §3.1, §3.7.

---

## 1. Requester-owned metrics, attention-required and recent Tickets

![Requester dashboard, 1280 px](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-desktop.png)

Four counts of the Requester's own Tickets — open (active statuses), waiting for you, resolved, closed — and three five-row lists: **Needs your reply** (waiting for the Requester), **Recently updated**, **Recently resolved**. "Waiting for you" above 0 gets a border and "Reply needed", so it stands out without relying on colour. Every row opens the Ticket.

A Requester with no Tickets sees one panel with the way in:

![Empty dashboard (Ploy)](../../artifacts/lab-04/screenshots/requester-dashboard/empty-desktop.png)

Loading shows skeleton values under the real labels; a failure shows Retry with the quick actions still usable:

| Loading | Safe failure |
| --- | --- |
| ![Loading](../../artifacts/lab-04/screenshots/requester-dashboard/loading.png) | ![Failure](../../artifacts/lab-04/screenshots/requester-dashboard/failure.png) |

---

## 2. Drill-down

Each card opens My Tickets with the same filter, now held in the URL, and the same total. "My open tickets" means five statuses at once, shown as selected chips:

![My Tickets opened from "My open tickets"](../../artifacts/lab-04/screenshots/requester-dashboard/drilldown-desktop.png)

---

## 3. Ownership protection

- The endpoint reads no parameter at all: the Requester is the session user, so `?requesterId=<someone else>` changes nothing (API-24 sends it and compares the answers).
- Every count and list query carries `requesterId = session user` (API-24 inspects each one).
- IT Staff and Administrators calling the Requester dashboard get `403`; no session gets `401` (API-27).
- On PostgreSQL, INT-01 checks that no list row belongs to anyone else ("list rows owned by someone else: 0") and that Ploy's counts are all zero.

---

## 4. Regression — the Lab 2 and Lab 3 features on the Lab 4 build

Every Lab 2 and Lab 3 suite runs unchanged in the final run (Part 3): authentication, My Tickets, Ticket Detail, attachments, Public Comments, the Queue, ticket operations, Internal Notes and user management. The screens, re-captured on the Lab 4 build (R-15):

| Feature | Screen |
| --- | --- |
| Authentication | ![Login](../../artifacts/lab-04/screenshots/regression/login-desktop.png) ![Change Password](../../artifacts/lab-04/screenshots/regression/change-password-desktop.png) |
| My Tickets | ![My Tickets](../../artifacts/lab-04/screenshots/regression/my-tickets-desktop.png) |
| Ticket Detail, Attachments, Public Comments | ![Ticket Detail](../../artifacts/lab-04/screenshots/regression/ticket-detail-desktop.png) |
| Create Ticket | ![Create Ticket](../../artifacts/lab-04/screenshots/regression/create-ticket-desktop.png) |
| IT Staff Queue | ![Queue](../../artifacts/lab-04/screenshots/regression/queue-desktop.png) |
| IT Staff Ticket Detail | ![Staff detail](../../artifacts/lab-04/screenshots/regression/staff-ticket-detail-desktop.png) |
| Internal Notes | ![Internal Notes](../../artifacts/lab-04/screenshots/regression/internal-notes-desktop.png) |
| Administrator user management | ![Users](../../artifacts/lab-04/screenshots/regression/users-desktop.png) |

The tablet and mobile captures of each are in [`artifacts/lab-04/screenshots/regression/`](../../artifacts/lab-04/screenshots/regression/).

What changed for these screens in Lab 4, on purpose: every role lands on the Dashboard; My Tickets keeps its filters in the URL with status chips; every date is shown in Bangkok time; every form sends once on a double submit; every dialog keeps keyboard focus inside. The earlier tests that had to follow these changes are listed in tests.md §5.
