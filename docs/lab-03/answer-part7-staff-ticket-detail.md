# Answer Part 7 — Working IT Staff Ticket Detail UI

One ticket, followed from arrival to resolution. Jennifer Anderson (Requester) raised it with an attachment and a comment; Priya Raman (IT Staff) works it. Captured by [`scripts/capture-evidence.mjs`](scripts/capture-evidence.mjs); asserted by `e2e/lab-03/staff-ticket-flow.spec.ts` (E2E-04, E2E-05), `StaffTicketDetail.test.tsx` (UI-14 … UI-18), `staff-ticket-detail.api.test.ts` (API-31 … API-37) and `ticketWorkflow.test.ts` (UNIT-02, UNIT-03).

The status dropdown lists only what the server returns in `permittedTransitions`, computed from the same transition matrix that enforces the change — the client never encodes the workflow. The server is the rule; §9 shows it refusing every change the UI does not offer.

| Requirement | Section |
| --- | --- |
| Claim / reassign | §1, §3 |
| IT Priority | §2 |
| Permitted status changes (with confirmation) | §2, §4 |
| Validation and conflict | §3, §6 |
| Public Comments | §5 |
| Internal Notes | §6 |
| Attachment continuity | §7 |
| Requester resolution indication | §8 |
| Role restrictions | §8, §9 |
| Safe failure | §7 |
| Direct API authorization evidence | §9 |

---

## 1. New and unassigned → Claim

The read-only group (ticket, requester with email and department, requested priority, description) sits apart from the three operational controls. While unassigned, In Progress and Resolved are simply not offered, with the reason under the control. **Claim** makes Priya the owner and moves New → Open in one step (BR-31).

![Before: New, unassigned](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-01-new-unassigned.png)

![After Claim: owner Priya, Open](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-02-claimed.png)

## 2. IT Priority and a permitted status change

IT Priority moves to High; the requested priority stays Medium. With an owner, In Progress is now offered and applied.

![IT High, In Progress](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-03-it-priority-and-in-progress.png)

## 3. A real conflict, then reassignment

Unassigning an In Progress ticket is refused by the server (`409`, BR-31); the message appears under the control and the select snaps back to the real owner. Reassigning to Chen Wei takes the work away from the current owner, so it is confirmed first.

![Server 409 inline](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-04-conflict-inline.png)

![Reassign confirmation](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-05-reassign-confirm.png)

## 4. Resolved, Closed and Cancelled are confirmed

![Mark as Resolved?](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-06-resolve-confirm.png)

## 5. Public Comments

The requester's comment and the staff reply, newest first, each with name, role badge and time.

![Public Comments](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-07-public-comments.png)

## 6. Internal Notes — validation, then a note

An empty note is refused under the composer. The Internal Notes panel is amber with a lock icon and "Internal — not visible to the requester"; its composer and outlined button are never on screen at the same time as the public one.

![Empty note refused](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-08-note-validation.png)

![Note added](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-09-internal-note.png)

## 7. Attachment continuity and safe failure

The requester's file is listed and downloadable; removed files would show greyed with their reason. There is no upload area and no Remove control — and the API refuses both (§9).

![Attachments, read-only](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-10-attachments-read-only.png)

With the API unreachable, a change fails under its own control with a plain message; nothing else on the screen is lost.

![Safe failure on IT Priority](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-11-safe-failure.png)

## 8. The requester's indication, and the other two roles

Jennifer reports the problem appears resolved; Priya sees "Requester reports resolved" in the header (and a check icon in the queue row). The status does not change — that is IT Staff's decision (BR-05).

![Requester reports resolved](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-12-requester-resolved-indicator.png)

An Administrator sees the same ticket, notes included, with the controls rendered as values and both composers hidden (BR-17). Jennifer, even on her own ticket, is refused the staff route; her own view shows Priya's reply but never the note.

![Administrator — read-only](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-13-administrator-read-only.png)

![Requester — staff route refused](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-14-requester-forbidden.png)

![Requester's own view — reply visible, note absent](../../artifacts/lab-03/screenshots/staff-ticket-detail/p7-15-requester-view-no-notes.png)

---

## 9. Direct API authorization evidence

Hiding a control is feedback; the server is the rule. [`scripts/capture-api-authorization.mjs`](scripts/capture-api-authorization.mjs) goes around the UI and calls the endpoints directly — with no session, as a Requester, as IT Staff and as an Administrator — and records each request, the status the specification requires, the status returned and the body. **29 checks, all passed.** The verbatim transcript is [`test-runs/api-authorization.txt`](test-runs/api-authorization.txt):

![Direct API authorization transcript](../../artifacts/lab-03/screenshots/evidence/api-authorization.png)

| What it proves | Rule |
| --- | --- |
| No session → `401` before anything is read | BR-30, AC-12 |
| A Requester is refused every staff and admin route, including Internal Notes on her own ticket, with no note, count or existence hint | FR-04, BR-23, AC-04 |
| There is no route through which a Requester can set status | BR-05, AC-15 |
| Another requester's ticket is `403` with no ticket data | BR-14 |
| IT Staff cannot make a transition outside the matrix, enter In Progress without an owner, assign a Requester as owner, or add attachments | BR-15, BR-18, BR-19, BR-14 |
| An Administrator reads the ticket and its notes but every mutation is `403`; they cannot deactivate themselves | BR-17, BR-25 |
| The note's text is absent from every Requester-facing response | AC-23 |
