/**
 * Administrator user management (api-spec.md §3.18 – §3.22 — FR-13,
 * BR-24 … BR-27).
 *
 * Mounted at `/api/admin` behind `requireAuth` + `requireRole('Administrator')`,
 * so a Requester or IT Staff is refused before any handler runs and before any
 * user is looked up (api-spec.md §1.4, AC-30): a `403` here never carries a
 * name, an email or a count.
 *
 * Three safety rules shape the writes and all three are server-side, because
 * the UI disabling a control is feedback and this is the rule (AC-29):
 *
 * - An Administrator cannot deactivate their own account (BR-25).
 * - The system always keeps one active Administrator (BR-26).
 * - Nobody is ever deleted; deactivation is the only way to retire an account,
 *   and it takes effect at once by deleting that user's sessions (BR-27).
 */
import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from './db.js';
import { getSessionUser, requireAuth, requireRole } from './auth.js';
import { sendError, sendInternalError, sendValidationFailed } from './httpErrors.js';
import { BCRYPT_COST, validatePassword } from './passwordPolicy.js';
import { normaliseEmail } from './authRoutes.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('Administrator'));

export const ROLES: readonly Role[] = ['Requester', 'ITStaff', 'Administrator'];

const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const SEARCH_MAX = 150;

/** The `select` behind an `AdminUser` response (api-spec.md §2). Never the hash. */
const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export const SELF_DEACTIVATION_MESSAGE = 'You cannot deactivate your own account.';
export const LAST_ADMINISTRATOR_MESSAGE = 'At least one active administrator is required.';
export const DUPLICATE_EMAIL_MESSAGE = 'That email address is already in use.';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Validates the fields an Administrator may write (BR-24, BR-25).
 *
 * `partial` is what makes one validator serve both create and edit: on a
 * `PATCH` only the fields actually present are judged, so omitting `role` is
 * "leave it alone" rather than "role is missing". Anything not listed here —
 * `password`, `department`, `mustChangePassword` — is simply not read, so a
 * client cannot write it by sending it (api-spec.md §3.21).
 */
interface UserFields {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
}

function validateUserFields(
  body: unknown,
  options: { partial: boolean }
): { fieldErrors: Record<string, string>; values: UserFields } {
  const fieldErrors: Record<string, string> = {};
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const values: UserFields = {};

  if (!options.partial || input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length === 0) {
      fieldErrors.name = 'Full name is required.';
    } else if (name.length > NAME_MAX_LENGTH) {
      fieldErrors.name = `Full name must be at most ${NAME_MAX_LENGTH} characters.`;
    } else {
      values.name = name;
    }
  }

  if (!options.partial || input.email !== undefined) {
    // Lower-cased and trimmed on the way in, so uniqueness is effectively
    // case-insensitive without a second index (BR-12).
    const email = normaliseEmail(input.email);
    if (email.length === 0) {
      fieldErrors.email = 'Email address is required.';
    } else if (email.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = 'Enter a valid email address.';
    } else {
      values.email = email;
    }
  }

  if (!options.partial || input.role !== undefined) {
    if (!isRole(input.role)) {
      fieldErrors.role = `Role must be one of ${ROLES.join(', ')}.`;
    } else {
      values.role = input.role;
    }
  }

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') {
      fieldErrors.isActive = 'isActive must be true or false.';
    } else {
      values.isActive = input.isActive;
    }
  } else if (!options.partial) {
    // Documented default for create (api-spec.md §3.19).
    values.isActive = true;
  }

  return { fieldErrors, values };
}

/** Prisma's unique-constraint failure on `email` (BR-12, BR-24). */
function isDuplicateEmail(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!candidate || candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes('email');
  return typeof target === 'string' ? target.includes('email') : true;
}

function sendDuplicateEmail(res: Response) {
  sendError(res, 409, 'CONFLICT', DUPLICATE_EMAIL_MESSAGE, { email: DUPLICATE_EMAIL_MESSAGE });
}

/** Loads one user for the edit panel, answering `404` itself. */
async function loadUser(res: Response, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { ...ADMIN_USER_SELECT }
  });

  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'User not found.');
    return null;
  }

  return user;
}

// GET /api/admin/users — the whole list, searched and filtered (api-spec.md
// §3.18, AC-25). No pagination: a lab-scale directory fits one screen (X-12).
adminRouter.get('/users', async (req, res) => {
  const fieldErrors: Record<string, string> = {};
  const query = req.query as Record<string, unknown>;

  const rawSearch = query.search;
  let search: string | null = null;
  if (rawSearch !== undefined) {
    if (typeof rawSearch !== 'string') {
      fieldErrors.search = 'search must be a single text value.';
    } else if (rawSearch.trim().length > SEARCH_MAX) {
      fieldErrors.search = `search must be at most ${SEARCH_MAX} characters.`;
    } else if (rawSearch.trim().length > 0) {
      search = rawSearch.trim();
    }
  }

  const rawRole = query.role;
  let role: Role | null = null;
  if (rawRole !== undefined && rawRole !== '') {
    if (!isRole(rawRole)) {
      fieldErrors.role = `role must be one of ${ROLES.join(', ')}.`;
    } else {
      role = rawRole;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  try {
    const users = await prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      select: ADMIN_USER_SELECT
    });

    res.json({ data: users });
  } catch (error) {
    sendInternalError(res, 'GET /api/admin/users', error);
  }
});

