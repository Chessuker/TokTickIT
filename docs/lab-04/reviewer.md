# Lab 4 — Peer Review Documentation

A record of the peer review for this sprint: who reviewed, which pull requests, what was raised, and how each point was resolved. Every row links to the GitHub review it summarises. Rows are filled in as each PR is reviewed.

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

One row per pull request. The base branch is `lab4-staging` for feature PRs and `main` for the release PR.

| # | Issue | PR | Branch | Base | Reviewed By | Merged | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | #52 Sprint 4 engineering contract | [#59](https://github.com/Chessuker/TokTickIT/pull/59) | `feature/52-lab4-spec-docs` | `lab4-staging` | TeekhathatTT | 2026-10-07 (`b48ef3a`) | Approved |
| 2 | #53 Actions Taken foundation (DB + API) | [#60](https://github.com/Chessuker/TokTickIT/pull/60) | `feature/53-actions-taken-api` | `lab4-staging` | TeekhathatTT | 2026-10-29 (`213ec64`) | Changes requested → fixed → approved |
| 3 | #54 Actions Taken UI | [#61](https://github.com/Chessuker/TokTickIT/pull/61) | `feature/54-actions-taken-ui` | `lab4-staging` | TeekhathatTT | 2026-10-29 (`2b09623`) | Changes requested → fixed → approved |
| 4 | #55 Ticket workflow, resolution gate and stale updates | [#62](https://github.com/Chessuker/TokTickIT/pull/62) | `feature/55-ticket-workflow` | `lab4-staging` | TeekhathatTT | 2026-10-30 (`2cda9de`) | Changes requested → fixed → approved |
| 5 | #56 Role dashboards | [#63](https://github.com/Chessuker/TokTickIT/pull/63) | `feature/56-dashboards` | `lab4-staging` | TeekhathatTT | 2026-10-30 (`f554825`) | Approved |
| 6 | #57 Final hardening, regression and accessibility | [#64](https://github.com/Chessuker/TokTickIT/pull/64) | `feature/57-final-hardening` | `lab4-staging` | TeekhathatTT | 2026-10-31 (`ccbcc2e`) | Changes requested → fixed → approved |
| 7 | #58 E2E, visual inspection and release | | `feature/58-e2e-release` | `lab4-staging` | | | |
| 8 | Release Lab 4 | | `lab4-staging` | `main` | | | |

---

## 3. Comments on My PRs (received)

