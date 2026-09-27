# Lab 3 — Peer Review Documentation

Record of the peer review performed on this sprint: who reviewed, which pull requests, what was raised, and how it was resolved. Every row below links to the GitHub review it summarises.

---

## 1. Peer Reviewer Information

| Field | Detail |
| --- | --- |
| Name | Theehathat |
| Student ID | 67070501019 |
| GitHub Username | [TeekhathatTT](https://github.com/TeekhathatTT) |
| Their repository, which I reviewed | https://github.com/TeekhathatTT/CPE334-TokTickIT |
| My repository, which they reviewed | https://github.com/Chessuker/TokTickIT |

### My Information

| Field | Detail |
| --- | --- |
| Name | Thawat Boonsuk |
| Student ID | 67070501024 |
| GitHub Username | Chessuker |

---

## 2. Reviewed PR Links

One row per pull request. Base branch is `lab3-staging` for feature PRs and `main` for the release PR.

| # | Issue | PR | Branch | Base | Reviewed By | Merged | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | #36 Sprint 3 engineering contract | [#43](https://github.com/Chessuker/TokTickIT/pull/43) | `feature/36-lab3-spec-docs` | `lab3-staging` | TeekhathatTT | 2026-09-18 (`4ad5d2e`) | Changes requested (5) → fixed → Approved |
| 2 | #37 Authentication foundation | [#44](https://github.com/Chessuker/TokTickIT/pull/44) | `feature/37-auth-foundation` | `lab3-staging` | TeekhathatTT | 2026-09-19 (`05f2133`) | Approved |
| 3 | #38 Requester regression, comments, resolution | [#45](https://github.com/Chessuker/TokTickIT/pull/45) | `feature/38-requester-comments` | `lab3-staging` | TeekhathatTT | 2026-09-19 (`42e7ccf`) | Approved |
| 4 | #39 IT Staff Ticket Queue | [#46](https://github.com/Chessuker/TokTickIT/pull/46) | `feature/39-staff-queue` | `lab3-staging` | TeekhathatTT | 2026-09-22 (`acd96bd`) | Approved |
| 5 | #40 IT Staff Ticket operations | [#47](https://github.com/Chessuker/TokTickIT/pull/47) | `feature/40-staff-ticket-ops` | `lab3-staging` | TeekhathatTT | 2026-09-25 (`f835755`) | Approved |
| 6 | #41 Administrator user management | [#48](https://github.com/Chessuker/TokTickIT/pull/48) | `feature/41-admin-users` | `lab3-staging` | TeekhathatTT | 2026-09-26 (`91e5178`) | Approved |
| 7 | #42 E2E, visual inspection, release | [#49](https://github.com/Chessuker/TokTickIT/pull/49) | `feature/42-e2e-release` | `lab3-staging` | TeekhathatTT | 2026-09-26 (`ac1f845`) | Changes requested (1) → fixed → Approved |
| 8 | Release Lab 3 | [#50](https://github.com/Chessuker/TokTickIT/pull/50) | `lab3-staging` | `main` | TeekhathatTT | | Approved |

---

## 3. Comments on My PRs (received)

| PR | Comment (summary) | My response | Outcome |
| --- | --- | --- | --- |
| [#43](https://github.com/Chessuker/TokTickIT/pull/43#pullrequestreview-5237681163) | **Changes requested.** (1) Authorization matrix: "view own ticket" must be `✓ read` for IT Staff / Administrator, not `–` (conflicted with BR-14 and api-spec). (2) Add BRs for rules that lived only in api-spec: no owner / IT Priority change on Closed / Cancelled, no unassign while In Progress, assigning a New ticket sets Open. (3) BR-10 / BR-11: Change Password must revoke the user's other sessions. (4) AC-31: "each former requester" → one active requester, and MIG-01 checks this before the seed. (5) BR-07: the throttle counts only `INVALID_CREDENTIALS`, not the inactive `403`. | Fixed all five in the specification and api-spec, then asked for a re-review. | [Approved](https://github.com/Chessuker/TokTickIT/pull/43#pullrequestreview-5244651347) |
| [#44](https://github.com/Chessuker/TokTickIT/pull/44#pullrequestreview-5254264821) | Approved. Checked against the spec: 32-byte session token stored only as a SHA-256 hash; `httpOnly` / `SameSite=Lax` / 24 h cookie; `requesterId` taken only from the session; dummy-hash bcrypt compare against timing attacks; throttle of 5 failures / 15 min counting only `401`; migration verify script; the `?from=` race fix has its own test; the David Lee seed deviation is written back into the spec. | Acknowledged; merged. | Approved, no changes |
| [#45](https://github.com/Chessuker/TokTickIT/pull/45#pullrequestreview-5255587551) | Approved. Administrator blocked with `403` before the lookup; resolution indication is idempotent and never touches status; comments render as plain JSX text (no `dangerouslySetInnerHTML`, so no XSS); badges unified. Re-ran the suites: client 139/139; server 229 passed, with the 13 seed tests limited by the reviewer's own sandbox. | Acknowledged; merged. | Approved, no changes |
| [#46](https://github.com/Chessuker/TokTickIT/pull/46#pullrequestreview-5280350467) | Approved with a checklist: both staff endpoints, Requester `403` before the query, search, multi-status OR, filters, 10 sort orders, pagination, invalid query → `400`, Administrator read-only, 24 seeded tickets, idempotent seed, status enum order, three layouts, URL as state, all four test levels. | Merged. | Approved, no changes |
| [#47](https://github.com/Chessuker/TokTickIT/pull/47#pullrequestreview-5314278949) | Approved. `ticketWorkflow.ts` is the single source of truth — enforcement and the `permittedTransitions` the API returns use the same function, and an Administrator always gets `[]`. `PATCH /owner` refuses unassign on In Progress and changes on terminal statuses, and accepts only active IT Staff. Internal Notes block Requesters at the router. The Administrator view renders values, not disabled inputs. | Acknowledged; merged. | Approved, no changes |
| [#48](https://github.com/Chessuker/TokTickIT/pull/48#pullrequestreview-5324640750) | Approved, checked against the specification, api-spec, ui-spec, tests and the Lab 3 handout: list, search and role filter, create with one role and `mustChangePassword`, duplicate email `409` under the field, self-deactivation and last-Administrator `409` on the server, session revocation, new initial password, no Delete control (BR-27), non-Administrator `403` before lookup, no `passwordHash` exposed, three layouts, API-40 … 48, UI-21 … 24, E2E-06. | Acknowledged; merged. | Approved, no changes |
| [#49](https://github.com/Chessuker/TokTickIT/pull/49#pullrequestreview-5325602769) | **Changes requested.** The code matches the specification (E2E, responsive / visual, accessibility, error handling), but the PR description claimed all evidence was complete when part of the final evidence was not. Fix the description only, not the implementation. | [Rewrote the description](https://github.com/Chessuker/TokTickIT/pull/49#issuecomment-5846985831): test logs and API transcript marked as a pre-release snapshot (`91e5178 + uncommitted changes`), PDF marked as a draft, an "Evidence status" table of what remains, Definition of Done stated as 13 / 16. No code changed. | [Approved](https://github.com/Chessuker/TokTickIT/pull/49#pullrequestreview-5326197261) |
| [#50](https://github.com/Chessuker/TokTickIT/pull/50#pullrequestreview-5328857037) | Approved. Everything is complete; what remains for submission is the test / evidence run on `main`, the Kanban with #36 – #42 in Done plus its screenshot, and the peer review in `reviewer.md` — none of it touches the features. | Addressed in the `docs/lab-03-final-evidence` PR: evidence re-run on `main`, Kanban captured, this file completed. | Approved |

---

## 4. Comments I Gave on My Partner's PRs

Repository: [TeekhathatTT/CPE334-TokTickIT](https://github.com/TeekhathatTT/CPE334-TokTickIT). All five Lab 3 pull requests target `lab3-staging`.

| PR | Comment (summary) | Their response | Outcome |
| --- | --- | --- | --- |
| [#32](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/32#pullrequestreview-5190272461) Authentication and requester authorization | **Changes requested.** (1) `cors()` default while the client sends `credentials: "include"` → `cors({ origin: APP_ORIGIN, credentials: true })` and drop the duplicate manual Origin check. (2) Confirm the cookie config: `SameSite=None; Secure` only if truly cross-site. (3) Document that the in-memory session Map is lost on restart. (4) Grep for leftover `x-requester-id` logic. | Fixed all four; a second reviewer confirmed each item. | Merged 2026-09-15 (`fd99f78`); [approved](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/32#pullrequestreview-5254980040) |
| [#34](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/34#pullrequestreview-5207658878) Staff queue and auth compatibility | **Changes requested.** (1) `requireAuth` removed from `/api/categories`, `/api/requesters`, `/api/related-systems`. (2) `x-requester-id` lets a caller impersonate a requester — gate it behind an environment flag. (3) `staff.ts` reads `requester.email` / `role` that a legacy DB may lack. (4) `ticket.category.name` / `relatedSystem.name` without null checks. (5) Assignment race: use a conditional update and `409`. [Optional](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/34#pullrequestreview-5207666818): transition tests, wire the real `StaffQueue` component, log staff actions, fewer `any`. | [Fixed](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/34#issuecomment-5693491851). On my [follow-up](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/34#issuecomment-5699612529) (public endpoints intended?, explicit flag instead of `NODE_ENV`, a two-staff assignment `409` test) they declined; those were optional. | Merged 2026-09-18 (`cfdb5f0`); approved |
| [#40](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/40#pullrequestreview-5314190698) Database migration | **Changes requested.** (1) The seed deletes `PublicComment` / `InternalNote` rows — breaks append-only history; use deterministic ids or upsert. (2) Dropping `PENDING` breaks Lab 2 consumers. [Second round](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/40#pullrequestreview-5314700276): the `specification.md` the migration cites is not in the repo — add it or summarise the requirements. | Fixed the seed and the enum; pointed to the specification already in the repo. | Merged 2026-09-25 (`0f0d881`); [approved](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/40#pullrequestreview-5314939340) — I had missed the document on the second round and said so |
| [#42](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/42#pullrequestreview-5324801729) Authentication and requester regression | **Changes requested.** (1) A newly created Requester cannot create a ticket — `createTicket` answers `500`. (2) No Origin / CSRF check on state-changing requests, which api-spec §0 / §7 require. (3) Change Password leaves the user's other sessions alive. (4) PR description still has template placeholders. Optional: login timing reveals which emails exist, client ignores a mid-session `401`, three duplicated session loaders, "Problem appears resolved" allowed on Closed / Cancelled, the legacy-id `OR` in `ownedTicketFilter`. | Fixed items 1 – 4 in `16aa8b6`; skipped the optional ones. | Merged 2026-09-26 (`7975e47`); [approved](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/42#pullrequestreview-5324911595), suggesting tests for the three fixes and `P2002` instead of a message regex |
| [#44](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/44#pullrequestreview-5325071709) IT Staff queue and ticket operations | **Changes requested.** (1) IT Priority not initialised from Requested Priority (BR-12). (2) Reassign asks the user to type a user id, but ui-spec §6 requires selecting active IT Staff. (3) PR description did not match the code (roles, route names, menu label). Optional: status race, the resolved flag not cleared on Reopened, no Administrator `403` tests. | Fixed all three: IT Priority default with a test, an active-IT-Staff dropdown via `GET /api/staff/users`, corrected description. | Merged 2026-09-26 (`548cc59`); [approved](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/44#pullrequestreview-5326160358) |
| [#46](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/46#pullrequestreview-5326458229) Administrator user management | **Changes requested.** (1) The search box loses focus on every keystroke, and stale responses are not discarded. Further items: tickets of demoted / deactivated IT Staff stay assigned, the last-Administrator rule is racy, a concurrent duplicate email (`P2002`) is not a `409`, a leftover `reset-password` route and password-field alias. | Fixed items 1 – 5: 300 ms debounce with stale responses dropped, unassign in the same transaction, a Serializable transaction for the last-Administrator rule, `P2002` → `409`, the alias removed. | Merged 2026-09-27 (`b713514`); [approved](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/46#pullrequestreview-5328760959) |
