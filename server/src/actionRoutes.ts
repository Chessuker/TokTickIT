/**
 * Actions Taken routes for IT Staff and Administrators (Lab 4 api-spec.md
 * §3.1, §3.3, §3.4 — FR-01 … FR-04).
 *
 * Mounted by `staffRoutes.ts` at `/api/staff/tickets/:id/actions`, behind the
 * staff router's `requireAuth` + `requireRole('ITStaff', 'Administrator')`, so
 * a Requester is refused before any lookup. Unlike the Lab 3 ticket
 * operations there is no `staffOnly` here: Administrators may record and edit
 * Actions (AD-02).
 *
 * The rules themselves live in `actionRules.ts`; these handlers load rows, ask
 * the rules, check the two things that need the database (active assignee,
 * current version), and write.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from './db.js';
import { getSessionUser } from './auth.js';
import { sendError, sendInternalError, sendValidationFailed } from './httpErrors.js';
import {
  ACTION_ORDER_BY,
  ACTION_SELECT,
  isActionLocked,
  readClientRequestId,
  toActionResponse,
  validateActionCreate,
  validateActionPatch
} from './actionRules.js';
import type { ActionRow } from './actionRules.js';
import { statusLabel } from './ticketWorkflow.js';
import type { TicketStatusValue } from './ticketWorkflow.js';

export const staffActionsRouter = Router({ mergeParams: true });

/** The parent route's `:id`; `mergeParams` merges it in, but its type does not say so. */
function ticketIdOf(req: Request): string {
  return String((req.params as Record<string, string>).id);
}

/** Every Action of one ticket in BR-11 order; shared with the Requester route. */
export async function listTicketActions(ticketId: string) {
  const rows = await prisma.ticketAction.findMany({
    where: { ticketId },
    orderBy: ACTION_ORDER_BY,
    select: ACTION_SELECT
  });
  return rows.map((row) => toActionResponse(row as ActionRow));
}

interface ActionTicket {
  id: string;
  status: TicketStatusValue;
  createdAt: Date;
}

/** The three columns the Action rules need; answers `404` itself. */
async function loadActionTicket(res: Response, ticketId: string): Promise<ActionTicket | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    select: { id: true, status: true, createdAt: true }
  });

  if (!ticket) {
    sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
    return null;
  }

  return ticket as ActionTicket;
}

/** BR-09: answers `409 TICKET_LOCKED` itself and returns `true` when it did. */
function refuseIfLocked(res: Response, status: TicketStatusValue): boolean {
  if (!isActionLocked(status)) return false;

  sendError(
    res,
    409,
    'TICKET_LOCKED',
    `This ticket is ${statusLabel(status).toLowerCase()}. Reopen it to record more work.`
  );
  return true;
}

/**
 * BR-06: a follow-up goes to an active IT Staff member and nobody else. A
 * Requester, an Administrator, an inactive member and an unknown id all get
 * the same `400`, so the answer says nothing about which accounts exist.
 */
async function refuseIfNotAssignable(res: Response, assigneeId: string | null): Promise<boolean> {
  if (assigneeId === null) return false;

  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, role: 'ITStaff', isActive: true },
    select: { id: true }
  });

  if (assignee) return false;

  sendValidationFailed(res, {
    followUpAssigneeId: 'The follow-up must be assigned to an active IT Staff member.'
  });
  return true;
}

/**
 * BR-10: a create that carries a `clientRequestId` already used. The same
 * user on the same ticket gets the Action that request created (`200`, nothing
 * written), so a retry after a lost response is harmless; anyone else gets
 * `409`. Returns `true` when it answered.
 */
async function answerReplay(
  res: Response,
  clientRequestId: string,
  ticketId: string,
  callerId: string
): Promise<boolean> {
  const existing = await prisma.ticketAction.findUnique({
    where: { clientRequestId },
    select: { ...ACTION_SELECT, performedById: true }
  });

  if (!existing) return false;

  if (existing.performedById !== callerId || existing.ticketId !== ticketId) {
    sendError(res, 409, 'CONFLICT', 'This request id has already been used.');
    return true;
  }

  const { performedById: _performedById, ...row } = existing;
  res.status(200).json(toActionResponse(row as ActionRow));
  return true;
}

/** Prisma `P2002` on `clientRequestId`: two identical creates raced (BR-10). */
function isClientRequestIdCollision(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!candidate || candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes('clientRequestId');
  return typeof target === 'string' ? target.includes('clientRequestId') : false;
}

/** `409 STALE_UPDATE` with the version the caller should reload (BR-19). */
function sendStale(res: Response, version: number) {
  sendError(
    res,
    409,
    'STALE_UPDATE',
    'Someone else changed this action after you opened it. Reload to see the latest version.',
    undefined,
    { current: { version } }
  );
}

// GET /api/staff/tickets/:id/actions — the ticket's work log (api-spec.md
// §3.1, BR-11, AC-11). No pagination: a ticket's log is short.
staffActionsRouter.get('/', async (req, res) => {
  try {
    const ticket = await loadActionTicket(res, ticketIdOf(req));
    if (!ticket) return;

    res.json({ data: await listTicketActions(ticket.id) });
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/tickets/:id/actions', error);
  }
});

