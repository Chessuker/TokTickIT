import express from 'express';
import type { Response } from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import { generateTicketNumber } from './ticketNumber.js';
import { validateCreateTicketInput } from './ticketValidation.js';
import { getRequester, requireRequester } from './requesterContext.js';
import { parseTicketListQuery, toOrderBy } from './ticketListQuery.js';
import { sendError, sendInternalError, sendValidationFailed } from './httpErrors.js';
import {
  ALLOWED_TYPES_LABEL,
  ATTACHMENT_SELECT,
  FILE_TOO_LARGE_MESSAGE,
  MAX_ACTIVE_ATTACHMENTS,
  MAX_FILE_BYTES,
  contentDisposition,
  isAllowedMimeType,
  readAttachmentFile,
  sniffMimeType,
  storeAttachmentFile,
  toAttachmentResponse,
  validateRemovalReason
} from './attachmentRules.js';
import type { AttachmentRow } from './attachmentRules.js';
import { receiveUpload } from './attachmentUpload.js';

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

// ---------------------------------------------------------------------------
// Ticket detail and the attachment lifecycle (Issue #6 — FR-04, FR-05).
// ---------------------------------------------------------------------------

/** Attachments as the detail response orders them: active first, newest first. */
const TICKET_DETAIL_ATTACHMENTS = {
  orderBy: [{ isRemoved: 'asc' as const }, { uploadedAt: 'desc' as const }],
  select: ATTACHMENT_SELECT
};

/**
 * Loads one ticket and answers the ownership question in a single place
 * (BR-04). Every route below funnels through the same decision, so a new one
 * cannot accidentally skip it.
 *
 * Returns `null` after answering the response; a non-null ticket means the
 * caller owns it and the route may continue.
 */
async function loadOwnedTicket(res: Response, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    select: { ...TICKET_DETAIL_SELECT, requesterId: true, attachments: TICKET_DETAIL_ATTACHMENTS }
  });

  if (!ticket) {
    sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
    return null;
  }

  if (ticket.requesterId !== getRequester(res).id) {
    // 403 rather than 404: the ticket exists, and the refusal is about
    // ownership. api-spec.md §3.6 fixes this choice.
    sendError(res, 403, 'FORBIDDEN', 'This ticket belongs to another requester.');
    return null;
  }

  return ticket;
}

/** Strips the internal `requesterId` and adds the contract's derived fields. */
function toTicketDetail(ticket: Record<string, unknown>) {
  const { requesterId, attachments, ...rest } = ticket as {
    requesterId?: string;
    attachments?: AttachmentRow[];
  };
  const rows = attachments ?? [];

  return {
    ...rest,
    attachmentCount: rows.filter((row) => !row.isRemoved).length,
    attachments: rows.map(toAttachmentResponse)
  };
}

/**
 * Loads one attachment together with the requester id of its ticket, and
 * answers 404/403 itself. `storagePath` is included because the download route
 * needs it; it is never returned to a client.
 */
async function loadOwnedAttachment(res: Response, attachmentId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId },
    select: {
      ...ATTACHMENT_SELECT,
      storagePath: true,
      ticket: { select: { requesterId: true } }
    }
  });

  if (!attachment) {
    sendError(res, 404, 'NOT_FOUND', 'Attachment not found.');
    return null;
  }

  if (attachment.ticket.requesterId !== getRequester(res).id) {
    sendError(res, 403, 'FORBIDDEN', "This attachment belongs to another requester's ticket.");
    return null;
  }

  return attachment;
}

// GET /api/tickets/:id — one owned ticket, read-only (FR-04, AC-03, AC-05).
app.get('/api/tickets/:id', requireRequester, async (req, res) => {
  try {
    const ticket = await loadOwnedTicket(res, String(req.params.id));
    if (!ticket) return;

    res.json(toTicketDetail(ticket));
  } catch (error) {
    sendInternalError(res, 'GET /api/tickets/:id', error);
  }
});

