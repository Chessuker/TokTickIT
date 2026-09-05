# Lab 2 — Documentation Index

Repository: <https://github.com/Chessuker/TokTickIT> · Final branch `main` at `9936b8c`

---

## Submission map

The lab sheet asks for one PDF with the headings **Answer Part 1** through **Answer Part 9** in that exact order. Each row below names the file to render under that heading.

| Part | Points | Heading content | File |
| --- | --- | --- | --- |
| 1 | 10 | Git use with engineering workflow | [answer-part1-git-workflow.md](answer-part1-git-workflow.md) + rendered [reviewer.md](reviewer.md) |
| 2 | 5 | Spec-driven development | [answer-part2-spec-evidence.md](answer-part2-spec-evidence.md) + rendered [specification.md](specification.md) |
| 3 | 10 | Test-driven development and traceability | [answer-part3-test-runs.md](answer-part3-test-runs.md) + rendered [tests.md](tests.md) |
| 4 | 5 | AI use with reflection | [ai-use.md](ai-use.md) |
| 5 | 0 | Development Requester selection screen | [answer-part5-requester-selector.md](answer-part5-requester-selector.md) — points graded inside Part 6 |
| 6 | 10 | Working Ticket screen — Create mode | [answer-part6-screenshots.md](answer-part6-screenshots.md) |
| 7 | 10 | Working My Tickets screen | [answer-part7-screenshots.md](answer-part7-screenshots.md) |
| 8 | 5 | Ticket detail and attachment lifecycle | [answer-part8-screenshots.md](answer-part8-screenshots.md) |
| 9 | 5 | Zen Green UI and responsive evidence | [answer-part9-screenshots.md](answer-part9-screenshots.md) + rendered [ui-spec.md](ui-spec.md) |

---

## Source documents

| Document | What it holds |
| --- | --- |
| [specification.md](specification.md) | FR-01…FR-08, BR-01…BR-13, AC-01…AC-15, Definition of Done, assumptions |
| [api-spec.md](api-spec.md) | Endpoint contract, error envelope, validation orders, resolved decisions |
| [ui-spec.md](ui-spec.md) | Zen Green tokens, component rules, screen specs, breakpoints, V-01…V-10 |
| [tests.md](tests.md) | Planned tests, AC traceability, responsive checklist, final run on `main` |
| [ai-use.md](ai-use.md) | LLM used, ten key prompts, reflection |
| [reviewer.md](reviewer.md) | Peer review: identity, PR links, comments, responses, approvals |

## Evidence

| Path | What it is |
| --- | --- |
| [`test-runs/`](test-runs/) | Verbatim output of the three test commands, plus the git graph and the directory listing. Each log opens with the branch and commit it ran against |
| [`screenshots/`](screenshots/) | Every captured screen, plus the capture scripts that produced them |

The capture scripts are re-runnable against a live stack, so any screenshot can be regenerated rather than retaken by hand:

```bash
docker compose up -d && npm run prisma:migrate && npm run prisma:seed
```

```bash
node docs/lab-02/screenshots/capture-issue7.mjs
```

---

## Submission checklist

Everything the lab sheet asks for is in the repository. Nothing is outstanding.

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Commit history showing feature → staging → main | [answer-part1](answer-part1-git-workflow.md) §1 |
| 2 | Kanban with every issue in Done | [answer-part1](answer-part1-git-workflow.md) §2 |
| 3 | Peer review with identity, PR links, comments, approvals | [reviewer.md](reviewer.md) |
| 4 | README and `.gitignore` content | [answer-part1](answer-part1-git-workflow.md) §4 and §5 |
| 5 | Directory structure | [answer-part1](answer-part1-git-workflow.md) §6 |
| 6 | Spec pre-dating the implementation PRs | [answer-part2](answer-part2-spec-evidence.md) §2 |
| 7 | Passing test output from `main` | [answer-part3](answer-part3-test-runs.md) |

One optional tidy-up: the README's Tests section still quotes the Lab 1 counts
("7 backend / 3 frontend tests"). The real figure on `main` is 130 backend, 80
frontend and 16 end-to-end. Updating it means re-taking
[`README-screenshot.png`](screenshots/README-screenshot.png) so the two agree.
