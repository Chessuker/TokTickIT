# Answer Part 2 — Spec-Driven Development Evidence

The specification is [`docs/lab-02/specification.md`](specification.md), submitted rendered alongside this part. Its companions are [`api-spec.md`](api-spec.md) for the API contract and [`ui-spec.md`](ui-spec.md) for the visual and screen-level rules.

---

## 1. Numbered requirements, rules and criteria

Everything in the specification is numbered, and the numbering is what the rest of the sprint hangs off. Test names, commit messages, PR descriptions and source comments all cite these identifiers, so it is always possible to ask which requirement a line of code exists for.

| Series | Count | What it covers |
| --- | --- | --- |
| FR-01 … FR-08 | 8 | Functional requirements: create a ticket, requester context, list, detail, attachments, change requester, resilient failure, seed data |
| BR-01 … BR-13 | 13 | Business rules: ticket-number format, server-owned status, ownership protection, the three attachment rules, the three soft-removal rules, requester directory rules |
| AC-01 … AC-15 | 15 | Acceptance criteria in Given/When/Then form |

The Definition of Done is section 10 of the specification, and section 11 records the assumptions and decisions taken along the way rather than leaving them implicit.

---

## 2. The specification existed before implementation

The specification was written and merged first. This is not a claim about intent — it is in the commit history:

| Event | Commit | Date |
| --- | --- | --- |
| `specification.md`, `ui-spec.md` and `tests.md` first committed | `5096b1d` | **2026-08-22** |
| Spec and test-plan PR [#26](https://github.com/Chessuker/TokTickIT/pull/26) merged | `7a9224c` | **2026-08-23** |
| First implementation PR — ticket creation, [#29](https://github.com/Chessuker/TokTickIT/pull/29) | `7f597a1` | 2026-08-29 |
| Last implementation PR — UI and E2E, [#32](https://github.com/Chessuker/TokTickIT/pull/32) | `229659e` | 2026-09-05 |

Six days separate the merged specification from the first implementation PR, and every implementation PR lands after it.

Verify it directly:

```bash
git log --diff-filter=A --format="%h %ad %s" --date=short -- docs/lab-02/specification.md
```

```bash
git log --oneline --merges --date=short --format="%h %ad %s" origin/main
```

The two pull requests side by side are the proof. The specification PR:

![PR #26 — specification and test plan](screenshots/pr-approval-%2326.png)

and the first implementation PR, merged six days later:

![PR #29 — ticket creation](screenshots/pr-approval-%2329.png)

PR #26 carries only documentation — `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` —
and it was merged before any endpoint, component or test file existed. Everything in PR #29 was
written against criteria that were already fixed and already reviewed.

---

## 3. How the specification was actually used

Three places where writing it first changed the code rather than merely describing it.

**The API contract fixed the error envelope before any route existed.** [`api-spec.md`](api-spec.md) §1.2 defines one shape for every non-2xx response and a table mapping each error code to its status. `server/src/httpErrors.ts` is that table in code, and it is the only way a route can answer an error — which is what makes "the code disagrees with the spec" a reviewable claim instead of an opinion. It became one during peer review on Issue #6: an upload that broke two rules at once returned `413` where the spec's ordered validation table says `415` wins. The fix and its regression tests are recorded in [tests.md](tests.md) §5.

**The acceptance criteria decided the test plan before the tests.** [`tests.md`](tests.md) §2 was written in the same PR as the specification, one row per planned test naming the AC it covers and the file it would eventually live in. The traceability matrix in §3 then caught that AC-15 had no API-level coverage, which is why API-13 exists.

**Open questions stayed open instead of being guessed.** [`api-spec.md`](api-spec.md) §6 lists the decisions that were not settled at specification time — attachment storage, whether search should match category names, rate limiting, cache headers — as explicit TBDs. Each was resolved in the issue that needed it, with the reasoning recorded in place. API-D-01 became "local disk under `server/uploads/`, uuid file names" during Issue #6; API-D-02 became "no, `search` covers summary, description and ticket number only" during Issue #5.

---

## 4. Scope held

Section 3 of the specification lists what is excluded, and the exclusions survived the sprint. The ticket status enum still has exactly one value, `New`, because the status lifecycle is another sprint's work; the detail screen has no comments, internal notes or status control for the same reason. `TicketStatus` in `schema.prisma` carries a comment saying so, so the next person to open it does not read a one-value enum as an oversight.
