# Lab 4 — Documentation Index

Repository: <https://github.com/Chessuker/TokTickIT> · Sprint 4 branch flow: `feature/<issue>-<slug>` → `lab4-staging` → `main`

Handout: [`SE+Lab+4.pdf`](SE+Lab+4.pdf)

---

## Source documents

| Document | What it holds |
| --- | --- |
| [specification.md](specification.md) | FR-01…14, BR-01…31 (Actions Taken, workflow, resolution gate, dashboards), authorization and transition matrices, metric definitions, data changes and DB-01…05, AC-01…31, Definition of Done, AD-01…12 |
| [api-spec.md](api-spec.md) | New error codes, optimistic concurrency, Action / history / dashboard shapes, seven new endpoint sections, changes to Lab 2/3 endpoints, endpoint → test map |
| [ui-spec.md](ui-spec.md) | Metric cards, follow-up badges, dashboards, Actions Taken modes, gate hint, History tab, drill-down filters, breakpoints, V-01…20 |
| [tests.md](tests.md) | UNIT / API / INT / UI / STY / MIG / PERF / E2E plan, AC traceability, responsive matrix, commands and results |
| [issues.md](issues.md) | The seven GitHub Issues #52 – #58 and the handout coverage map |
| [reviewer.md](reviewer.md) | Peer review record |
| [ai-use.md](ai-use.md) | LLM, key prompts, reflection |

---

## Submission map

One PDF with **Answer Part 1** … **Answer Part 9** in order (handout §14). Answer pages are added by Issue #58.

| Part | Points | Content | Source |
| --- | --- | --- | --- |
| 1 | 10 | Git workflow, Kanban, reviewer.md, README, `.gitignore`, directory structure | answer page + [reviewer.md](reviewer.md) |
| 2 | 5 | Spec DD, with evidence that the contract merged before the implementation PRs | answer page + [specification.md](specification.md) |
| 3 | 10 | Test DD, traceability, passing output from `main` | answer page + [tests.md](tests.md) |
| 4 | 5 | AI use with reflection | [ai-use.md](ai-use.md) |
| 5 | 5 | IT Staff Dashboard, with metrics checked against SQL (INT-01) | answer page, `artifacts/lab-04/screenshots/staff-dashboard/` |
| 6 | 10 | Actions Taken UI | answer page, `artifacts/lab-04/screenshots/actions-taken/` |
| 7 | 5 | Ticket workflow | answer page, `artifacts/lab-04/screenshots/workflow/` |
| 8 | 5 | Requester Dashboard and final regression | answer page, `artifacts/lab-04/screenshots/{requester-dashboard,regression}/` |
| 9 | 5 | Zen Green, responsive, accessibility, final polish | answer page + [ui-spec.md](ui-spec.md) §5 |
