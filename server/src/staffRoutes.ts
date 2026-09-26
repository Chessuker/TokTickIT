/**
 * IT Staff routes (api-spec.md §3.9 – §3.17 — FR-08 … FR-12).
 *
 * Mounted at `/api/staff` behind `requireAuth` + `requireRole('ITStaff',
 * 'Administrator')`, so a Requester is refused before any handler runs and
 * before any lookup (api-spec.md §1.4, AC-04). The reads are open to both
 * roles; every write adds `requireRole('ITStaff')` on top, because an
 * Administrator may look but never touch (BR-17).
 */
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from './db.js';
import { getSessionUser, requireAuth, requireRole } from './auth.js';
import { parseQueueQuery, toQueueOrderBy } from './queueQuery.js';
import { IT_PRIORITIES } from './queueQuery.js';
import type { ItPriorityValue } from './queueQuery.js';
import { sendError, sendInternalError, sendValidationFailed } from './httpErrors.js';
import { ATTACHMENT_SELECT, toAttachmentResponse } from './attachmentRules.js';
import type { AttachmentRow } from './attachmentRules.js';
import { COMMENT_SELECT, validateCommentBody } from './commentRules.js';
import {
  TICKET_STATUSES,
  checkTransition,
  isTerminal,
  isTicketStatus,
  permittedTransitions,
  statusLabel,
  timestampsFor
} from './ticketWorkflow.js';
import type { TicketStatusValue } from './ticketWorkflow.js';

/** Narrows an unvalidated body value to one of the three IT priorities (BR-16). */
function isItPriority(value: unknown): value is ItPriorityValue {
  return typeof value === 'string' && (IT_PRIORITIES as readonly string[]).includes(value);
}

export const staffRouter = Router();

staffRouter.use(requireAuth, requireRole('ITStaff', 'Administrator'));

/** The `select` behind a `StaffTicketListItem` (api-spec.md §2). */
export const STAFF_TICKET_LIST_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  status: true,
  priority: true,
  itPriority: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, role: true } },
  owner: { select: { id: true, name: true, role: true } }
} as const;

/** Renames `priority` to the contract's `requestedPriority`. */
export function toStaffTicketListItem(ticket: Record<string, unknown>) {
  const { priority, ...rest } = ticket as { priority: unknown };
  return { ...rest, requestedPriority: priority };
}

// GET /api/staff/tickets — the queue: every Requester's tickets, searched,
// filtered, sorted and paginated (AC-16, AC-17).
//
// Unlike `GET /api/tickets`, nothing here is scoped to the caller: the queue
// is the whole system. `owner=me` is the one place the session user appears,
// and only as a filter the caller chose.
staffRouter.get('/tickets', async (req, res) => {
  const { fieldErrors, query } = parseQueueQuery(req.query);

  if (!query) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  const where: Record<string, unknown> = {};
  if (query.search) {
    where.OR = [
      { ticketNumber: { contains: query.search, mode: 'insensitive' } },
      { summary: { contains: query.search, mode: 'insensitive' } }
    ];
  }
  if (query.statuses.length > 0) where.status = { in: query.statuses };
  if (query.itPriority) where.itPriority = query.itPriority;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.owner) {
    if (query.owner.kind === 'me') where.ownerId = getSessionUser(res).id;
    else if (query.owner.kind === 'unassigned') where.ownerId = null;
    else where.ownerId = query.owner.id;
  }

  try {
    const [totalItems, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: toQueueOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: STAFF_TICKET_LIST_SELECT
      })
    ]);

    const totalPages = Math.ceil(totalItems / query.pageSize);

    res.json({
      data: tickets.map(toStaffTicketListItem),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPreviousPage: query.page > 1
      }
    });
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/tickets', error);
  }
});

