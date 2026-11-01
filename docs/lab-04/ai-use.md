# Lab 4 — AI Use and Reflection

Answer Part 4 deliverable for CPE334 Lab 4.

---

## 1. Environment and LLM Info

| Field | Detail |
| --- | --- |
| Agent / Tool | Claude Code (desktop app) |
| LLM used | Claude Opus 5.5 |
| Thinking level | High for specification and design decisions; Medium for implementation |
| Student name | Thawat Boonsuk |
| Student ID | 67070501024 |

---

## 2. Key Prompts

Six to ten prompts that materially shaped the sprint. Rows are added as the sprint progresses; the Issue column refers to the Lab 4 Kanban issues #52 – #58.

| # | Phase | Issue | Prompt (summary or verbatim) | AI Output | How I Used / Adjusted It |
| --- | --- | --- | --- | --- | --- |
| P-01 | Planning | — | "Read lab 4 in `docs/lab-04` and split it into the Issues we need" | Read `SE+Lab+4.pdf` and the Lab 3 issue format, then proposed seven Issues (#52 – #58) with a dependency order and a handout-section → Issue coverage map in `issues.md`. It flagged that grading Part 6 mentions assign / complete / cancel / inactive-assignee for Actions Taken, while the field list has no assignee or status | |
| P-02 | Planning | — | "Write copy-paste text for opening the Issues" | Title and body for each of the seven Issues, with "Depends on" written as Issue names so they could be opened before the numbers were known | Opened #52 – #58 on GitHub; the numbers matched the plan |
| P-03 | Spec generation | #52 | "Start writing the #52 spec" | `specification.md` (FR-01…14, BR-01…31, metric table, AC-01…31, DB-01…05, AD-01…12), `api-spec.md`, `ui-spec.md`, `tests.md`. Read the Lab 3 contract and the code first, so it continues Lab 3's numbering conventions and reuses `ticketWorkflow.ts`, the queue parser and the badge set | ผมได้อ่านตามคำแนะนำของ AI และตัดสินใจดังนี้:<br>- AD-01 assign/complete/cancel เป็นของ follow-up (assignee ต้องเป็น IT Staff ที่ active)<br>- AD-04 Resolve ได้เมื่อมี owner, Action หลัง Reopen ล่าสุด >= 1 และไม่มี follow-up ค้าง<br>- AD-02 Admin เขียน Actions Taken ได้ แต่ยังแก้ status/owner/IT Priority ไม่ได้<br>- DB-02/AD-07 ใช้ version แทน updatedAt กันแก้ทับ; ใน endpoint Lab 3 ไม่บังคับส่ง<br>- AD-08 dashboard ไม่นับตามช่วงเวลา ใช้ 5 รายการล่าสุด เพราะ seed ใช้วันที่ตายตัว<br>- BR-31 ทุก role เข้า /dashboard หลัง login<br>- เพิ่ม Requester "Ploy" ที่ไม่มี Ticket ไว้โชว์ dashboard ค่า 0 |
| P-04 | Implementation | #53 | "Do #53 — and importantly, never run git commands that change state; give me the commands" | Schema, additive migration with a rollback script, the Actions API with `version` and `clientRequestId`, the seed (zero / one / many Actions, Ploy with no Tickets), unit and API tests, and database scripts for the migration and the CHECK constraints. Every commit, push and PR description was handed over as text | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-05 | Review fix | #53 | Relayed the reviewer's comment on PR #60: `actionAt` rounded `createdAt` down to the minute | Confirmed the 59-second hole, changed the rule to an exact comparison, added five boundary tests and checked that reinstating the rounding makes three of them fail; moved the minute precision to the UI's `min`, rounded up | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-06 | Implementation | #54 | "Next is #54" with the Issue text | The Actions Taken tab (table / cards, create / view / edit, follow-up dialogs, stale Reload), the Requester's read-only view, Bangkok date helpers, E2E-01/02 and screenshots. A deliberate mutation showed the double-click test did not exercise the ref guard, so a same-tick test was added | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-07 | Review fix | #54 / #55 | Relayed the reviews of PR #61 (403 shown as a network error) and PR #62 (Reload clearing the stale state even when it failed) | Separate Forbidden / Not found / safe-failure states without Retry where retrying cannot help; the stale state kept until the latest ticket actually loads; tests for each failure and a re-run of all suites | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-08 | Implementation | #55 | "Next is #55" with the Issue text | Resolution gate, version check as a conditional write in one transaction with the history row, Cancel cancelling follow-ups, History tab, gate hint; an INT-02 script racing two real requests on PostgreSQL | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-09 | Implementation | #56 | "Next is #56" with the Issue text | One definition per dashboard card (count + drill-down link), both dashboard endpoints, URL-driven My Tickets, Queue drill-down chips; INT-01 comparing every number with hand-written SQL and following every card into its list | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |
| P-10 | Hardening / release | #57 / #58 | "Do #57", then the review of PR #64 (double submit on confirmations, tablet / mobile checklist), then "#58" | A shared single-submit guard (five forms had sent twice), one dialog frame with a focus trap, Bangkok dates on Lab 2/3 screens, STY-01 … STY-04 and an overlap test at three widths; for release, evidence re-captured on a fresh database, answer pages and the PDF build | ไม่มีปัญหา ผมปล่อยให้มัน Run ตามแผน และแก้ตาม Reviewer |

---

## 3. My Reflection

โดยรวมแล้วส่วนที่ยากคือช่วงวางแผนอย่างรัดกุมในช่วงแรก แล้วหลังจากนั้นก็ใช้แผนเป็น Base หลักยึด แม้จะมีปัญหาจาก Reviewer ก็สามารถแก้ได้อย่างไม่มีลำบากมากนักจนจบ lab 4
