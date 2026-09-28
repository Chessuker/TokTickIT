# Lab 3 — AI Use and Reflection

Answer Part 4 deliverable for CPE334 Lab 3.

---

## 1. Environment and LLM Info

| Field | Detail |
| --- | --- |
| Agent / Tool | Claude Code (desktop app) |
| LLM used | Claude Opus 5 for specification, planning and Issues #37 – #41; Claude Opus 5.5 for Issue #42 (release) |
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
| P-06 | Implementation | #37 | "Read Issue #37 and implement it" in a fresh session with only the contract (specification.md, api-spec.md, ui-spec.md, tests.md) and the Lab 2 code as context | Hand-written migration renaming `RequesterUser` → `User` in place, `Session` table + cookie helpers, `requireAuth` / `requireRole` / `requireSession` middleware, the four `/api/auth` routes, in-memory login throttle, bcrypt seed for all roles, `verify-lab03-migration.ts`; client `AuthProvider`, `apiClient` (`credentials: 'include'`), `RequireAuth`, Login, Change Password, role-aware shell; Lab 2 suites moved from the header to the cookie; 210 server + 113 client tests green | Two adjustments from the contract while implementing: the seed gives David Lee a ready password (`Requester2!`) so the Lab 2 ownership E2E has two sign-in-able requesters (specification.md §7 updated), and the Lab 1 `SystemStatus` page was removed with `/api/users` because nothing else used it. MIG-01/02 and E2E-01…03 still need a PostgreSQL run to record |
| P-07 | Implementation | #38 | "Now start with issue 3 … if you need more, read `Lab_3_sheet.pdf`" — then, mid-sprint: "you may run git commands that only read, never ones that change anything; tell me the command and I will run it" (saved as a standing rule for every later session) | Comment and resolution-indication endpoints, `CommentsPanel`, shared `Badges.tsx`, `requester-comments.spec.ts`; later, a PR description and the git commands for me to run instead of running them itself | Caught that my new branch had been cut from a stale local `lab3-staging` without #37; after the git rule I ran every state-changing command myself. When the agent later broke the rule once (`git rm --cached` in #41) it said so unprompted and told me how to undo it |
| P-08 | Implementation | #39, #40 | "Continue to Issue 4 … give me the git setup first", then the same for Issue 5 | `queueQuery.ts`, the status-order migration, 24 seeded tickets; `ticketWorkflow.ts` with the matrix as data, the staff detail with per-control 409 handling, `ThreadPanel` shared by comments and notes, 40 comments and 13 notes in the seed | Accepted the reordered `TicketStatus` enum migration after checking it changes no rows; asked for PR descriptions I could paste, since `gh` is not installed |
| P-09 | Implementation | #41 | "Continue to Issue 6 (admin users) … don't touch git, just tell me the commands" | `/api/admin/*` with the self-deactivation and last-Administrator guards counted server-side, session revocation, `UserManagement` with both guards disabled *and* the 409 shown inline | Reviewed that deactivation deletes sessions and that a `password` field in the PATCH body is ignored; E2E accounts are unique per run because users are never deleted |
| P-10 | Release | #42 | "Issue 7 … reset the DB for me" → Prisma's own guard refused to reset without explicit consent → "yes, reset the local database (but back it up also)" | A `pg_dump` backup outside the repo, then the reset; `visual.spec.ts` (E2E-07) with measured focus, label and contrast checks; three capture scripts; the answer pages and this PDF | The measured checks found three real defects the eye had missed (below). I decided the Cancelled badge colour change and the error-handler change were in scope for a release issue |

---

## 3. My Reflection