// POST /api/admin/users — create one account (api-spec.md §3.19, BR-24, AC-26).
//
// The new user always starts with `mustChangePassword`, so the initial password
// the Administrator types is a one-time credential rather than a password they
// now share with somebody (BR-02, BR-24).
adminRouter.post('/users', async (req, res) => {
  const { fieldErrors, values } = validateUserFields(req.body, { partial: false });

  const initialPassword = (req.body as { initialPassword?: unknown } | undefined)?.initialPassword;
  const passwordError = validatePassword(initialPassword);
  if (passwordError) fieldErrors.initialPassword = passwordError;

  if (Object.keys(fieldErrors).length > 0) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(initialPassword as string, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        name: values.name as string,
        email: values.email as string,
        role: values.role as Role,
        isActive: values.isActive ?? true,
        passwordHash,
        mustChangePassword: true
      },
      select: ADMIN_USER_SELECT
    });

    res.status(201).json(user);
  } catch (error) {
    // The unique index is the real check, not a prior `findFirst`: two
    // simultaneous creates would both pass a lookup and only one may win.
    if (isDuplicateEmail(error)) {
      sendDuplicateEmail(res);
      return;
    }
    sendInternalError(res, 'POST /api/admin/users', error);
  }
});

// GET /api/admin/users/:id — one user for the edit panel (api-spec.md §3.20).
adminRouter.get('/users/:id', async (req, res) => {
  try {
    const user = await loadUser(res, String(req.params.id));
    if (!user) return;

    res.json(user);
  } catch (error) {
    sendInternalError(res, 'GET /api/admin/users/:id', error);
  }
});

// PATCH /api/admin/users/:id — edit name, email, role and activation
// (api-spec.md §3.21, BR-25, BR-26, AC-27, AC-29).
adminRouter.patch('/users/:id', async (req, res) => {
  const { fieldErrors, values } = validateUserFields(req.body, { partial: true });

  if (Object.keys(fieldErrors).length > 0) {
    sendValidationFailed(res, fieldErrors);
    return;
  }

  try {
    const target = await loadUser(res, String(req.params.id));
    if (!target) return;

    const caller = getSessionUser(res);
    const deactivating = values.isActive === false && target.isActive;
    const demoting = values.role !== undefined && values.role !== 'Administrator' && target.role === 'Administrator';

    // BR-25: an Administrator locking themselves out is the one mistake that
    // cannot be undone from inside the application.
    if (deactivating && target.id === caller.id) {
      sendError(res, 409, 'CONFLICT', SELF_DEACTIVATION_MESSAGE);
      return;
    }

    // BR-26: the same applies to the group. Counted at the moment of the
    // change rather than trusted from the client, because the UI's disabled
    // toggle can be out of date by the time the request lands.
    if ((deactivating || demoting) && target.role === 'Administrator' && target.isActive) {
      const activeAdministrators = await prisma.user.count({
        where: { role: 'Administrator', isActive: true }
      });

      if (activeAdministrators <= 1) {
        sendError(res, 409, 'CONFLICT', LAST_ADMINISTRATOR_MESSAGE);
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      // Only the four editable fields, spread from the validated values: a
      // `passwordHash` or `mustChangePassword` in the body is never read.
      data: values,
      select: ADMIN_USER_SELECT
    });

    // BR-10, BR-27: a user who has lost their access — or gained different
    // access — must not keep acting on the old one. Deleting the rows makes
    // their next request a `401` rather than a privilege they no longer have.
    const roleChanged = values.role !== undefined && values.role !== target.role;
    if (deactivating || roleChanged) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }

    res.json(updated);
  } catch (error) {
    if (isDuplicateEmail(error)) {
      sendDuplicateEmail(res);
      return;
    }
    sendInternalError(res, 'PATCH /api/admin/users/:id', error);
  }
});

// POST /api/admin/users/:id/initial-password — hand out a new one-time
// password (api-spec.md §3.22, BR-27, AC-28).
//
// Allowed on the caller's own account: an Administrator may reset themselves
// and will simply be forced to change it at the next login.
adminRouter.post('/users/:id/initial-password', async (req, res) => {
  const initialPassword = (req.body as { initialPassword?: unknown } | undefined)?.initialPassword;
  const passwordError = validatePassword(initialPassword);

  if (passwordError) {
    sendValidationFailed(res, { initialPassword: passwordError });
    return;
  }

  try {
    const target = await loadUser(res, String(req.params.id));
    if (!target) return;

    const passwordHash = await bcrypt.hash(initialPassword as string, BCRYPT_COST);

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash, mustChangePassword: true },
      select: ADMIN_USER_SELECT
    });

    // Every existing session dies with the old password, including the
    // caller's own if they reset themselves (BR-27).
    await prisma.session.deleteMany({ where: { userId: target.id } });

    res.json(updated);
  } catch (error) {
    sendInternalError(res, 'POST /api/admin/users/:id/initial-password', error);
  }
});
