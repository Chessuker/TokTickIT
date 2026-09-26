import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    ticket: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { loginThrottle } from '../../src/loginThrottle.js';
import { SESSION_COOKIE, SESSION_TTL_MS, hashSessionToken } from '../../src/session.js';
import { JENNIFER, RAW_TOKEN, SARAH, SESSION_ID, cookieHeader, mockSessionFor } from './sessionMock.js';
import type { FixtureUser } from './sessionMock.js';

/**
 * API-01 … API-07 and API-09 … API-12 — the four authentication endpoints
 * (FR-01 … FR-03, AC-01, AC-02, AC-05 … AC-10). PostgreSQL is mocked; bcrypt
 * is real, at a low cost so the suite stays quick.
 */

const PASSWORD = 'Requester1!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const INACTIVE_ALEX: FixtureUser = {
  id: '55555555-2222-4333-8444-555555555555',
  name: 'Alex Smith',
  email: 'alex.smith@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: true,
  isActive: false
};

/** What `user.findUnique` answers for the login route's select. */
function userRow(user: FixtureUser, passwordHash: string = PASSWORD_HASH) {
  const { department: _department, ...rest } = user;
  return { ...rest, passwordHash };
}

function login(body: unknown) {
  return request(app).post('/api/auth/login').send(body);
}

function cookieValue(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

beforeEach(() => {
  vi.resetAllMocks();
  loginThrottle.clear();

  vi.mocked(prisma.user.findUnique).mockImplementation(({ where }: { where: { email?: string; id?: string } }) => {
    const users = [JENNIFER, SARAH, INACTIVE_ALEX];
    const match = users.find((user) => user.email === where.email || user.id === where.id);
    return Promise.resolve(match ? userRow(match) : null) as never;
  });
  vi.mocked(prisma.session.create).mockResolvedValue({ id: SESSION_ID } as never);
  vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 });
  // Honours `select` the way Prisma does, so a route that forgot to narrow
  // its response would leak the hash here exactly as it would in production.
  vi.mocked(prisma.user.update).mockImplementation(
    ({ where, data, select }: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const row = { ...userRow([JENNIFER, SARAH].find((user) => user.id === where.id) ?? JENNIFER), ...data };
      const picked = select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof typeof row]])) : row;
      return Promise.resolve(picked) as never;
    }
  );
  vi.mocked(prisma.$transaction).mockImplementation((operations: unknown) =>
    Promise.all(operations as Promise<unknown>[]) as never
  );
});

