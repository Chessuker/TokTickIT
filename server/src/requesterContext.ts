/**
 * Requester context middleware (api-spec.md §1.1).
 *
 * Lab 2 has no authentication: the selected Development Requester travels in
 * the `X-Requester-Id` header on every requester-scoped endpoint. Resolving it
 * in one middleware — rather than in each route — means ownership is enforced
 * in a single place and cannot be forgotten on a new route, and it maps onto
 * the `Authorization` header that replaces it in Lab 3.
 *
 * The resolved requester is published on `res.locals.requester`; a route that
 * sits behind this middleware can read it without re-querying.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './db.js';
import { sendError, sendInternalError } from './httpErrors.js';

export const REQUESTER_HEADER = 'x-requester-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedRequester {
  id: string;
  name: string;
  email: string;
  department: string | null;
}

export function getRequester(res: Response): ResolvedRequester {
  const requester = res.locals.requester as ResolvedRequester | undefined;
  if (!requester) {
    throw new Error('getRequester called outside a requireRequester-protected route');
  }
  return requester;
}

export async function requireRequester(req: Request, res: Response, next: NextFunction) {
  const raw = req.header(REQUESTER_HEADER);

  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) {
    sendError(
      res,
      400,
      'REQUESTER_REQUIRED',
      'A Development Requester must be selected before using this endpoint.'
    );
    return;
  }

  try {
    const requester = await prisma.requesterUser.findFirst({
      // An inactive requester is filtered out here, not compared afterwards, so
      // the "unknown" and "deactivated" cases answer identically (BR-11).
      where: { id: raw.trim(), isActive: true },
      select: { id: true, name: true, email: true, department: true }
    });

    if (!requester) {
      sendError(res, 403, 'FORBIDDEN', 'The selected requester is not available.');
      return;
    }

    res.locals.requester = requester;
    next();
  } catch (error) {
    sendInternalError(res, 'requireRequester', error);
  }
}