**Specification agent.** เขียน Contract ให้เสร็จก่อน ทั้ง specification, API, UI และ test plan จากนั้นเริ่ม implementation ก็สามารถอ้างอิงเอกสารเหล่านี้ได้โดยตรง และเมื่อภายหลังเกิดปัญหาที่ขัดแย้งกับสิ่งที่ระบุไว้ก่อนหน้า ก็ใช้ contract เป็นตัวตัดสินได้ เช่น coding session ตั้งชื่อไฟล์ทดสอบ staff detail ว่า staff-ticket-ops.api.test.ts แต่ทั้ง contract และ lab sheet ระบุว่า staff-ticket-detail.api.test.ts ดังนั้นจึงยึดตาม contract ส่วนกรณีที่ specification agent ผิดนั้น มักเป็นสิ่งที่การวัดจริงเท่านั้นที่จะตรวจพบได้

**Coding agent.** ส่วนใหญ่ทำงานตาม Contact แบ่งเป็น Session ๆ ทำให้โค้ดที่ได้ทำตามได้ค่อนข้างใกล้เคียงมาก ทั้ง transition matrix, owner rule และ permittedTransitions ถูกสร้างออกมาตรงตาม specification จุดที่มันน่าเชื่อถือน้อยที่สุดคือกรณีที่การตรวจสอบสามารถ "ผ่านโดยบังเอิญ" ได้ง่าย เช่น ใน #39 มันตรวจสอบว่า "ไม่มี horizontal overflow" ด้วยการอ่านค่า body.scrollWidth ซึ่งไม่สามารถตรวจจับได้ว่า element ใดกำลังล้นออกไปนอก document

**Where AI was wrong, and what caught it.**
- JSON body ที่ malformed ทำให้ Express ส่ง HTML error page ที่มี stack trace และ absolute server paths ออกมา ซึ่งขัดกับ BR-30 พบปัญหานี้ขณะสร้างหลักฐานสำหรับ direct API จึงแก้ด้วย error handler ที่ส่ง response ในรูปแบบ envelope และเพิ่ม test ครอบคลุมกรณีนี้แล้ว
- พบ overflow bug สองจุดได้แก่ queue ที่ 820 px และ mobile header sheet ที่ 375 px ซึ่งผ่านการตรวจสอบก่อนหน้านี้ทั้งหมด แต่ล้มเหลวเมื่อรัน E2E-07 visual spec ครั้งแรก
- Test fixtures ที่ซ่อน bug: Prisma stub ที่คืนทุก field ที่ถูกส่งเข้าไปจะสามารถซ่อนปัญหา passwordHash รั่วออกมาได้ และ fake directory ที่ถูก shallow-copy ก็ทำให้การแก้ไขจาก test หนึ่งรั่วไหลไปยัง test ถัดไป ทั้งสองกรณีจึงถูกแก้เพื่อให้ test ตรวจสอบสิ่งที่มันอ้างว่ากำลังตรวจสอบจริง ๆ
- Date test สมมติว่าเครื่องใช้ locale ภาษาอังกฤษ และล้มเหลวบน Local ของผมซึ่งแสดงปีเป็น 2569

**Process.** Agent ละเมิดกฎ "read-only git" หนึ่งครั้งใน #41 โดยมันรายงานเรื่องนี้ด้วยตัวเองใน message เดียวกัน และให้ command สำหรับ undo การเปลี่ยนแปลงมาให้ แต่เหตุการณ์นี้ก็แสดงให้เห็นว่าทำไมกฎที่ว่า ฉันต้องการให้ทุกการเปลี่ยนแปลงใน repository ต้องผ่านมือของฉันเองเท่านั้น

**Next sprint.** นำ measured checks ต่าง ๆ เช่น overflow, focus, labels และ contrast เข้าไปอยู่ในแผนตั้งแต่ UI issue แรก แทนที่จะรอจนถึง release issue เพื่อให้ defect ถูกพบตั้งแต่ issue ที่เป็นต้นเหตุของมัน และยังคงใช้รูปแบบ one-issue-per-session ต่อไป เพราะมันช่วยให้การเปลี่ยนแปลงแต่ละส่วนสามารถ review ได้ง่าย
