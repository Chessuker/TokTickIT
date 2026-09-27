/**
 * Authentication endpoints (api-spec.md §3.1 – §3.4; FR-01 … FR-03).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { SESSION_USER_SELECT, getSessionId, getSessionUser, requireSession } from './auth.js';
import { sendError, sendInternalError, sendValidationFailed } from './httpErrors.js';
import { loginThrottle } from './loginThrottle.js';
import { BCRYPT_COST, validatePassword } from './passwordPolicy.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
  setSessionCookie
} from './session.js';

/** Messages fixed by api-spec.md §3.1 so the client can rely on them. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
export const ACCOUNT_INACTIVE_MESSAGE = 'This account is inactive. Please contact an administrator.';
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many failed attempts. Try again in a few minutes.';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_BYTES = 72;

/**
 * Compared against when the email is unknown, so a missing user costs the
 * same bcrypt work as a wrong password and timing cannot tell the two apart
 * (BR-06). The comparison result is discarded, so its value never matters.
 */
const DUMMY_HASH = bcrypt.hashSync('toktickit-dummy-password', BCRYPT_COST);

export function normaliseEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

interface LoginInput {
  email: string;
  password: string;
}

function validateLoginInput(body: unknown): { fieldErrors: Record<string, string>; values?: LoginInput } {
  const fieldErrors: Record<string, string> = {};
  const input = (body ?? {}) as Record<string, unknown>;

  const email = normaliseEmail(input.email);
  if (!email) {
    fieldErrors.email = 'Email address is required.';
  } else if (email.length > EMAIL_MAX_LENGTH || !email.includes('@')) {
    fieldErrors.email = 'Enter a valid email address.';
  }

  const password = input.password;
  if (typeof password !== 'string' || password.length === 0) {
    fieldErrors.password = 'Password is required.';
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    fieldErrors.password = `Password must be at most ${PASSWORD_MAX_BYTES} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { fieldErrors, values: { email, password: password as string } };
}

export const authRouter = Router();

// POST /api/auth/login (FR-01, AC-01, AC-05 … AC-07).
//
// Order of checks is fixed by api-spec.md §3.1: validation → throttle → load
// user → bcrypt compare → inactive check → create session.
authRouter.post('/login', async (req, res) => {
  const { fieldErrors, values } = validateLoginInput(req.body);
  if (!values) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  if (loginThrottle.isThrottled(values.email)) {
    sendError(res, 429, 'TOO_MANY_ATTEMPTS', TOO_MANY_ATTEMPTS_MESSAGE);
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: values.email },
      select: { ...SESSION_USER_SELECT, isActive: true, passwordHash: true }
    });

    // An empty hash (migrated, never seeded — AD-13) can never match; bcrypt
    // is still run against the dummy so the timing stays uniform.
    const storedHash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(values.password, storedHash);

    if (!user || !user.passwordHash || !passwordMatches) {
      loginThrottle.recordFailure(values.email);
      sendError(res, 401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
      return;
    }

    if (!user.isActive) {
      // The password was right, so this is not a guessing attempt (BR-07).
      sendError(res, 403, 'ACCOUNT_INACTIVE', ACCOUNT_INACTIVE_MESSAGE);
      return;
    }

    // A caller who already holds a session gets a fresh one; the old row goes.
    const existing = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
    if (typeof existing === 'string' && existing.length > 0) {
      await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(existing) } });
    }

    const token = generateSessionToken();
    const now = new Date();

    await prisma.$transaction([
      prisma.session.create({
        data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt: sessionExpiry(now) }
      }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } })
    ]);

    loginThrottle.reset(values.email);
    setSessionCookie(res, token);

    const { isActive: _isActive, passwordHash: _passwordHash, ...sessionUser } = user;
    res.json(sessionUser);
  } catch (error) {
    sendInternalError(res, 'POST /api/auth/login', error);
  }
});

// POST /api/auth/logout (FR-03, AC-08). Allowed while a password change is pending.
authRouter.post('/logout', requireSession, async (_req, res) => {
  try {
    await prisma.session.deleteMany({ where: { id: getSessionId(res) } });
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    sendInternalError(res, 'POST /api/auth/logout', error);
  }
});

// GET /api/auth/me (FR-03). Allowed while a password change is pending — the
// client reads `mustChangePassword` from here to decide where to route.
authRouter.get('/me', requireSession, (_req, res) => {
  res.json(getSessionUser(res));
});

// POST /api/auth/change-password (FR-02, AC-02, AC-09, AC-10, BR-08, BR-11).
authRouter.post('/change-password', requireSession, async (req, res) => {
  const sessionUser = getSessionUser(res);
  const input = (req.body ?? {}) as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};

  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

  if (!currentPassword) fieldErrors.currentPassword = 'Current password is required.';

  const policyError = validatePassword(newPassword);
  if (policyError) {
    fieldErrors.newPassword = policyError;
  } else if (newPassword === currentPassword) {
    fieldErrors.newPassword = 'New password must differ from the current password.';
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = 'Please confirm the new password.';
  } else if (confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.';
  }

  try {
    if (currentPassword) {
      const user = await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { passwordHash: true }
      });
      const matches = user?.passwordHash ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
      if (!matches) fieldErrors.currentPassword = 'Current password is incorrect.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      // A wrong current password is a field error, not a 401: the caller is
      // authenticated, and a typo should not log them out (api-spec.md §3.4).
      sendValidationFailed(res, fieldErrors);
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const sessionId = getSessionId(res);

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: sessionUser.id },
        data: { passwordHash, mustChangePassword: false },
        select: SESSION_USER_SELECT
      }),
      // Every other session of this user dies with the old password (BR-11);
      // the one making this request is kept.
      prisma.session.deleteMany({ where: { userId: sessionUser.id, id: { not: sessionId } } })
    ]);

    res.json(updated);
  } catch (error) {
    sendInternalError(res, 'POST /api/auth/change-password', error);
  }
});
