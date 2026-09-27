import { vi } from 'vitest';
import type { Role } from '@prisma/client';
import { SESSION_COOKIE, hashSessionToken } from '../../src/session.js';

/**
 * Shared session fixtures for the API suites. Every suite mocks `src/db.js`
 * itself (vitest hoists the mock per file); this module only knows how to
 * shape the rows `requireAuth` reads, so a route test can say "the caller is
 * Jennifer" in one line.
 */

export interface FixtureUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  isActive: boolean;
  department?: string | null;
}

export const JENNIFER: FixtureUser = {
  id: '6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: false,
  isActive: true,
  department: 'Registrar'
};

export const SARAH: FixtureUser = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Sarah Johnson',
  email: 'sarah.johnson@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: true,
  isActive: true,
  department: 'Finance'
};

export const PRIYA: FixtureUser = {
  id: '22222222-2222-4333-8444-555555555555',
  name: 'Priya Raman',
  email: 'priya.raman@kmutt.ac.th',
  role: 'ITStaff',
  mustChangePassword: false,
  isActive: true,
  department: 'IT Services'
};

export const ADMIN: FixtureUser = {
  id: '33333333-2222-4333-8444-555555555555',
  name: 'System Administrator',
  email: 'admin@toktickit.xyz',
  role: 'Administrator',
  mustChangePassword: false,
  isActive: true,
  department: null
};

/** The raw cookie value a test sends; the mock answers to its hash. */
export const RAW_TOKEN = 'test-session-token-0123456789abcdef0123456789';
export const SESSION_ID = 'sess-0000-1111';

export function cookieHeader(token: string = RAW_TOKEN): string {
  return `${SESSION_COOKIE}=${token}`;
}

/** The row `prisma.session.findUnique` answers for a live session of `user`. */
export function sessionRow(user: FixtureUser, overrides: { expiresAt?: Date; id?: string } = {}) {
  const { department: _department, ...rest } = user;
  return {
    id: overrides.id ?? SESSION_ID,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    user: rest
  };
}

/**
 * Wires `session.findUnique` so that the test cookie resolves to `user` and
 * anything else resolves to nothing — the same distinction the real table
 * makes.
 */
export function mockSessionFor(
  findUnique: ReturnType<typeof vi.fn>,
  user: FixtureUser,
  overrides: { expiresAt?: Date; id?: string } = {}
) {
  findUnique.mockImplementation(({ where }: { where: { tokenHash: string } }) =>
    Promise.resolve(where.tokenHash === hashSessionToken(RAW_TOKEN) ? sessionRow(user, overrides) : null)
  );
}