| PR | Comment (summary) | My response | Outcome |
| --- | --- | --- | --- |
| [#59](https://github.com/Chessuker/TokTickIT/pull/59) | Approved: "Spec requirement = ครบ ✅" — the contract covers every requirement in the handout. | Thanked the reviewer; merged by TeekhathatTT. | Approved, no changes |
| [#60](https://github.com/Chessuker/TokTickIT/pull/60) | **Changes requested.** The `actionAt` lower bound rounded the Ticket's `createdAt` down to the minute, so an Action could be dated up to 59 seconds before the Ticket existed (BR-05). | `ee07dee`: compare `actionAt` with `createdAt` exactly; five boundary tests (UNIT-01 ×4, API-05); reinstating the rounding makes three of them fail. The minute precision moved to the UI's `datetime-local` `min`, rounded up (#54). | Approved after the fix |
| [#61](https://github.com/Chessuker/TokTickIT/pull/61) | **Changes requested.** (1) Add tests for a `403` on the Actions list, showing a clear message and no data or controls. (2) Handle `403` and other API errors as ui-spec §3.5 / L3 §2 say, keeping Retry only where retrying can help and never describing a `403` as a network problem. (3) Re-run client, server and E2E on the latest code and record the results. | `403` → "Access denied" and `404` → "Not found" with the server message, no Retry, no list, no Record action; network / `5xx` keep the safe failure with Retry; a `403` / `404` on a save or a follow-up change named as such, values kept. Six UI-08 tests. Re-run: client 277, server 768, E2E 92. | Approved after the fix |
| [#62](https://github.com/Chessuker/TokTickIT/pull/62) | **Changes requested.** After a `409 STALE_UPDATE`, Reload cleared the stale callout and the user's choice even when re-reading the ticket failed (`500` or network). Keep both until the latest ticket is loaded, say that Reload failed, and allow a retry; add tests for both failures. | `refresh()` reports success or the reason; the stale state ends only on a successful re-read; "Reload failed: …" in the callout, focus on Reload. Two UI-11 tests (fail, fail again, succeed) for `500` and network; reverting makes both fail. Re-run: client 301, server 835, E2E 97. | Approved after the fix |
| [#63](https://github.com/Chessuker/TokTickIT/pull/63) | **Approved, no changes requested.** Checked the scope of #56 point by point: the Requester dashboard counts only the session user's Tickets; the Staff dashboard shows Unassigned, Mine, Follow-ups, Requester Reports Resolved, By Status and By IT Priority; the Administrator view adds user counts without Mine / My Follow-ups; each card's `where` matches its `href`; one `REPEATABLE READ` read; Queue and My Tickets filter and sort; Loading / Empty / Forbidden / Failure / Retry; Dashboard first after login and first in the navigation. Noted the recorded results (server 909, client 333, E2E 107, INT-01 76/76, p95 12.9 / 21.5 ms) and asked to confirm CI and to run the whole client suite with `npm run test:client`, not only the Lab 4 folder. | The suites were run in full with `npm run test:client` / `test:server` / `test:e2e`; the repository has no GitHub Actions workflow, so there is no CI run to check. Merged. | Approved, no changes |
| [#64](https://github.com/Chessuker/TokTickIT/pull/64) | **Changes requested.** (1) Guard `runConfirmation()` and `confirmClose()` against a same-tick double click, releasing the guard in `finally`. (2) Tests: status, reassign and follow-up confirmations send one PATCH; Edit User, Set Initial Password, Internal Note; retry after a failure. (3) Close the tablet / mobile cells of the ui-spec §5 checklist (focus ring, overlap, console). (4) Re-run every suite and lint; check CI. | Ref guard in both handlers and in `save()` (also covers Claim); 11 tests, all 13 double-submit tests fail with the guard disabled; STY-02 / STY-04 at three widths and a new `elementFromPoint` overlap test (V-14); §5 ☑ everywhere. Re-run: server 926, client 357, E2E 130, lint 0 errors. The repository has no GitHub Actions workflow, so there is no CI run to check. | Approved after the fix |

---

## 4. Comments I Gave on My Partner's PRs

| PR | Comment (summary) | Their response | Outcome |
| --- | --- | --- | --- |
| [#51](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/51) Lab 4 spec docs | **Changes requested (2026-10-09).** (1) The resolution gate's `EXISTS` check then `UPDATE` is not atomic under READ COMMITTED; name a lock (`FOR UPDATE`) or a version bump, and add a race test. (2) `PATCH …/actions-taken/:actionId` rules contradict each other (stored vs merged row, who may send a mixed body, flipping follow-up on a resolved row). (3) Administrator has API rights but no screen, and dead links on the Admin dashboard. (4) Card counts ≠ drill-down rows (30-day window vs all time, "today" vs any day, an undefined id-list filter). (5) The new `INVALID_TRANSITION` code changes Lab 3 behaviour. (6) The time-dependent seed makes dashboard tests flaky; listed the expected number for each card. Plus optional points 7–11. **Re-review (2026-10-13, `e21e30e`):** T4 re-armed the gate on any edit of a resolved row; a `null` loophole in mixed-body authorization (decide by key presence); a frozen JS clock does not freeze SQL `now()`; the lost-update guard missing for assignment / priority. | Fixed each round ("แก้แล้วครับ"): T1–T4 only on an explicit flip, key-presence authorization, time bounds from an injectable clock, `FOR UPDATE` / conditional write on every Ticket write, matching drill-down filters. | Approved 2026-10-13, merged |
| [#56](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/56) Lab 4 database migration | **Changes requested (2026-10-15).** (1) The rollback SQL was not safe to re-run (`ALTER TABLE` on a dropped table); use `IF EXISTS` or just `DROP TABLE`. (2) The baseline seed step ran this branch's seed before the migration. (3) `backups/` not in `.gitignore`, so a `pg_dump` with password hashes could be committed. Optional: an ordered checksum query, a seed duplicate check on immutable fields, Actions dated before their Tickets, commit the rollback script, restore steps matching the evidence. **Follow-up:** the seed's upsert overwrote `createdAt` on existing Lab 3 Tickets (AC-12, zero-touch on Lab 1–3); keep it in `create` only. | Fixed all must-fix and optional points, then the `createdAt` follow-up. | Approved 2026-10-16, merged |
| [#57](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/57) Actions Taken workflow | **Changes requested (2026-10-21, `73f4f61`).** Server confirmed correct (lock order, status-check order, BR-06 evaluation, session-owned fields). Client: (1) no CSS for the Actions Taken UI, so it looked like a Public Comment; (2) thread order wrong (ui-spec §1); (3) "Keep my text" after an edit conflict could never succeed (stale `expectedUpdatedAt`); (4) authors could not edit a row after a T2 flip; plus silent replay on Reload, a stale list after a resolve conflict, a disabled submit with no reason, edit-form parity. **Re-review:** all eight fixed; one new issue: a failed "Retry my change" showed nothing and left the button in place. | Fixed both rounds; the failed retry is now shown outside the conflict panel and clears the pending change, with a `TicketWorkflow` test. | Approved 2026-10-27 after re-running server 173, client 85 and `tsc` on `d28748b`; merged |
| [#60](https://github.com/TeekhathatTT/CPE334-TokTickIT/pull/60) Release `lab4-staging` → `main` | **Changes requested (2026-10-31, `1a949c9`).** Builds and suites pass (server 198, client 102); no secrets committed. **Blocking:** double-encoded UTF-8 (mojibake) on Lab 2/3 screens — `MyTicketsPage.tsx`, `TicketQueuePage.tsx` (encoded twice, clipping Last Updated) and comments in `api.ts`, visible in the PR's own regression screenshots. Should fix: the Administrator dashboard cannot be reached in the UI; drill-down filters are not shown on the list pages. Nits: ownership filter consistency, E2E setup resetting the dev database, dashboard reads not one snapshot. **Re-review (`4f5389e`):** the fix replaced the three files with their Lab 3 versions and mis-encoded them again — client `tsc` 126 errors, 51 tests failing; asked to revert, fix only the glyphs, save as UTF-8 without BOM, and re-capture two screenshots. | Pending at the time of writing. | Open — changes requested |
