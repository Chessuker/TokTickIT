/**
 * Authentication and authorization middleware (api-spec.md §1.1, FR-04).
 *
 * Every protected route runs `requireAuth` first: it turns the session cookie
 * into a `SessionUser` on `res.locals.user`, or answers `401`. `requireRole`
 * then compares the role. Ownership checks stay inside the ticket routes,
 * where the resource is loaded.
 *
 * The password-change gate (BR-02) lives here too. A user flagged
 * `mustChangePassword` may reach only `GET /api/auth/me`,
 * `POST /api/auth/change-password` and `POST /api/auth/logout`; those routes
 * use `requireSession`, everything else uses `requireAuth`, so a new data
 * endpoint is gated by default.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from './db.js';
import { sendError, sendInternalError } from './httpErrors.js';
import { SESSION_COOKIE, clearSessionCookie, hashSessionToken, isSessionExpired } from './session.js';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

/** The `select` that produces a SessionUser (api-spec.md §2). */
export const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  mustChangePassword: true
} as const;

export function getSessionUser(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) {
    throw new Error('getSessionUser called outside an authenticated route');
  }
  return user;
}

/** The id of the `Session` row behind the current request. */
export function getSessionId(res: Response): string {
  const sessionId = res.locals.sessionId as string | undefined;
  if (!sessionId) {
    throw new Error('getSessionId called outside an authenticated route');
  }
  return sessionId;
}

function unauthorized(res: Response) {
  clearSessionCookie(res);
  sendError(res, 401, 'UNAUTHORIZED', 'You must sign in to continue.');
}

function authenticate(options: { allowPendingPasswordChange: boolean }) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const raw = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];

    if (typeof raw !== 'string' || raw.length === 0) {
      unauthorized(res);
      return;
    }

    try {
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(raw) },
        select: {
          id: true,
          expiresAt: true,
          user: { select: { ...SESSION_USER_SELECT, isActive: true } }
        }
      });

      // Unknown token, expired session and deactivated user all answer the
      // same 401: from the client's side the session is simply gone. An
      // expired row is deleted on the way out so the table does not collect
      // dead sessions.
      if (!session) {
        unauthorized(res);
        return;
      }

      if (isSessionExpired(session.expiresAt)) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
        unauthorized(res);
        return;
      }

      if (!session.user.isActive) {
        unauthorized(res);
        return;
      }

      const { isActive: _isActive, ...user } = session.user;

      if (user.mustChangePassword && !options.allowPendingPasswordChange) {
        sendError(
          res,
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'You must change your password before continuing.'
        );
        return;
      }

      res.locals.user = user satisfies SessionUser;
      res.locals.sessionId = session.id;
      next();
    } catch (error) {
      sendInternalError(res, 'requireAuth', error);
    }
  };
}

/** A valid session whose user has no pending password change. */
export const requireAuth = authenticate({ allowPendingPasswordChange: false });

/** A valid session, pending password change or not (the three allow-listed auth routes). */
export const requireSession = authenticate({ allowPendingPasswordChange: true });

/** `403 FORBIDDEN` unless the session user's role is one of `roles`. */
export function requireRole(...roles: Role[]) {
  return function (_req: Request, res: Response, next: NextFunction) {
    const user = getSessionUser(res);
    if (!roles.includes(user.role)) {
      sendError(res, 403, 'FORBIDDEN', 'You do not have access to this resource.');
      return;
    }
    next();
  };
}
