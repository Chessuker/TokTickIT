/**
 * IT Staff routes (api-spec.md §3.9, §3.11 — FR-08, AD-10, AC-16, AC-17).
 *
 * Mounted at `/api/staff` behind `requireAuth` + `requireRole('ITStaff',
 * 'Administrator')`, so a Requester is refused before any handler runs and
 * before any lookup (api-spec.md §1.4, AC-04). Both routes here are reads;
 * the ticket operations (claim, owner, priority, status, notes) arrive with
 * Issue #40 and add their own `requireRole('ITStaff')` on top, because an
 * Administrator may look but never touch (BR-17).
 */
import { Router } from 'express';
import { prisma } from './db.js';
import { getSessionUser, requireAuth, requireRole } from './auth.js';
import { parseQueueQuery, toQueueOrderBy } from './queueQuery.js';
import { sendInternalError, sendValidationFailed } from './httpErrors.js';

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

// GET /api/staff/assignees — active IT Staff for the owner filter and, in
// Issue #40, the owner dropdown (api-spec.md §3.11, FR-09).
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
