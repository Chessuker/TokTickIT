# Answer Part 2 — Spec-Driven Development

Link: [`docs/lab-03/specification.md`](specification.md) — rendered in full after this page, with its companions [`api-spec.md`](api-spec.md), [`ui-spec.md`](ui-spec.md) and [`tests.md`](tests.md).

---

## 1. What the specification contains

| Required by the lab sheet | Where |
| --- | --- |
| Numbered requirements | §4 — FR-01 … FR-14 (scope in §3) |
| Business rules | §5 — BR-01 … BR-31 (authentication, ownership and roles, status workflow, comments and notes, administrator safety, migration) |
| Authorization matrix or rules | §5 "Authorization matrix" — every operation × Requester / IT Staff / Administrator; §5 "Status workflow" — the transition matrix with the owner rule and the confirmations |
| Acceptance criteria | §9 — AC-01 … AC-34, each in Given / When / Then form and each traced to tests in tests.md §3 |
| Migration decisions | §7 "Data Changes" and "Migration strategy" — `RequesterUser` renamed to `User` in place so ids and ticket ownership survive; the documented initial password; `itPriority` copied from `priority`; the seed plan; verification procedure in AC-31 |
| Product Definition of Done | §10.1 (product) and §10.2 (course delivery), each item with its evidence |
| Design decisions | §11 — AD-01 … AD-14 (session table over JWT, two tables for comments vs notes, server-computed `permittedTransitions`, …) |

---

## 2. Evidence the specification came before the implementation

The contract was committed, reviewed and merged before the first line of Lab 3 implementation was committed:

```text
$ git log --format="%h %ad %s" --date=format:"%Y-%m-%d %H:%M" -- docs/lab-03/specification.md docs/lab-03/api-spec.md …
492dd30 2026-09-15 00:46 docs(lab-03): Sprint 3 engineering contract
39cabce 2026-09-15 15:30 docs(lab-03): fill GitHub Issue numbers #36-#42
8c84d4c 2026-09-18 12:37 docs(lab-03): address review on #43 — auth matrix, BR-31, BR-07/10/11, AC-31

$ git log --merges --first-parent lab3-staging
4ad5d2e 2026-09-18 12:52 Merge pull request #43 from Chessuker/feature/36-lab3-spec-docs     ← contract merged
05f2133 2026-09-19 12:32 Merge pull request #44 from Chessuker/feature/37-auth-foundation     ← first implementation merged

$ git log --format="%h %ad %s" -- server/src/auth.ts     # the first Lab 3 implementation file
35986d0 2026-09-18 21:26 feat(#37): authentication foundation — …                           ← first implementation commit
```

| Event | When |
| --- | --- |
| Contract first committed (`492dd30`) | 2026-09-15 00:46 |
| Contract revised after peer review on PR #43 (`8c84d4c`) | 2026-09-18 12:37 |
| **Contract merged into `lab3-staging` (PR [#43](https://github.com/Chessuker/TokTickIT/pull/43))** | **2026-09-18 12:52** |
| First implementation commit (`35986d0`, Issue #37) | 2026-09-18 21:26 |
| First implementation merged (PR [#44](https://github.com/Chessuker/TokTickIT/pull/44)) | 2026-09-19 12:32 |

Later implementation issues edited the specification only to record a decision made while building (each in the same PR as the code, and named in its description) — for example the status enum reordered into workflow order for `sort=status` (#39), and in the release issue the Cancelled badge colour, darkened after the contrast check measured it at 4.39:1.