describe('POST /api/auth/login — valid login (API-01, API-05, AC-01)', () => {
  it('returns 200 with the SessionUser and sets the session cookie', async () => {
    const res = await login({ email: JENNIFER.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: JENNIFER.id,
      name: JENNIFER.name,
      email: JENNIFER.email,
      role: 'Requester',
      mustChangePassword: false
    });

    const cookie = cookieValue(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(new RegExp(`Max-Age=${SESSION_TTL_MS / 1000}`));
  });

  it('never returns the password hash or the session row (BR-09)', async () => {
    const res = await login({ email: JENNIFER.email, password: PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain(PASSWORD_HASH);
    expect(body).not.toContain('tokenHash');
  });

  it('stores only the SHA-256 of the cookie token, with an 8 h expiry (BR-10)', async () => {
    const before = Date.now();
    const res = await login({ email: JENNIFER.email, password: PASSWORD });

    const rawToken = (cookieValue(res) as string).split(';')[0].split('=')[1];
    const data = vi.mocked(prisma.session.create).mock.calls[0][0].data as {
      tokenHash: string;
      userId: string;
      expiresAt: Date;
    };

    expect(data.userId).toBe(JENNIFER.id);
    expect(data.tokenHash).toBe(hashSessionToken(rawToken));
    expect(data.tokenHash).not.toBe(rawToken);
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
  });

  it('stamps lastLoginAt on the user', async () => {
    await login({ email: JENNIFER.email, password: PASSWORD });

    const call = vi.mocked(prisma.user.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: JENNIFER.id });
    expect((call.data as { lastLoginAt: unknown }).lastLoginAt).toBeInstanceOf(Date);
  });

  it('matches the email case-insensitively and trimmed (BR-12)', async () => {
    const res = await login({ email: '  Jennifer.Anderson@KMUTT.ac.th ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0][0].where).toEqual({ email: JENNIFER.email });
  });

  it('replaces an existing session when the caller already holds one', async () => {
    const res = await login({ email: JENNIFER.email, password: PASSWORD }).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(RAW_TOKEN) }
    });
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/login — invalid credentials (API-02, AC-05, BR-06)', () => {
  it('answers an unknown email and a wrong password with byte-identical 401 bodies', async () => {
    const unknown = await login({ email: 'nobody@kmutt.ac.th', password: PASSWORD });
    const wrong = await login({ email: JENNIFER.email, password: 'WrongPassword1!' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(wrong.body));
    expect(unknown.body.error.message).toBe('Invalid email or password.');
  });

  it('sets no cookie and creates no session on failure', async () => {
    const res = await login({ email: JENNIFER.email, password: 'WrongPassword1!' });

    expect(cookieValue(res)).toBeUndefined();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('refuses a migrated user whose hash has not been seeded yet (AD-13)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow(JENNIFER, '') as never);

    const res = await login({ email: JENNIFER.email, password: '' + PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/auth/login — inactive account (API-03, AC-06, BR-01)', () => {
  it('answers 403 ACCOUNT_INACTIVE only when the password is correct', async () => {
    const res = await login({ email: INACTIVE_ALEX.email, password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(res.body.error.message).toBe('This account is inactive. Please contact an administrator.');
    expect(cookieValue(res)).toBeUndefined();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('answers 401, not 403, when the password for an inactive account is wrong', async () => {
    const res = await login({ email: INACTIVE_ALEX.email, password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/auth/login — throttling (API-04, AC-07, BR-07)', () => {
  it('answers 429 on the sixth attempt for one email, even with the right password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await login({ email: JENNIFER.email, password: 'WrongPassword1!' });
      expect(res.status).toBe(401);
    }

    const sixth = await login({ email: JENNIFER.email, password: PASSWORD });

    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(sixth.body.error.message).toBe('Too many failed attempts. Try again in a few minutes.');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('does not count 403 ACCOUNT_INACTIVE answers towards the limit', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await login({ email: INACTIVE_ALEX.email, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    }
  });

  it('resets the counter after a successful login', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login({ email: JENNIFER.email, password: 'WrongPassword1!' });
    }
    expect((await login({ email: JENNIFER.email, password: PASSWORD })).status).toBe(200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login({ email: JENNIFER.email, password: 'WrongPassword1!' });
    }
    expect((await login({ email: JENNIFER.email, password: PASSWORD })).status).toBe(200);
  });
});

describe('POST /api/auth/login — body validation (API-06, AC-05)', () => {
  it('returns 400 with fields when the email is missing', async () => {
    const res = await login({ password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.email).toBeTruthy();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 with fields when the email is malformed', async () => {
    const res = await login({ email: 'not-an-email', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.email).toBeTruthy();
  });

  it('returns 400 with fields when the password is empty', async () => {
    const res = await login({ email: JENNIFER.email, password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.password).toBeTruthy();
  });

  it('returns both field errors at once for an empty body', async () => {
    const res = await login({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'password']);
  });
});

describe('POST /api/auth/logout (API-07, AC-08, BR-10)', () => {
  it('deletes the session row, clears the cookie and answers 204', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader());

    expect(res.status).toBe(204);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
    expect(cookieValue(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('is allowed while a password change is pending', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader());

    expect(res.status).toBe(204);
  });

  it('answers 401 and still clears the cookie when there is no valid session', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader('stale'));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(cookieValue(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('makes the deleted session unusable: GET /api/auth/me answers 401 afterwards', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    await request(app).post('/api/auth/logout').set('Cookie', cookieHeader());

    // The row is gone from the table, so the same cookie now resolves to nothing.
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader());

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me (API-09, AC-01, BR-02)', () => {
  it('returns the SessionUser for a valid session', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: JENNIFER.id,
      name: JENNIFER.name,
      email: JENNIFER.email,
      role: 'Requester',
      mustChangePassword: false
    });
  });

  it('answers 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('answers 401 for an unknown token', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader('forged'));

    expect(res.status).toBe(401);
  });

  it('answers 401 for an expired session and deletes the row', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER, { expiresAt: new Date(Date.now() - 1000) });
    vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader());

    expect(res.status).toBe(401);
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
  });

  it('answers 401 when the session user has been deactivated', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), { ...JENNIFER, isActive: false });

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader());

    expect(res.status).toBe(401);
  });

  it('is allow-listed while a password change is pending, reporting mustChangePassword: true', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });
});

describe('Password-change gate (API-10, AC-02, BR-02)', () => {
  it('answers 403 PASSWORD_CHANGE_REQUIRED on a data endpoint while the change is pending', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);

    const res = await request(app).get('/api/tickets').set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/change-password — validation (API-11, AC-09, BR-08, BR-11)', () => {
  beforeEach(() => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);
  });

  function change(body: unknown) {
    return request(app).post('/api/auth/change-password').set('Cookie', cookieHeader()).send(body);
  }

  it('names currentPassword when the current password is wrong — as a 400, not a 401', async () => {
    const res = await change({ currentPassword: 'Nope12345!', newPassword: 'Stronger1!', confirmPassword: 'Stronger1!' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toEqual({ currentPassword: 'Current password is incorrect.' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('names newPassword when the new password breaks the policy', async () => {
    const res = await change({ currentPassword: PASSWORD, newPassword: 'weak', confirmPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.newPassword).toMatch(/at least 8/);
    expect(res.body.error.fields.currentPassword).toBeUndefined();
  });

  it('names newPassword when it equals the current password', async () => {
    const res = await change({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.newPassword).toMatch(/differ/);
  });

  it('names confirmPassword when the confirmation does not match', async () => {
    const res = await change({ currentPassword: PASSWORD, newPassword: 'Stronger1!', confirmPassword: 'Stronger2!' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ confirmPassword: 'Passwords do not match.' });
  });

  it('reports every failing field at once for an empty body', async () => {
    const res = await change({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['confirmPassword', 'currentPassword', 'newPassword']);
  });

  it('answers 401 without a session', async () => {
    const res = await request(app).post('/api/auth/change-password').send({});

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password — success (API-12, AC-10, BR-11)', () => {
  it('stores a new bcrypt hash, clears mustChangePassword and keeps the current session', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader())
      .send({ currentPassword: PASSWORD, newPassword: 'Stronger1!', confirmPassword: 'Stronger1!' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);
    expect(res.body.id).toBe(SARAH.id);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const update = vi.mocked(prisma.user.update).mock.calls[0][0];
    const data = update.data as { passwordHash: string; mustChangePassword: boolean };
    expect(update.where).toEqual({ id: SARAH.id });
    expect(data.mustChangePassword).toBe(false);
    expect(data.passwordHash).not.toBe('Stronger1!');
    expect(bcrypt.compareSync('Stronger1!', data.passwordHash)).toBe(true);

    // Other sessions die; this one survives.
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: SARAH.id, id: { not: SESSION_ID } }
    });
    expect(cookieValue(res)).toBeUndefined();
  });
});
