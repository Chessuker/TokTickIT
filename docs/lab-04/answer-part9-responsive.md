# Answer Part 9 — Zen Green UI, Responsive, Accessibility and Final Polish

Link: [`docs/lab-04/ui-spec.md`](ui-spec.md) — rendered in full after this page, including the completed visual and accessibility checklist (§5, V-01 … V-20, ☑ at every width with its evidence).

Every image was captured by `CAPTURE=1 npx playwright test e2e/lab-04` on a freshly migrated and seeded database, at 1280 / 820 / 375 px; each capture first checks the page does not scroll sideways. Desktop captures are full-page; tablet and phone show the viewport, as the device would.

---

## 1. Major Lab 4 screens at three widths

| Screen | 1280 px | 820 px | 375 px |
| --- | --- | --- | --- |
| IT Staff dashboard | ![](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-desktop.png) | ![](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-tablet.png) | ![](../../artifacts/lab-04/screenshots/staff-dashboard/dashboard-mobile.png) |
| Requester dashboard | ![](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-desktop.png) | ![](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-tablet.png) | ![](../../artifacts/lab-04/screenshots/requester-dashboard/dashboard-mobile.png) |
| Actions Taken list | ![](../../artifacts/lab-04/screenshots/actions-taken/list-desktop.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/list-tablet.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/list-mobile.png) |
| Actions Taken create | ![](../../artifacts/lab-04/screenshots/actions-taken/create-desktop.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/create-tablet.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/create-mobile.png) |
| Work done by IT (Requester) | ![](../../artifacts/lab-04/screenshots/actions-taken/requester-desktop.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/requester-tablet.png) | ![](../../artifacts/lab-04/screenshots/actions-taken/requester-mobile.png) |
| Resolution gate | ![](../../artifacts/lab-04/screenshots/workflow/gate-hint-desktop.png) | ![](../../artifacts/lab-04/screenshots/workflow/gate-hint-tablet.png) | ![](../../artifacts/lab-04/screenshots/workflow/gate-hint-mobile.png) |
| History | ![](../../artifacts/lab-04/screenshots/workflow/history-desktop.png) | ![](../../artifacts/lab-04/screenshots/workflow/history-tablet.png) | ![](../../artifacts/lab-04/screenshots/workflow/history-mobile.png) |
| Cancel dialog | ![](../../artifacts/lab-04/screenshots/workflow/cancel-dialog-desktop.png) | ![](../../artifacts/lab-04/screenshots/workflow/cancel-dialog-tablet.png) | ![](../../artifacts/lab-04/screenshots/workflow/cancel-dialog-mobile.png) |
| Drill-down (My Tickets) | ![](../../artifacts/lab-04/screenshots/requester-dashboard/drilldown-desktop.png) | ![](../../artifacts/lab-04/screenshots/requester-dashboard/drilldown-tablet.png) | ![](../../artifacts/lab-04/screenshots/requester-dashboard/drilldown-mobile.png) |
| Drill-down (Queue) | ![](../../artifacts/lab-04/screenshots/staff-dashboard/drilldown-desktop.png) | ![](../../artifacts/lab-04/screenshots/staff-dashboard/drilldown-tablet.png) | ![](../../artifacts/lab-04/screenshots/staff-dashboard/drilldown-mobile.png) |

---

## 2. The checklist, and how it was checked

| Checklist area | How it is checked |
| --- | --- |
| Design consistency | One stylesheet and badge set; dashboards reuse cards and chips; the Actions panel is green-bordered, Internal Notes stay amber (V-01, V-02, V-12, V-13) |
| Dashboards | Every card one link with label + value in its name, "None right now" on zero, drill-down total = card (V-15, V-16; UI-13 … UI-18, E2E-05, INT-01) |
| Actions Taken | View vs edit unambiguous; read-only fields styled as values; validation under each field (V-08, V-11) |
| Keyboard focus | STY-02 tabs through both dashboards and the Actions form at every width and requires a visible ring on every stop; all five dialogs trap focus, close on Escape and return focus (V-05, V-18) |
| Clipping | STY-01 fails if any element's box leaves its card, on every screen of every role at every width (V-04) |
| Overlap | The V-14 test checks with `elementFromPoint` that dialogs and the Actions form buttons are the topmost element and inside the viewport at every width |
| Horizontal overflow | STY-01 and every capture: `scrollWidth ≤ innerWidth` (V-03) |
| Contrast and non-colour cues | STY-03: every badge has text and ≥ 4.5:1 (V-07, V-17) |
| Polish | STY-04: no console error or warning on each role's path, every in-app link resolves, no placeholder text (V-19, V-20) |

---

## 3. What the checks found and fixed

The checks were not a formality; each of these was found by one of them and fixed before release:

- **#54** — the expanded Action row was clipped at the right edge on desktop (screenshot).
- **#55** — a wrapped gate-hint link put its bullet on the wrong line; a history time wrapped onto its own line on mobile (screenshots).
- **#56** — the "Waiting for Requester" badge stretched into a box on the status cards; the four primary cards sat 3 + 1 on tablet (screenshots).
- **#57** — no dialog kept keyboard focus inside (V-18); the date input's calendar button had no focus ring (STY-02); five forms sent twice on a same-tick double submit; Lab 2/3 dates followed the machine's locale.
- **#58** — "Waiting for Requester" was cut to "Waiting for Reque…" on the desktop status card, a September date ("Sept") ran into the next Queue column on tablet, and the Queue's Sort select was clipped on tablet (release captures).
