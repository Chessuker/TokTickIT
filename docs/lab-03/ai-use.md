# Lab 3 — AI Use and Reflection

Answer Part 4 deliverable for CPE334 Lab 3.

---

## 1. Environment and LLM Info

| Field | Detail |
| --- | --- |
| Agent / Tool | Claude Code (desktop app) |
| LLM used | Claude Opus 5 for specification and planning; Claude Sonnet 5 for implementation issues |
| Thinking level | High for specification and design decisions; Medium for implementation |
| Student name | Thawat Boonsuk |
| Student ID | 67070501024 |

---

## 2. Key Prompts

Six to ten prompts that materially shaped the sprint. Rows are added as the sprint progresses; the Issue column refers to the Lab 3 Kanban issues.

| # | Phase | Issue | Prompt (summary or verbatim) | AI Output | How I Used / Adjusted It |
| --- | --- | --- | --- | --- | --- |
| P-01 | Planning | contract | "Read `Lab_3_sheet.pdf` and make a plan." The agent mapped the Lab 2 server, client, docs and git flow with two read-only explorer agents, then asked four questions before planning: session store vs JWT, how much ticket access an Administrator gets, whether to plan the whole sprint or only the contract, and solo vs team | A phased sprint plan: data-model rename of `RequesterUser` → `User`, DB-backed session cookie, two tables for comments vs notes, a transition matrix, seven Issues, and a decision to hand each implementation Issue to a fresh session | Chose the session table over JWT (logout must really revoke), read-only Administrator (keeps the two roles separate as the handout asks), and one plan for the whole sprint executed in phases |
| P-02 | Spec generation | contract | Write `specification.md` in the Lab 2 layout: keep the handout's BR-01…05 and AC-01…04 verbatim, number the rest, include the authorization matrix and a full status transition matrix | FR-01…14, BR-01…30, AC-01…34, AD-01…14, seed plan, migration steps | _review notes to be added after the student's own pass_ |
| P-03 | API contract | contract | Write `api-spec.md` extending Lab 2: cookie conventions, error codes, one subsection per endpoint, map each endpoint to API test ids | 22 endpoint sections; `permittedTransitions` returned by the server so the client never encodes the matrix | |
| P-04 | UI spec | contract | Write `ui-spec.md`: badges for eight statuses / IT priority / roles, Public-vs-Internal visual rule, five new screens with modes and feedback states, V-01…14 | | |
| P-05 | Test plan | contract | Write `tests.md` before code: keep the handout's API-01 / API-08 / E2E-02 ids, cover every AC with at least one test, list real file paths | UNIT-01…07, API-01…48, UI-01…25, E2E-01…07, traceability matrix | |
| P-06 | | | | | |

---

## 3. My Reflection

_To be written at the end of the sprint. Prompts to answer:_

- **Specification agent:** what did it get right first time, what did I have to correct, and did asking the four planning questions up front save rework later?
- **Coding agent:** did handing each Issue to a separate session with only the contract as context produce code that matched the contract, or did the agent invent rules?
- **Where AI was wrong:** at least one concrete example and how the tests or review caught it.
- **What I would do differently next sprint.**
