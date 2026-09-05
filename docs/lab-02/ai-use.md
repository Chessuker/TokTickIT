# Lab 2 — AI Use and Reflection

Answer Part 4 deliverable for CPE334 Lab 2.

---

## 1. Environment and LLM Info

| Field | Detail |
| --- | --- |
| Agent / Tool | Claude Code |
| LLM used | Claude Opus 5, NotebookLM + Gemini Flash 3.7 |
| Thinking level | High for specification, planning and debugging; Medium for implementation |
| Student name | Thawat Boonsuk |
| Student ID | 67070501024 |

---

## 2. Key Prompts

Ten prompts that materially shaped the sprint, grouped by phase. The Issue column refers to the GitHub Kanban issues #1–#7.

| # | Phase | Issue | Prompt (summary or verbatim) | AI Output | How I Used / Adjusted It |
| --- | --- | --- | --- | --- | --- |
| P-01 | Spec Generation | #1 | Turn the lab sheet's requester ticketing brief into a written specification: functional requirements, business rules and acceptance criteria, each one numbered so tests can cite it | `specification.md` with FR-01…FR-08, BR-01…BR-13 and AC-01…AC-15 | Kept the numbering scheme, which every later document and test name references. Cut the status-lifecycle requirements: only `New` is reachable this sprint, so requirements about later statuses would have been specification for code nobody was writing |
| P-02 | Spec Generation | #1 | Write the API contract from the specification: every endpoint, its status codes, and one error envelope shared by all of them | `api-spec.md` §1–§6, including the ordered validation table for uploads | Fixed the error shape before any route existed, which is what made "the code disagrees with the spec" a reviewable claim later. Left several open decisions as explicit TBDs rather than guessing |
| P-03 | Test Creation | #1 | Plan the tests before the code: one row per test with its ID, the AC it covers, the file it will live in, and its expected result | `tests.md` §2 planned-test table and the AC traceability matrix | This became the sprint's checklist. Every issue since has been "make these rows say Pass". The traceability matrix caught that AC-15 had no API-level test, so API-13 was added |
| P-04 | Implementation | #2 | Design the Prisma schema for tickets, attachments and the requester directory, with a seed that can run repeatedly without duplicating rows | `schema.prisma` plus a seed built entirely from `upsert` | Kept the soft-removal columns on `Attachment` from the start, which is why Issue #6 needed no migration. Made the seed test assert that only `upsert` is ever called, so a future `create` fails the suite instead of silently duplicating |
| P-05 | Implementation | #4 | Build the create-ticket endpoint and form, with the ticket number generated server-side and the form keeping the user's input when the backend fails | `POST /api/tickets` with a transactional number generator, and a form that preserves state on failure | Asked for the collision retry after seeing the generator read-then-write outside a transaction. The "keep the values on failure" behaviour is AC-12 and it needed to be asked for explicitly — the first version cleared the form |
| P-06 | Implementation | #5 | Build the My Tickets list where search, filter, sort and pagination are all server-side query parameters, with the empty state and the no-results state as separate screens | `GET /api/tickets` with the ownership clause written from the header, and a list component that re-fetches on every control change | The two zero-result states were the part worth insisting on: an early version showed one message for both, which loses the distinction AC-15 exists to make |
| P-07 | Implementation | #6 | Build the read-only ticket detail screen and the attachment lifecycle: upload, download, soft removal with a mandatory reason, and ownership protection | Five endpoints, the detail screen, and 37 new tests | Rejected rendering the read-only fields as disabled inputs. A greyed-out input still reads as "editable, but not now", which is the wrong promise on a screen where nothing is ever editable, so the fields became a definition list |
| P-08 | Debugging / Refactoring | #6 | My reviewer says an oversized file of a disallowed type returns 413 when the spec says 415 — fix the check order | Diagnosis that the ordering in the route was already correct and the real cause was `multer`'s `limits.fileSize` aborting the request before anything could read the content | This is the prompt I learned the most from. The obvious fix — swapping two `if` blocks — would have changed nothing. The fix was a storage engine that keeps the first 5 MB + 1 bytes and counts the rest, so both checks have what they need |
| P-09 | Debugging / Refactoring | #7 | Check the UI against the Zen Green spec at all three breakpoints by measuring the page, not by looking at screenshots | A script reading body scroll width, element clipping, control labelling, button heights and computed contrast ratios at 1280, 820 and 375 px | Measuring instead of eyeballing found five real problems I would not have noticed by scrolling through screenshots, including a table whose ticket numbers ran under the date column at tablet width |
| P-10 | Completion Review | #7 | Write the two missing end-to-end journeys and get all four suites green on `main` | `create-ticket.spec.ts` and `requester-context.spec.ts`, and the final 226-test run | Asked for the create flow to thread the server-generated ticket number through three screens rather than asserting each screen separately. If the number matches on all three, the ticket was really persisted |

---

## 3. My Reflection

**What worked well**

Writing the specification first turned out to be the thing that made the AI useful rather than merely fast. Because `api-spec.md` fixed every status code and the exact order the upload validations run in, I could point at a specific line and say the code disagrees with it. Without that document the peer review comment about 413 versus 415 would have been an opinion; with it, it was a defect with an address.

The other thing that worked was making the AI produce evidence instead of claims. Asking it to measure the page — body scroll width against viewport width, every element's scroll width against its client width, computed contrast ratios — gave me numbers I could put in the checklist. "Looks fine on mobile" is not a test result. 375 px body width in a 375 px viewport is.

**Where the AI got it wrong**

The upload bug is the clearest case. My reviewer found that a file that was both too large and the wrong type came back as 413 when the spec says the more specific 415 wins. The route's check order had been correct since the day it was written. What nobody noticed, me included, was that `multer` was configured with a size limit that killed the request before the route ever saw the file's contents. The AI wrote that configuration, wrote a comment explaining why it was correct, and wrote tests that passed — because each test broke only one rule at a time. It took a human reading the spec to find the combination nobody had tested.

Smaller version of the same thing: the first pass at the read-only detail screen rendered the ticket fields as disabled inputs. It satisfies "not editable" and it fails what AC-05 is actually about.

**How Spec-Driven Development changed the way I used AI**

It moved the argument earlier. Instead of reviewing generated code and asking whether it looked right, I was reviewing a specification and asking whether it said the right thing — and once it did, the code either matched or it did not. The numbered acceptance criteria are what made this work in practice: every test file, every commit message and every PR description cites AC or BR numbers, so it is always obvious which requirement a change is supposed to satisfy and which test would notice if it stopped.

It also changed what I ask for. I stopped asking for features and started asking for the failing case: not "add file upload" but "reject a 6 MB PDF with 413 and a renamed executable with 415". The second prompt produces code and tests that are about the same thing.

**What I would do differently next time**

Test the combinations, not just the cases. Every individual rule in the upload path had a test and every one of them passed. The bug lived in the interaction between two rules, which is exactly where the test plan had no row. Next sprint I would add a line to the test plan for any endpoint with more than one validation: at least one test that breaks two rules at once and asserts which error wins.

I would also run the responsive measurements earlier than the last issue. Three of the five things that pass found — the tablet form, the header wrapping, the table's column widths — had been wrong since the screen was first built, and fixing them at the end meant re-capturing every screenshot.
