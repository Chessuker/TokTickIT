import express from 'express';
import type { Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './db.js';
import { generateTicketNumber } from './ticketNumber.js';
import { validateCreateTicketInput } from './ticketValidation.js';
import { getSessionUser, requireAuth, requireRole } from './auth.js';
import { authRouter } from './authRoutes.js';
import { staffRouter } from './staffRoutes.js';
import { adminRouter } from './adminRoutes.js';
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
import { COMMENT_SELECT, validateCommentBody } from './commentRules.js';

export const app = express();

/**
 * The client runs on its own origin (Vite on 5173) and identifies itself with
 * a cookie, so CORS must name that origin and allow credentials (AD-12); a
 * wildcard origin cannot carry cookies.
 */
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Authentication (api-spec.md §3.1 – §3.4).
app.use('/api/auth', authRouter);

// IT Staff queue, ticket detail and operations (api-spec.md §3.9 – §3.17).
// Role-gated inside the router, so every `/api/staff/*` path refuses a
// Requester before lookup.
app.use('/api/staff', staffRouter);

// Administrator user management (api-spec.md §3.18 – §3.22). Same shape:
// anything but an Administrator is refused before a user is loaded (AC-30).
app.use('/api/admin', adminRouter);

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

// Reference data (Lab 2 api-spec.md §3.2, §3.3). Both lists are identical for
// every role and carry nothing user-scoped, so any signed-in user may read
// them. Both return active rows only, so a deactivated category can never be
// offered in the Create Ticket dropdowns.
app.get('/api/categories', requireAuth, async (_req, res) => {
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

app.get('/api/related-systems', requireAuth, async (_req, res) => {
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

/** The reduced `UserRef` shape embedded as `owner` (Lab 3 api-spec.md §2). */
const USER_REF_SELECT = { id: true, name: true, role: true } as const;

/**
 * The `select` behind a TicketDetail response (Lab 2 api-spec.md §2, plus the
 * three Lab 3 fields `itPriority`, `owner` and `requesterResolvedAt`).
 */
const TICKET_DETAIL_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  status: true,
  priority: true,
  itPriority: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, department: true } },
  owner: { select: USER_REF_SELECT }
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
  itPriority: true,
  requesterResolvedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  owner: { select: USER_REF_SELECT },
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

// POST /api/tickets — create one validated ticket (Lab 2 FR-01, AC-01).
//
// `requesterId` is never read from the body: it comes from the session user
// (BR-03, AC-03), so a client cannot file a ticket in someone else's name.
app.post('/api/tickets', requireAuth, requireRole('Requester'), async (req, res) => {
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

    const requester = getSessionUser(res);
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
              // IT Priority starts equal to the Requested Priority (BR-16);
              // only IT Staff may move it afterwards.
              itPriority: values.priority,
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

// GET /api/tickets — the signed-in requester's tickets, searched, filtered,
// sorted and paginated (Lab 2 FR-03, AC-04, AC-10, api-spec.md §3.5).
//
// Ownership is enforced by construction: `requesterId` is written into the
// `where` from the session user and the parsed query contributes only the
// remaining clauses, so no combination of parameters — including a
// `requesterId` query parameter, which is simply ignored (AC-03) — can reach
// another requester's rows.
app.get('/api/tickets', requireAuth, requireRole('Requester'), async (req, res) => {
  const { fieldErrors, query } = parseTicketListQuery(req.query);

  if (!query) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  const requester = getSessionUser(res);

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

/** A refusal a route has decided on but has not answered yet. */
interface Refusal {
  status: number;
  code: 'NOT_FOUND' | 'FORBIDDEN';
  message: string;
}

/**
 * True when the session user may read any ticket or attachment: IT Staff and
 * Administrators have read-only continuity over Requester resources (BR-14,
 * AC-24). Requesters are always owner-scoped.
 */
function canReadAnyTicket(res: Response): boolean {
  return getSessionUser(res).role !== 'Requester';
}

/**
 * Answers the ownership question for one ticket in a single place (Lab 2 BR-04,
 * Lab 3 BR-14), and hands the verdict back rather than writing it. Every route
 * below funnels through this, so a new one cannot accidentally skip the check.
 *
 * The refusal is returned instead of sent because the upload route has to drain
 * the request body before it can answer at all; every other caller just passes
 * it straight to `loadOwnedTicket`.
 */
async function findTicketForRequester(res: Response, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    select: { ...TICKET_DETAIL_SELECT, requesterId: true, attachments: TICKET_DETAIL_ATTACHMENTS }
  });

  if (!ticket) {
    return { refusal: { status: 404, code: 'NOT_FOUND', message: 'Ticket not found.' } as Refusal };
  }

  if (ticket.requesterId !== getSessionUser(res).id && !canReadAnyTicket(res)) {
    // 403 rather than 404: the ticket exists, and the refusal is about
    // ownership. Lab 2 api-spec.md §3.6 fixes this choice (AD-11).
    return {
      refusal: {
        status: 403,
        code: 'FORBIDDEN',
        message: 'This ticket belongs to another requester.'
      } as Refusal
    };
  }

  return { ticket };
}

/**
 * The read-side wrapper: resolves the ticket and answers the refusal itself.
 * Returns `null` once the response has been written.
 */
async function loadOwnedTicket(res: Response, ticketId: string) {
  const { ticket, refusal } = await findTicketForRequester(res, ticketId);

  if (refusal) {
    sendError(res, refusal.status, refusal.code, refusal.message);
    return null;
  }

  return ticket ?? null;
}

/**
 * Waits for a request body nobody is going to read.
 *
 * Answering an upload before its body has arrived resets the socket, and the
 * client sees a network error rather than the refusal. Discarding the bytes
 * first costs bandwidth but nothing else: they are dropped as they arrive, not
 * buffered, and no file is ever written for a request that was refused.
 */
function drainRequest(req: express.Request): Promise<void> {
  if (req.complete) return Promise.resolve();

  return new Promise((resolve) => {
    req.resume();
    req.once('end', resolve);
    req.once('error', () => resolve());
    req.once('close', () => resolve());
  });
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

  if (attachment.ticket.requesterId !== getSessionUser(res).id && !canReadAnyTicket(res)) {
    sendError(res, 403, 'FORBIDDEN', "This attachment belongs to another requester's ticket.");
    return null;
  }

  return attachment;
}

// GET /api/tickets/:id — one ticket, read-only (Lab 2 FR-04, AC-03, AC-05).
// Owner, or any IT Staff / Administrator (Lab 3 api-spec.md §3.5).
app.get('/api/tickets/:id', requireAuth, async (req, res) => {
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
// several rules at once is told about the most specific one. Owner only: IT
// Staff and Administrators may read attachments but never add them (BR-14).
app.post('/api/tickets/:id/attachments', requireAuth, requireRole('Requester'), async (req, res) => {
  try {
    const { ticket, refusal } = await findTicketForRequester(res, String(req.params.id));

    if (!ticket) {
      // The bytes are still arriving into a request nobody will read. They are
      // discarded before the refusal is written, so the client receives the
      // 404/403 instead of a reset connection.
      const { status, code, message } = refusal ?? {
        status: 404,
        code: 'NOT_FOUND' as const,
        message: 'Ticket not found.'
      };

      await drainRequest(req);
      sendError(res, status, code, message);
      return;
    }

    const outcome = await receiveUpload(req, res);

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

    // Size is checked *after* the type, so a file that breaks both rules is
    // answered with the more specific `415` (api-spec.md §3.7). `file.size` is
    // the real byte count even though the buffer is truncated, so a 50 MB
    // upload is still reported at 50 MB.
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
app.get('/api/attachments/:id', requireAuth, async (req, res) => {
  try {
    const attachment = await loadOwnedAttachment(res, String(req.params.id));
    if (!attachment) return;

    res.json(toAttachmentResponse(attachment));
  } catch (error) {
    sendInternalError(res, 'GET /api/attachments/:id', error);
  }
});

// GET /api/attachments/:id/download — stream an active attachment (AC-09, BR-09).
app.get('/api/attachments/:id/download', requireAuth, async (req, res) => {
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
app.patch('/api/attachments/:id/remove', requireAuth, requireRole('Requester'), async (req, res) => {
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


// ---------------------------------------------------------------------------
// Public Comments and the resolution indication (Issue #38 — FR-06, FR-07).
// ---------------------------------------------------------------------------

/**
 * The statuses in which a ticket is finished from the Requester's point of
 * view (BR-21). Issue #40 grows this into the full transition matrix in
 * `ticketWorkflow.ts`; until then only the resolution indication needs it.
 */
const TERMINAL_STATUSES = new Set(['Resolved', 'Closed', 'Cancelled']);

/**
 * The comment routes need to know only whether the caller may see the ticket
 * (BR-23), so they load three columns rather than the whole detail. The 404 /
 * 403 rule is the same one `findTicketForRequester` applies: unknown id is
 * 404, someone else's ticket is 403 for a Requester and readable for staff.
 */
async function loadTicketAccess(res: Response, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId },
    select: { id: true, requesterId: true, status: true }
  });

  if (!ticket) {
    sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
    return null;
  }

  if (ticket.requesterId !== getSessionUser(res).id && !canReadAnyTicket(res)) {
    sendError(res, 403, 'FORBIDDEN', 'This ticket belongs to another requester.');
    return null;
  }

  return ticket;
}

// GET /api/tickets/:id/comments — the ticket's Public Comments, newest first
// (api-spec.md §3.6, BR-04, AC-14). Owner, IT Staff or Administrator.
//
// The query runs against `TicketComment` only: an Internal Note lives in a
// different table, so no `where` mistake here can ever return one (AD-03).
app.get('/api/tickets/:id/comments', requireAuth, async (req, res) => {
  try {
    const ticket = await loadTicketAccess(res, String(req.params.id));
    if (!ticket) return;

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'desc' },
      select: COMMENT_SELECT
    });

    res.json({ data: comments });
  } catch (error) {
    sendInternalError(res, 'GET /api/tickets/:id/comments', error);
  }
});

// POST /api/tickets/:id/comments — append one Public Comment (api-spec.md
// §3.7, BR-22, BR-23, AC-14). Requester (own ticket) or IT Staff; an
// Administrator is refused by the role gate before any lookup (BR-17).
//
// Allowed in every status, including Closed and Cancelled: a late reply is
// still useful to IT Staff, who may reopen.
app.post(
  '/api/tickets/:id/comments',
  requireAuth,
  requireRole('Requester', 'ITStaff'),
  async (req, res) => {
    try {
      const ticket = await loadTicketAccess(res, String(req.params.id));
      if (!ticket) return;

      const { body, error } = validateCommentBody(
        (req.body as { body?: unknown } | undefined)?.body
      );

      if (!body) {
        sendValidationFailed(res, { body: error as string });
        return;
      }

      const author = getSessionUser(res);

      // Author and time are server-owned (BR-22): the body is the only field
      // a client contributes. The ticket's `updatedAt` is touched in the same
      // transaction so the list's "Last Updated" reflects the new activity.
      const comment = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketComment.create({
          data: { ticketId: ticket.id, authorId: author.id, body },
          select: COMMENT_SELECT
        });

        await tx.ticket.update({
          where: { id: ticket.id },
          data: { updatedAt: new Date() },
          select: { id: true }
        });

        return created;
      });

      res.status(201).json(comment);
    } catch (error) {
      sendInternalError(res, 'POST /api/tickets/:id/comments', error);
    }
  }
);

// POST /api/tickets/:id/resolution-indication — the Requester says the problem
// appears resolved (api-spec.md §3.8, BR-05, BR-21, AC-15). Owner only.
//
// Only `requesterResolvedAt` moves; the status is IT Staff's to change, so a
// Requester can *indicate* but never *resolve* (BR-05). The call is
// idempotent: a repeat answers 200 with the original timestamp rather than
// overwriting the moment the Requester first said so.
app.post(
  '/api/tickets/:id/resolution-indication',
  requireAuth,
  requireRole('Requester'),
  async (req, res) => {
    try {
      const { ticket, refusal } = await findTicketForRequester(res, String(req.params.id));

      if (!ticket) {
        const { status, code, message } = refusal as Refusal;
        sendError(res, status, code, message);
        return;
      }

      if (TERMINAL_STATUSES.has(ticket.status)) {
        sendError(
          res,
          409,
          'INVALID_TRANSITION',
          'This ticket is already resolved, closed or cancelled.'
        );
        return;
      }

      if (ticket.requesterResolvedAt) {
        res.json(toTicketDetail(ticket));
        return;
      }

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { requesterResolvedAt: new Date() },
        select: { ...TICKET_DETAIL_SELECT, requesterId: true, attachments: TICKET_DETAIL_ATTACHMENTS }
      });

      res.json(toTicketDetail(updated));
    } catch (error) {
      sendInternalError(res, 'POST /api/tickets/:id/resolution-indication', error);
    }
  }
);
