# Answer Part 1 — Git Use with Engineering Workflow

Repository: <https://github.com/Chessuker/TokTickIT> · Branch flow: `feature/<issue>-<slug>` → pull request → `lab4-staging` → release pull request → `main`.

---

## 1. Commit history: feature branches → `lab4-staging` → `main`

Every Lab 4 change reached `lab4-staging` through a pull request from its own feature branch, reviewed before merge; `git log --first-parent lab4-staging` contains nothing but those merges. The release pull request then merges `lab4-staging` into `main`.

| Issue | Pull request | Branch | Merged into `lab4-staging` |
| --- | --- | --- | --- |
| #52 Sprint 4 engineering contract | [#59](https://github.com/Chessuker/TokTickIT/pull/59) | `feature/52-lab4-spec-docs` | 2026-10-07 14:37 · `b48ef3a` |
| #53 Actions Taken foundation (DB + API) | [#60](https://github.com/Chessuker/TokTickIT/pull/60) | `feature/53-actions-taken-api` | 2026-10-29 14:20 · `213ec64` |
| #54 Actions Taken UI | [#61](https://github.com/Chessuker/TokTickIT/pull/61) | `feature/54-actions-taken-ui` | 2026-10-29 20:39 · `2b09623` |
| #55 Ticket workflow, resolution gate, stale updates | [#62](https://github.com/Chessuker/TokTickIT/pull/62) | `feature/55-ticket-workflow` | 2026-10-30 00:35 · `2cda9de` |
| #56 Role dashboards | [#63](https://github.com/Chessuker/TokTickIT/pull/63) | `feature/56-dashboards` | 2026-10-30 16:04 · `f554825` |
| #57 Final hardening, regression and accessibility | [#64](https://github.com/Chessuker/TokTickIT/pull/64) | `feature/57-final-hardening` | 2026-10-31 14:48 · `ccbcc2e` |
| #58 E2E, visual inspection and release | see [`reviewer.md`](reviewer.md) §2 | `feature/58-e2e-release` | see `reviewer.md` |
| Release Lab 4 | see [`reviewer.md`](reviewer.md) §2 | `lab4-staging` → `main` | see `reviewer.md` |

![git log --graph --oneline --decorate -n 60](../../artifacts/lab-04/screenshots/evidence/git-history.png)

The image is the verbatim output of the command at its top, saved in [`test-runs/git-history.txt`](test-runs/git-history.txt) and rendered by [`scripts/capture-test-runs.mjs`](scripts/capture-test-runs.mjs).

Four of the seven feature PRs were sent back by the reviewer and fixed on the same branch before merging (#60, #61, #62, #64); each fix is its own commit, so the history shows the review and the response, not only the result.

---

## 2. GitHub Project / Kanban — all Issues in Done

Issues #52 – #58, one per pull request above, all in **Done**:

![Final Kanban board](../../artifacts/lab-04/screenshots/evidence/kanban-final.png)

---

## 3. Peer review

The rendered [`reviewer.md`](reviewer.md) follows this page: reviewer identity, the pull-request links above, every comment received with the response and the outcome, comments given on the partner's pull requests, and approvals.

---

## 4. README and `.gitignore`

[`README.md`](../../README.md) is rendered in full after `reviewer.md`. For Lab 4 it adds the dashboards, Actions Taken and ticket workflow to the feature list, the current project layout, a seven-step demo walkthrough, upgrading a Lab 3 database with its rollback check, the database checks (INT-01, INT-02, PERF-01), and the end-to-end and screenshot commands.

`.gitignore` keeps secrets, dependencies, build output, uploaded files, test reports and the course lab sheets out of the repository — `.env` is ignored and no `.env` file is tracked; only `server/.env.example` is:

```gitignore
node_modules/
.env
.env.local
.env.*.local
dist/
build/
*.tsbuildinfo
logs/
*.log
.vscode/
.idea/
.claude/
Lab_3_sheet.pdf
*_labsheet.pdf
server/uploads/
e2e/report/
test-results/
playwright/.cache/
```

---

## 5. Repository structure (Lab 4 increment)

```text
docs/lab-04/
├── specification.md  api-spec.md  ui-spec.md  tests.md
├── reviewer.md  ai-use.md  issues.md  README.md
├── answer-part1 … answer-part9 *.md
├── build-submission-pdf.mjs
├── scripts/            capture-test-runs.mjs
└── test-runs/          server.txt · client.txt · e2e.txt · lint.txt · git-history.txt
                        int-01-dashboards.txt · int-02-03-concurrency.txt · perf-01-smoke.txt
                        inactive-assignee-refused.txt

server/
├── prisma/migrations/20261003000000_lab04_actions_taken/   additive migration
├── prisma/rollback/20261003000000_lab04_actions_taken.down.sql
├── src/  actionRules.ts · actionRoutes.ts · ticketWorkflow.ts (gate) ·
│         dashboardMetrics.ts · dashboardRoutes.ts
├── scripts/  verify-lab04-migration.ts · verify-lab04-concurrency.ts ·
│             verify-lab04-dashboards.ts · perf-lab04-smoke.ts
└── tests/lab-04/       unit and API suites

client/src/components/lab-04/   ActionsTaken · TicketHistory · RequesterDashboard ·
                                StaffDashboard · DashboardParts · dates
client/src/components/Modal.tsx · client/src/useSingleFlight.ts

e2e/lab-04/   actions-taken-flow · ticket-resolution · dashboards · visual
artifacts/lab-04/screenshots/   actions-taken · workflow · requester-dashboard ·
                                staff-dashboard · regression · evidence
```
