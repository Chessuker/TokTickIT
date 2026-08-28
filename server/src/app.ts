import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import { generateTicketNumber } from './ticketNumber.js';
import { validateCreateTicketInput } from './ticketValidation.js';
import { getRequester, requireRequester } from './requesterContext.js';
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