// POST /api/staff/tickets/:id/actions — record one Action Taken (api-spec.md
// §3.3, BR-01 … BR-06, BR-09, BR-10, BR-12, AC-01, AC-04, AC-05, AC-10).
//
// Order of checks (api-spec.md §3.3): ticket → replay → lock → body →
// assignee. The replay comes before the lock and the body so that a retry of a
// request that already succeeded always gets the same answer, even if the
// ticket has since been resolved.
staffActionsRouter.post('/', async (req, res) => {
  try {
    const ticket = await loadActionTicket(res, ticketIdOf(req));
    if (!ticket) return;

    const caller = getSessionUser(res);
    const clientRequestId = readClientRequestId(req.body);

    if (clientRequestId && (await answerReplay(res, clientRequestId, ticket.id, caller.id))) return;

    if (refuseIfLocked(res, ticket.status)) return;

    const check = validateActionCreate(req.body, { ticketCreatedAt: ticket.createdAt, now: new Date() });
    if (!check.ok) {
      sendValidationFailed(res, check.fields);
      return;
    }

    const { followUp, ...value } = check.value;
    if (await refuseIfNotAssignable(res, followUp?.assigneeId ?? null)) return;

    try {
      // Performed by and the ticket come from the session and the URL, never
      // the body (BR-01, BR-03). The ticket's `updatedAt` is touched so it
      // reads as recently updated; its `version` is not (BR-12).
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.ticketAction.create({
          data: {
            ticketId: ticket.id,
            performedById: caller.id,
            actionAt: value.actionAt,
            description: value.description,
            result: value.result,
            attachmentNotes: value.attachmentNotes,
            clientRequestId: value.clientRequestId,
            ...(followUp
              ? {
                  followUpRequired: true,
                  followUpNote: followUp.note,
                  followUpAssigneeId: followUp.assigneeId,
                  followUpStatus: 'Open' as const
                }
              : { followUpRequired: false })
          },
          select: ACTION_SELECT
        });

        await tx.ticket.update({
          where: { id: ticket.id },
          data: { updatedAt: new Date() },
          select: { id: true }
        });

        return row;
      });

      res.status(201).json(toActionResponse(created as ActionRow));
    } catch (error) {
      // Two identical requests raced past the replay check; the unique index
      // let one through. Answer the loser exactly as a replay (api-spec §3.3.1).
      if (clientRequestId && isClientRequestIdCollision(error)) {
        if (await answerReplay(res, clientRequestId, ticket.id, caller.id)) return;
      }
      throw error;
    }
  } catch (error) {
    sendInternalError(res, 'POST /api/staff/tickets/:id/actions', error);
  }
});

// PATCH /api/staff/tickets/:id/actions/:actionId — edit an Action, or open,
// reassign, complete or cancel its follow-up (api-spec.md §3.4, BR-03,
// BR-05 … BR-09, BR-12, BR-19, AC-06, AC-07, AC-09).
//
// Order of checks: ticket and Action → lock → body (400) → version (409
// STALE_UPDATE) → follow-up state (409 CONFLICT) → assignee (400) → a write
// conditional on the version, so a race lost between the check and the write
// is also a STALE_UPDATE rather than a silent overwrite.
staffActionsRouter.patch('/:actionId', async (req, res) => {
  try {
    const ticket = await loadActionTicket(res, ticketIdOf(req));
    if (!ticket) return;

    // Scoped to the ticket in the URL: an Action id from another ticket is
    // simply not found here (BR-01).
    const existing = await prisma.ticketAction.findFirst({
      where: { id: String(req.params.actionId), ticketId: ticket.id },
      select: { id: true, version: true, followUpRequired: true, followUpStatus: true }
    });

    if (!existing) {
      sendError(res, 404, 'NOT_FOUND', 'Action not found.');
      return;
    }

    if (refuseIfLocked(res, ticket.status)) return;

    const check = validateActionPatch(req.body, existing, { ticketCreatedAt: ticket.createdAt, now: new Date() });

    if (!check.ok && check.kind === 'invalid') {
      sendValidationFailed(res, check.fields);
      return;
    }
    if (!check.ok && check.kind === 'empty') {
      sendError(res, 400, 'VALIDATION_FAILED', 'Nothing to update.');
      return;
    }

    // A stale caller is told so before anything about the follow-up's state:
    // whatever they are trying to do was decided on an old copy, and "reload"
    // is the one answer that always helps.
    const expectedVersion = (req.body as { version: number }).version;
    if (expectedVersion !== existing.version) {
      sendStale(res, existing.version);
      return;
    }

    if (!check.ok) {
      sendError(res, 409, 'CONFLICT', check.kind === 'conflict' ? check.message : 'This change is not possible.');
      return;
    }

    const { changes, openFollowUp, closeFollowUp, assigneeToCheck } = check.value;
    if (await refuseIfNotAssignable(res, assigneeToCheck)) return;

    const caller = getSessionUser(res);
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticketAction.updateMany({
        where: { id: existing.id, version: expectedVersion },
        data: {
          ...changes,
          ...(openFollowUp
            ? {
                followUpRequired: true,
                followUpNote: openFollowUp.note,
                followUpAssigneeId: openFollowUp.assigneeId,
                followUpStatus: 'Open' as const
              }
            : {}),
          ...(closeFollowUp
            ? { followUpStatus: closeFollowUp, followUpClosedAt: now, followUpClosedById: caller.id }
            : {}),
          updatedById: caller.id,
          version: { increment: 1 }
        }
      });

      if (count === 0) return null;

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { updatedAt: now },
        select: { id: true }
      });

      return tx.ticketAction.findUnique({ where: { id: existing.id }, select: ACTION_SELECT });
    });

    if (!updated) {
      const current = await prisma.ticketAction.findUnique({
        where: { id: existing.id },
        select: { version: true }
      });
      sendStale(res, current?.version ?? existing.version);
      return;
    }

    res.json(toActionResponse(updated as ActionRow));
  } catch (error) {
    sendInternalError(res, 'PATCH /api/staff/tickets/:id/actions/:actionId', error);
  }
});