// GET /api/staff/assignees — active IT Staff for the queue's owner filter and
// the detail screen's owner dropdown (api-spec.md §3.11, FR-09).
//
// Active only: a deactivated member must not be offered as an owner (BR-27),
// and a queue filter for them would be a filter for someone who cannot work.
staffRouter.get('/assignees', async (_req, res) => {
  try {
    const assignees = await prisma.user.findMany({
      where: { role: 'ITStaff', isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
    res.json({ data: assignees });
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/assignees', error);
  }
});

// ---------------------------------------------------------------------------
// Ticket operations (Issue #40 — FR-09 … FR-12, api-spec.md §3.10, §3.12 – §3.17).
//
// Everything below is a write except the two reads at the end of the file, so
// each route carries `requireRole('ITStaff')` on top of the router's gate: an
// Administrator may look at all of this and change none of it (BR-17), and the
// refusal happens before the ticket is loaded.
// ---------------------------------------------------------------------------

/** IT Staff only; the router has already admitted Administrators. */
const staffOnly = requireRole('ITStaff');

/** Attachments as the detail response orders them: active first, newest first. */
const STAFF_DETAIL_ATTACHMENTS = {
  orderBy: [{ isRemoved: 'asc' as const }, { uploadedAt: 'desc' as const }],
  select: ATTACHMENT_SELECT
};

/** The `select` behind a `StaffTicketDetail` (api-spec.md §2). */
const STAFF_TICKET_DETAIL_SELECT = {
  ...STAFF_TICKET_LIST_SELECT,
  description: true,
  ownerId: true,
  resolvedAt: true,
  closedAt: true,
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, department: true, role: true } },
  attachments: STAFF_DETAIL_ATTACHMENTS,
  _count: { select: { comments: true, internalNotes: true } }
};

interface StaffTicketRow {
  status: TicketStatusValue;
  ownerId: string | null;
  priority: unknown;
  attachments: AttachmentRow[];
  _count: { comments: number; internalNotes: number };
  [key: string]: unknown;
}

/**
 * Shapes one `StaffTicketDetail` (api-spec.md §2).
 *
 * `permittedTransitions` is computed server-side from the matrix and the owner
 * rule, so the UI never encodes either (BR-18, BR-19). For an Administrator it
 * is always `[]`: they may read the ticket but change nothing (BR-17), and an
 * empty list is what makes their status control render read-only without the
 * client having to know the rule.
 */
function toStaffTicketDetail(ticket: StaffTicketRow, res: Response) {
  const { priority, ownerId, attachments, _count, ...rest } = ticket;
  const rows = attachments ?? [];
  const isStaff = getSessionUser(res).role === 'ITStaff';

  return {
    ...rest,
    requestedPriority: priority,
    attachments: rows.map(toAttachmentResponse),
    counts: {
      comments: _count.comments,
      internalNotes: _count.internalNotes,
      attachments: rows.filter((row) => !row.isRemoved).length
    },
    permittedTransitions: isStaff ? permittedTransitions(ticket.status, ownerId !== null) : []
  };
}

/**
 * Loads one ticket for the staff screens, answering `404` itself.
 *
 * `404`, not `403`, for an unknown id: IT Staff and Administrators are allowed
 * to see every ticket, so a missing one is missing rather than forbidden
 * (api-spec.md §1.4).
 */
async function loadStaffTicket(res: Response, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    select: STAFF_TICKET_DETAIL_SELECT
  });

  if (!ticket) {
    sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
    return null;
  }

  return ticket as unknown as StaffTicketRow;
}

/** Re-reads the ticket after a write so the response carries the full detail. */
async function respondWithDetail(res: Response, ticketId: string) {
  const ticket = await loadStaffTicket(res, ticketId);
  if (!ticket) return;
  res.json(toStaffTicketDetail(ticket, res));
}

/**
 * BR-31: owner and IT Priority are settled once a ticket is Closed or
 * Cancelled. Answers the refusal itself and returns `true` when it did.
 */
function refuseIfTerminal(res: Response, status: TicketStatusValue, action: string): boolean {
  if (!isTerminal(status)) return false;

  sendError(
    res,
    409,
    'INVALID_TRANSITION',
    `A ${statusLabel(status).toLowerCase()} ticket can no longer ${action}. Reopen it first.`
  );
  return true;
}

