# Lab 3 — Documentation Index

Repository: <https://github.com/Chessuker/TokTickIT> · Sprint 3 branch flow: `feature/<issue>-<slug>` → `lab3-staging` → `main`

---

## Submission map

The lab sheet asks for one PDF with the headings **Answer Part 1** through **Answer Part 9** in that exact order. Each row names the file rendered under that heading; `build-submission-pdf.mjs` assembles them into `CPE334-Lab3-67070501024-Thawat.pdf`.

| Part | Points | Heading content | File |
| --- | --- | --- | --- |
| 1 | 10 | Git use with engineering workflow | `answer-part1-git-workflow.md` + rendered [reviewer.md](reviewer.md) |
| 2 | 5 | Spec DD | `answer-part2-spec-evidence.md` + rendered [specification.md](specification.md) |
| 3 | 10 | Test DD and traceability | `answer-part3-test-runs.md` + rendered [tests.md](tests.md) |
| 4 | 5 | AI use with reflection | [ai-use.md](ai-use.md) |
| 5 | 5 | Working Login and Password Change UI | `answer-part5-authentication.md` |
| 6 | 5 | Working IT Staff Ticket Queue UI | `answer-part6-staff-queue.md` |
| 7 | 10 | Working IT Staff Ticket Detail UI (incl. direct-API authorization evidence) | `answer-part7-staff-ticket-detail.md` |
| 8 | 5 | Working Administrator User Management UI | `answer-part8-user-management.md` |
| 9 | 5 | Zen Green UI and responsive evidence | `answer-part9-responsive.md` + rendered [ui-spec.md](ui-spec.md) |

---

## Source documents

| Document | What it holds |
| --- | --- |
| [specification.md](specification.md) | FR-01…14, BR-01…30, authorization matrix, transition matrix, AC-01…34, Definition of Done, AD-01…14 |
| [api-spec.md](api-spec.md) | Session cookie conventions, error codes, 22 endpoint sections, endpoint → test map |
| [ui-spec.md](ui-spec.md) | Badges, Public-vs-Internal rule, shell and five screens with modes and feedback, V-01…14 |
| [tests.md](tests.md) | UNIT / API / UI / E2E plan, AC traceability, responsive checklist, commands and results |
| [issues.md](issues.md) | Draft bodies for the seven GitHub Issues |
| [reviewer.md](reviewer.md) | Peer review record |
| [ai-use.md](ai-use.md) | LLM, key prompts, reflection |

Screenshots for Parts 5–9 live under `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`.

---

## Regenerating the evidence

Everything in the answer pages is produced by a script, so it can be rebuilt from any commit — in particular on `main` after the release. From the repository root, with Docker up:

```bash
npm run prisma:migrate && npm run prisma:seed
node docs/lab-03/scripts/capture-evidence.mjs            # Parts 5–8 demonstration screenshots
npm run prisma:seed
CAPTURE=1 npx playwright test e2e/lab-03/visual.spec.ts   # R-01 … R-22 responsive matrix (E2E-07)
npm run prisma:seed
node docs/lab-03/scripts/capture-api-authorization.mjs   # Part 7 direct-API transcript
node docs/lab-03/scripts/capture-test-runs.mjs           # all three suites → test-runs/*.txt + images
node docs/lab-03/build-submission-pdf.mjs                # the submission PDF
```

The seed runs between steps because the capture scripts change ticket and account state; the seed restores every seeded row (E2E-02 also changes Sarah's password). `capture-test-runs.mjs` accepts `--only=server|client|e2e` and `--render-only`.