// POST /api/tickets/:id/attachments — attach one file to an owned ticket
// (FR-05, AC-06, AC-07, AC-08).
//
// The checks run in the order api-spec.md §3.7 fixes, so a request that breaks
// several rules at once is told about the most specific one.
app.post('/api/tickets/:id/attachments', requireRequester, async (req, res) => {
  try {
    const ticket = await loadOwnedTicket(res, String(req.params.id));
    if (!ticket) return;

    const outcome = await receiveUpload(req, res);

    if (outcome.status === 'too_large') {
      sendError(res, 413, 'FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
      return;
    }

    if (outcome.status === 'invalid') {
      sendValidationFailed(res, { file: outcome.message });
      return;
    }

    if (outcome.status === 'failed') {
      sendInternalError(res, 'POST /api/tickets/:id/attachments upload', outcome.cause);
      return;
    }

    const file = outcome.file;
    if (!file) {
      sendValidationFailed(res, { file: 'A file is required.' });
      return;
    }

    // The declared Content-Type is ignored: only the leading bytes decide
    // (BR-05), so a renamed executable is refused however it is labelled.
    const mimeType = sniffMimeType(file.buffer);
    if (!isAllowedMimeType(mimeType)) {
      sendError(
        res,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        `Unsupported file type. Allowed types: ${ALLOWED_TYPES_LABEL}.`
      );
      return;
    }

    // Multer aborts an oversized stream before this point; the repeat check
    // covers the case where the limit is ever relaxed in configuration.
    if (file.size > MAX_FILE_BYTES) {
      sendError(res, 413, 'FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
      return;
    }

    // Removed attachments keep their row but free their slot (BR-07): the cap
    // counts active files only.
    const activeCount = await prisma.attachment.count({
      where: { ticketId: ticket.id, isRemoved: false }
    });

    if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
      sendError(
        res,
        400,
        'ATTACHMENT_LIMIT_REACHED',
        `A ticket can have at most ${MAX_ACTIVE_ATTACHMENTS} active attachments. Remove one before adding another.`
      );
      return;
    }

    const storagePath = await storeAttachmentFile(file.buffer, mimeType);

    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        // The original name is display metadata only; the file on disk carries
        // a generated uuid name, so nothing the requester typed reaches a path.
        fileName: file.originalname,
        mimeType,
        sizeBytes: file.size,
        storagePath
      },
      select: ATTACHMENT_SELECT
    });

    res.status(201).json(toAttachmentResponse(attachment));
  } catch (error) {
    sendInternalError(res, 'POST /api/tickets/:id/attachments', error);
  }
});

// GET /api/attachments/:id — metadata without the bytes (api-spec.md §3.8).
// A removed attachment answers 200 here: its metadata is exactly what the
// detail screen shows (BR-10). Only `downloadUrl` disappears.
app.get('/api/attachments/:id', requireRequester, async (req, res) => {
  try {
    const attachment = await loadOwnedAttachment(res, String(req.params.id));
    if (!attachment) return;

    res.json(toAttachmentResponse(attachment));
  } catch (error) {
    sendInternalError(res, 'GET /api/attachments/:id', error);
  }
});

// GET /api/attachments/:id/download — stream an active attachment (AC-09, BR-09).
app.get('/api/attachments/:id/download', requireRequester, async (req, res) => {
  try {
    const attachment = await loadOwnedAttachment(res, String(req.params.id));
    if (!attachment) return;

    if (attachment.isRemoved) {
      // 403, not 404: the attachment exists and its owner can still see the
      // metadata. What is refused is the state, not the resource (BR-09).
      sendError(
        res,
        403,
        'FORBIDDEN',
        'This attachment has been removed and can no longer be downloaded.'
      );
      return;
    }

    let content: Buffer;
    try {
      content = await readAttachmentFile(attachment.storagePath);
    } catch (error) {
      // The row promises a file that is not on disk. Worth logging as an
      // integrity problem, but from the client's side the file is simply gone.
      console.error('[attachment-integrity] missing stored file', attachment.id, error);
      sendError(res, 404, 'NOT_FOUND', 'The stored file is no longer available.');
      return;
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', String(content.length));
    res.setHeader('Content-Disposition', contentDisposition(attachment.fileName));
    res.send(content);
  } catch (error) {
    sendInternalError(res, 'GET /api/attachments/:id/download', error);
  }
});

// PATCH /api/attachments/:id/remove — soft removal (FR-05, AC-09, BR-08).
//
// Nothing is deleted: neither the row nor the stored file. The record gains the
// three removal fields and loses its download URL.
app.patch('/api/attachments/:id/remove', requireRequester, async (req, res) => {
  try {
    const attachment = await loadOwnedAttachment(res, String(req.params.id));
    if (!attachment) return;

    const { reason, error: reasonError } = validateRemovalReason(
      (req.body as { reason?: unknown } | undefined)?.reason
    );

    if (!reason) {
      sendValidationFailed(res, { reason: reasonError as string });
      return;
    }

    if (attachment.isRemoved) {
      // Removal is not repeatable: repeating it would overwrite the original
      // reason and timestamp, which are the whole point of a soft removal.
      sendValidationFailed(res, { reason: 'This attachment has already been removed.' });
      return;
    }

    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { isRemoved: true, removedReason: reason, removedAt: new Date() },
      select: ATTACHMENT_SELECT
    });

    res.json(toAttachmentResponse(updated));
  } catch (error) {
    sendInternalError(res, 'PATCH /api/attachments/:id/remove', error);
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