// GET /api/staff/tickets/:id — one ticket for the staff screens (api-spec.md
// §3.10, AC-24). Readable by IT Staff and Administrators alike.
staffRouter.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    res.json(toStaffTicketDetail(ticket, res));
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/tickets/:id', error);
  }
});

// POST /api/staff/tickets/:id/claim — take ownership (api-spec.md §3.12,
// BR-15, BR-19, BR-31, AC-18).
//
// Claiming a ticket that already belongs to someone else is a reassign to
// self, which the spec allows: the previous owner is replaced. A `New` ticket
// becomes `Open` in the same write, so the queue shows work as soon as
// somebody picks it up (BR-31).
staffRouter.post('/tickets/:id/claim', staffOnly, async (req, res) => {
  try {
    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    if (refuseIfTerminal(res, ticket.status, 'be claimed')) return;

    const caller = getSessionUser(res);

    await prisma.ticket.update({
      where: { id: ticket.id as string },
      data: {
        ownerId: caller.id,
        ...(ticket.status === 'New' ? { status: 'Open' as const } : {})
      },
      select: { id: true }
    });

    await respondWithDetail(res, ticket.id as string);
  } catch (error) {
    sendInternalError(res, 'POST /api/staff/tickets/:id/claim', error);
  }
});

// PATCH /api/staff/tickets/:id/owner — assign, reassign or unassign
// (api-spec.md §3.13, BR-15, BR-31, AC-19).
staffRouter.patch('/tickets/:id/owner', staffOnly, async (req, res) => {
  try {
    const body = req.body as { ownerId?: unknown } | undefined;

    if (!body || !('ownerId' in body)) {
      sendValidationFailed(res, { ownerId: 'An owner id, or null to unassign, is required.' });
      return;
    }

    const rawOwnerId = body.ownerId;
    if (rawOwnerId !== null && typeof rawOwnerId !== 'string') {
      sendValidationFailed(res, { ownerId: 'ownerId must be a user id or null.' });
      return;
    }

    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    if (refuseIfTerminal(res, ticket.status, 'change owner')) return;

    // BR-31: an InProgress ticket is somebody's work in hand; dropping the
    // owner would leave it in a state the matrix says needs one.
    if (rawOwnerId === null && ticket.status === 'InProgress') {
      sendError(
        res,
        409,
        'INVALID_TRANSITION',
        'A ticket that is In Progress must keep an owner. Reassign it, or change its status first.'
      );
      return;
    }

    if (rawOwnerId !== null) {
      // BR-15: the target must be an active IT Staff member. A `400` rather
      // than a `404`, because from the caller's side this is a bad value in a
      // field the form owns.
      const owner = await prisma.user.findFirst({
        where: { id: rawOwnerId, role: 'ITStaff', isActive: true },
        select: { id: true }
      });

      if (!owner) {
        sendValidationFailed(res, { ownerId: 'The owner must be an active IT Staff member.' });
        return;
      }
    }

    await prisma.ticket.update({
      where: { id: ticket.id as string },
      data: {
        ownerId: rawOwnerId,
        // Assigning a New ticket opens it, exactly as claiming does (BR-31).
        ...(rawOwnerId !== null && ticket.status === 'New' ? { status: 'Open' as const } : {})
      },
      select: { id: true }
    });

    await respondWithDetail(res, ticket.id as string);
  } catch (error) {
    sendInternalError(res, 'PATCH /api/staff/tickets/:id/owner', error);
  }
});

