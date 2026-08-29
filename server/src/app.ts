import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import { generateTicketNumber } from './ticketNumber.js';
import { validateCreateTicketInput } from './ticketValidation.js';
import { getRequester, requireRequester } from './requesterContext.js';
import { parseTicketListQuery, toOrderBy } from './ticketListQuery.js';
import { sendInternalError, sendValidationFailed } from './httpErrors.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'DISCONNECTED';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'CONNECTED';
  } catch (error) {
    dbStatus = 'UNREACHABLE';
  }

  const isHealthy = dbStatus === 'CONNECTED';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'error',
    service: 'TokTickIT API',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

// User routes (Prisma integration)
app.get('/api/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Reference data (api-spec.md §3.2, §3.3). Neither endpoint requires the
// requester header: the lists are identical for everyone and carry nothing
// requester-scoped. Both return active rows only, so a deactivated category can
// never be offered in the Create Ticket dropdowns.
app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true }
    });
    res.json({ data: categories });
  } catch (error) {
    sendInternalError(res, 'GET /api/categories', error);
  }
});

app.get('/api/related-systems', async (_req, res) => {
  try {
    const relatedSystems = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
    res.json({ data: relatedSystems });
  } catch (error) {
    sendInternalError(res, 'GET /api/related-systems', error);
  }
});

// Development Requester routes (Issue #3, FR-02, BR-11, AC-14).
//
// This endpoint backs the Development Requester selector, which is a testing
// mechanism and not authentication (BR-03). Only active requesters are ever
// returned, and `isActive` itself is never exposed: an inactive requester must
// be indistinguishable from one that does not exist.
app.get('/api/requesters', async (_req, res) => {
  try {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, department: true }
    });
    res.json({ data: requesters });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.'
      }
    });
  }
});

/** The `select` behind a TicketDetail response (api-spec.md §2). */
const TICKET_DETAIL_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, department: true } }
} as const;

/**
 * The `select` behind a TicketListItem response (api-spec.md §2), plus
 * `updatedAt` for the list's "Last Updated" column.
 *
 * Attachments are selected as ids rather than counted with a filtered
 * `_count`, because only the number of *active* ones is meaningful (a removed
 * attachment still exists as metadata) and a ticket is capped at five, so
 * counting them in the mapper costs nothing.
 */
const TICKET_LIST_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  attachments: { where: { isRemoved: false }, select: { id: true } }
} as const;

/** Replaces the selected attachment ids with the count the contract exposes. */
function toTicketListItem(ticket: Record<string, unknown>) {
  const { attachments, ...rest } = ticket as { attachments?: unknown[] };
  return { ...rest, attachmentCount: Array.isArray(attachments) ? attachments.length : 0 };
}

/**
 * How many times a ticket number collision is retried before giving up.
 *
 * `generateTicketNumber` reads the highest existing number and adds one, so two
 * simultaneous creates can compute the same value. The unique constraint on
 * `ticketNumber` rejects the loser (Prisma `P2002`); recomputing and inserting
 * again resolves it. Three attempts is ample for a lab-scale write rate and
 * bounds the request rather than spinning.
 */
const TICKET_NUMBER_ATTEMPTS = 3;

function isTicketNumberCollision(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!candidate || candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes('ticketNumber');
  return typeof target === 'string' ? target.includes('ticketNumber') : true;
}

// POST /api/tickets — create one validated ticket (FR-01, AC-01).
//
// `requesterId` is never read from the body: it comes from the resolved
// X-Requester-Id, so a client cannot file a ticket in someone else's name.
app.post('/api/tickets', requireRequester, async (req, res) => {
  const { fieldErrors, values } = validateCreateTicketInput(req.body);

  if (!values) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  try {
    // Referential checks run before the insert so a bad id comes back as a
    // field error the form can show under the right dropdown, rather than as a
    // foreign-key failure the user cannot act on.
    const [category, relatedSystem] = await Promise.all([
      prisma.category.findFirst({
        where: { id: values.categoryId, isActive: true },
        select: { id: true }
      }),
      prisma.relatedSystem.findFirst({
        where: { id: values.relatedSystemId, isActive: true },
        select: { id: true }
      })
    ]);

    const referenceErrors: Record<string, string> = {};
    if (!category) referenceErrors.categoryId = 'Category not found.';
    if (!relatedSystem) referenceErrors.relatedSystemId = 'Related System not found.';

    if (Object.keys(referenceErrors).length > 0) {
      sendValidationFailed(res, referenceErrors);
      return;
    }

    const requester = getRequester(res);
    let lastCollision: unknown = null;

    for (let attempt = 0; attempt < TICKET_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        // Number generation and insert share one transaction, so no other
        // create can slip a row in between the read and the write.
        const ticket = await prisma.$transaction(async (tx) => {
          const ticketNumber = await generateTicketNumber(tx);

          return tx.ticket.create({
            data: {
              ticketNumber,
              summary: values.summary,
              description: values.description,
              priority: values.priority,
              // `status` is left to the schema default: `New` is server-owned
              // and not reachable from the request body (BR-02).
              requesterId: requester.id,
              categoryId: values.categoryId,
              relatedSystemId: values.relatedSystemId
            },
            select: TICKET_DETAIL_SELECT
          });
        });

        res.status(201).json({ ...ticket, attachmentCount: 0, attachments: [] });
        return;
      } catch (error) {
        if (!isTicketNumberCollision(error)) throw error;
        lastCollision = error;
      }
    }

    sendInternalError(res, 'POST /api/tickets ticket number collision', lastCollision);
  } catch (error) {
    sendInternalError(res, 'POST /api/tickets', error);
  }
});

// GET /api/tickets — the selected requester's tickets, searched, filtered,
// sorted and paginated (FR-03, AC-04, AC-10, api-spec.md §3.5).
//
// BR-04 is enforced by construction: `requesterId` is written into the `where`
// from the resolved header and the parsed query contributes only the remaining
// clauses, so no combination of parameters can reach another requester's rows.
app.get('/api/tickets', requireRequester, async (req, res) => {
  const { fieldErrors, query } = parseTicketListQuery(req.query);

  if (!query) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  const requester = getRequester(res);

  const where: Record<string, unknown> = { requesterId: requester.id };
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.status) where.status = query.status;
  if (query.search) {
    // Case-insensitive partial match. `ticketNumber` is included so pasting a
    // number straight from an email finds the ticket without picking a filter.
    where.OR = [
      { ticketNumber: { contains: query.search, mode: 'insensitive' } },
      { summary: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } }
    ];
  }

  try {
    // The count and the page are read with the same `where`, so the metadata
    // always describes the filtered set rather than the requester's whole list.
    const [totalItems, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy: toOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: TICKET_LIST_SELECT
      })
    ]);

    const totalPages = Math.ceil(totalItems / query.pageSize);

    res.json({
      data: tickets.map(toTicketListItem),
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
    sendInternalError(res, 'GET /api/tickets', error);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.create({
      data: { email, name }
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: 'User creation failed. Email may already exist.' });
  }
});