// PATCH /api/staff/tickets/:id/it-priority — set the IT Priority (api-spec.md
// §3.14, BR-16, BR-31, AC-20).
//
// Only `itPriority` moves. The Requested Priority is what the Requester asked
// for and is immutable once the ticket exists (BR-16), so it is not even a
// field this route can write.
staffRouter.patch('/tickets/:id/it-priority', staffOnly, async (req, res) => {
  try {
    const raw = (req.body as { itPriority?: unknown } | undefined)?.itPriority;

    if (!isItPriority(raw)) {
      sendValidationFailed(res, {
        itPriority: `itPriority must be one of ${IT_PRIORITIES.join(', ')}.`
      });
      return;
    }

    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    if (refuseIfTerminal(res, ticket.status, 'change IT priority')) return;

    await prisma.ticket.update({
      where: { id: ticket.id as string },
      data: { itPriority: raw },
      select: { id: true }
    });

    await respondWithDetail(res, ticket.id as string);
  } catch (error) {
    sendInternalError(res, 'PATCH /api/staff/tickets/:id/it-priority', error);
  }
});

// PATCH /api/staff/tickets/:id/status — move the ticket through the workflow
// (api-spec.md §3.15, BR-18 … BR-20, AC-21, AC-22).
//
// The matrix and the owner rule live in `ticketWorkflow.ts`; this route only
// asks and reports. The refusal message names the current status and the
// permitted targets, so a client that got out of step can recover without
// guessing.
staffRouter.patch('/tickets/:id/status', staffOnly, async (req, res) => {
  try {
    const raw = (req.body as { status?: unknown } | undefined)?.status;

    if (!isTicketStatus(raw)) {
      sendValidationFailed(res, {
        status: `status must be one of ${TICKET_STATUSES.join(', ')}.`
      });
      return;
    }

    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    const check = checkTransition(ticket.status, raw, ticket.ownerId !== null);

    if (!check.ok) {
      sendError(res, 409, 'INVALID_TRANSITION', check.refusal.message);
      return;
    }

    await prisma.ticket.update({
      where: { id: ticket.id as string },
      data: {
        status: raw,
        ...timestampsFor(raw, new Date(), {
          resolvedAt: (ticket.resolvedAt as Date | null) ?? null,
          closedAt: (ticket.closedAt as Date | null) ?? null
        })
      },
      select: { id: true }
    });

    await respondWithDetail(res, ticket.id as string);
  } catch (error) {
    sendInternalError(res, 'PATCH /api/staff/tickets/:id/status', error);
  }
});

// GET /api/staff/tickets/:id/internal-notes — the private thread (api-spec.md
// §3.16, BR-04, BR-23, AC-04, AC-23).
//
// A Requester never reaches this handler: the router's `requireRole` answers
// `403` first, before the ticket id is even looked up, so the response cannot
// leak a note, a count, or whether the ticket exists.
staffRouter.get('/tickets/:id/internal-notes', async (req, res) => {
  try {
    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    const notes = await prisma.ticketInternalNote.findMany({
      where: { ticketId: ticket.id as string },
      orderBy: { createdAt: 'desc' },
      select: COMMENT_SELECT
    });

    res.json({ data: notes });
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/tickets/:id/internal-notes', error);
  }
});

// POST /api/staff/tickets/:id/internal-notes — append one note (api-spec.md
// §3.17, BR-22, BR-23, AC-23). IT Staff only; an Administrator reads.
//
// Notes share the body rule and response shape with Public Comments
// (`commentRules.ts`), but never the table: a query against
// `TicketInternalNote` cannot return a comment and vice versa (AD-03).
staffRouter.post('/tickets/:id/internal-notes', staffOnly, async (req, res) => {
  try {
    const ticket = await loadStaffTicket(res, String(req.params.id));
    if (!ticket) return;

    const { body, error } = validateCommentBody((req.body as { body?: unknown } | undefined)?.body);

    if (!body) {
      sendValidationFailed(res, { body: error as string });
      return;
    }

    const author = getSessionUser(res);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketInternalNote.create({
        data: { ticketId: ticket.id as string, authorId: author.id, body },
        select: COMMENT_SELECT
      });

      await tx.ticket.update({
        where: { id: ticket.id as string },
        data: { updatedAt: new Date() },
        select: { id: true }
      });

      return created;
    });

    res.status(201).json(note);
  } catch (error) {
    sendInternalError(res, 'POST /api/staff/tickets/:id/internal-notes', error);
  }
});
