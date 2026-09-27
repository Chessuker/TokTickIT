import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
}));

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from './sessionMock.js';

/**
 * API-15, API-40 … API-48 — Administrator user management
 * (FR-13, BR-24 … BR-27, AC-25 … AC-30).
 */

const TARGET_ID = '77777777-2222-4333-8444-555555555555';

function adminUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    name: 'Chen Wei',
    email: 'chen.wei@kmutt.ac.th',
    department: 'IT Services',
    role: 'ITStaff',
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: new Date('2026-09-14T08:12:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T08:12:00.000Z'),
    ...overrides
  };
}

/**
 * Applies a Prisma `select` to a row, as the real client does: the routes pass
 * `ADMIN_USER_SELECT`, so a stub that returned everything it was handed would
 * hide exactly the leak these tests are looking for.
 */
function applySelect(row: Record<string, unknown>, select: Record<string, boolean> | undefined) {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

/** Prisma's unique-constraint failure on `email`. */
function duplicateEmailError() {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: ['email'] }
  });
}

/** The last `data` written by `prisma.user.update`. */
function lastUpdate() {
  const calls = vi.mocked(prisma.user.update).mock.calls;
  return calls[calls.length - 1][0] as { where: unknown; data: Record<string, unknown> };
}

const VALID_CREATE = {
  name: '  Dara Suksan  ',
  email: '  Dara.Suksan@KMUTT.ac.th ',
  role: 'ITStaff',
  initialPassword: 'Welcome123!'
};

beforeEach(() => {
  vi.resetAllMocks();
  mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);
  vi.mocked(prisma.user.findMany).mockResolvedValue([adminUserRow()] as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(adminUserRow() as never);
  vi.mocked(prisma.user.create).mockImplementation(
    ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) =>
      Promise.resolve(applySelect(adminUserRow({ ...data, id: TARGET_ID }), select)) as never
  );
  vi.mocked(prisma.user.update).mockImplementation(
    ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) =>
      Promise.resolve(applySelect(adminUserRow(data), select)) as never
  );
  vi.mocked(prisma.user.count).mockResolvedValue(2 as never);
  vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 } as never);
});

describe('GET /api/admin/users (API-40, AC-25)', () => {
  it('lists every user sorted by name, with no password hash anywhere', async () => {
    const res = await request(app).get('/api/admin/users').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      id: TARGET_ID,
      name: 'Chen Wei',
      email: 'chen.wei@kmutt.ac.th',
      department: 'IT Services',
      role: 'ITStaff',
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: '2026-09-14T08:12:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-14T08:12:00.000Z'
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const query = vi.mocked(prisma.user.findMany).mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
      select: Record<string, boolean>;
    };
    expect(query.where).toEqual({});
    expect(query.orderBy).toEqual({ name: 'asc' });
    expect(query.select.passwordHash).toBeUndefined();
    // No pagination: the whole directory (X-12).
    expect(res.body).not.toHaveProperty('pagination');
  });

  it('searches name and email case-insensitively', async () => {
    await request(app).get('/api/admin/users?search=%20wei%20').set('Cookie', cookieHeader());

    const where = (vi.mocked(prisma.user.findMany).mock.calls[0][0] as { where: unknown }).where;
    expect(where).toEqual({
      OR: [
        { name: { contains: 'wei', mode: 'insensitive' } },
        { email: { contains: 'wei', mode: 'insensitive' } }
      ]
    });
  });

  it.each(['Requester', 'ITStaff', 'Administrator'])('filters by role=%s', async (role) => {
    await request(app).get(`/api/admin/users?role=${role}`).set('Cookie', cookieHeader());

    expect((vi.mocked(prisma.user.findMany).mock.calls[0][0] as { where: unknown }).where).toEqual({ role });
  });

  it('combines search and role', async () => {
    await request(app).get('/api/admin/users?search=chen&role=ITStaff').set('Cookie', cookieHeader());

    const where = (vi.mocked(prisma.user.findMany).mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.role).toBe('ITStaff');
    expect(where.OR).toBeDefined();
  });

  it.each([
    ['role=Manager', 'role'],
    [`search=${'x'.repeat(151)}`, 'search']
  ])('answers 400 for ?%s naming %s', async (params, field) => {
    const res = await request(app).get(`/api/admin/users?${params}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields)).toEqual([field]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('treats an empty role as no filter', async () => {
    const res = await request(app).get('/api/admin/users?role=').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.user.findMany).mock.calls[0][0] as { where: unknown }).where).toEqual({});
  });
});

describe('POST /api/admin/users (API-41, AC-26, BR-24)', () => {
  it('creates the user with mustChangePassword and a verifiable hash, and returns none of it', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookieHeader())
      .send(VALID_CREATE);

    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('Welcome123!');

    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, string | boolean>;
    // Name trimmed, email trimmed and lower-cased (BR-12).
    expect(data.name).toBe('Dara Suksan');
    expect(data.email).toBe('dara.suksan@kmutt.ac.th');
    expect(data.role).toBe('ITStaff');
    expect(data.isActive).toBe(true);
    expect(data.mustChangePassword).toBe(true);
    expect(bcrypt.compareSync('Welcome123!', String(data.passwordHash))).toBe(true);
  }, 20_000);

  it('honours isActive: false and ignores any other field', async () => {
    await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookieHeader())
      .send({
        ...VALID_CREATE,
        isActive: false,
        department: 'Smuggled',
        mustChangePassword: false,
        passwordHash: 'forged',
        id: 'forged-id'
      });

    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.isActive).toBe(false);
    expect(data.mustChangePassword).toBe(true);
    expect(data.passwordHash).not.toBe('forged');
    expect(data).not.toHaveProperty('department');
    expect(data).not.toHaveProperty('id');
  }, 20_000);

  it('answers 409 CONFLICT with fields.email for a duplicate email (API-42, BR-12)', async () => {
    vi.mocked(prisma.user.create).mockRejectedValue(duplicateEmailError());

    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookieHeader())
      .send({ ...VALID_CREATE, email: 'CHEN.WEI@kmutt.ac.th' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.fields.email).toBeDefined();
    // The lookup is case-insensitive because the value is lower-cased first.
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as { email: string };
    expect(data.email).toBe('chen.wei@kmutt.ac.th');
  }, 20_000);

  it.each([
    ['a missing name', { name: '' }, 'name'],
    ['a blank name', { name: '   ' }, 'name'],
    ['a missing email', { email: '' }, 'email'],
    ['a malformed email', { email: 'not-an-email' }, 'email'],
    ['an unknown role', { role: 'Manager' }, 'role'],
    ['a missing role', { role: undefined }, 'role'],
    ['a weak initial password', { initialPassword: 'welcome' }, 'initialPassword'],
    ['a missing initial password', { initialPassword: undefined }, 'initialPassword'],
    ['a non-boolean isActive', { isActive: 'yes' }, 'isActive']
  ])('answers 400 for %s (API-42)', async (_label, patch, field) => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookieHeader())
      .send({ ...VALID_CREATE, ...patch });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields[field]).toBeDefined();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('reports every bad field at once', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookieHeader())
      .send({ name: '', email: 'nope', role: 'Manager', initialPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'email',
      'initialPassword',
      'name',
      'role'
    ]);
  });
});

describe('GET /api/admin/users/:id (api-spec.md §3.20)', () => {
  it('answers the AdminUser, or 404 for an unknown id', async () => {
    const found = await request(app).get(`/api/admin/users/${TARGET_ID}`).set('Cookie', cookieHeader());
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(TARGET_ID);

    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const missing = await request(app).get(`/api/admin/users/${TARGET_ID}`).set('Cookie', cookieHeader());
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/admin/users/:id (API-43, AC-27, BR-25)', () => {
  it('updates name, email, role and isActive', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ name: '  Chen Wei Jr  ', email: 'CHEN.WEI2@kmutt.ac.th', role: 'Requester', isActive: false });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({
      name: 'Chen Wei Jr',
      email: 'chen.wei2@kmutt.ac.th',
      role: 'Requester',
      isActive: false
    });
  });

  it('writes only the fields present: a partial patch leaves the rest alone', async () => {
    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ isActive: false });

    expect(lastUpdate().data).toEqual({ isActive: false });
  });

  it('ignores password, department and mustChangePassword in the body (BR-25)', async () => {
    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({
        name: 'Chen Wei',
        password: 'Hacked123!',
        passwordHash: 'forged',
        department: 'Smuggled',
        mustChangePassword: false,
        lastLoginAt: '2000-01-01T00:00:00.000Z'
      });

    expect(lastUpdate().data).toEqual({ name: 'Chen Wei' });
  });

  it.each([
    ['a blank name', { name: '  ' }, 'name'],
    ['a malformed email', { email: 'nope' }, 'email'],
    ['an unknown role', { role: 'Manager' }, 'role'],
    ['a non-boolean isActive', { isActive: 'no' }, 'isActive']
  ])('answers 400 for %s', async (_label, body, field) => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.fields[field]).toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 409 with fields.email for a duplicate email', async () => {
    vi.mocked(prisma.user.update).mockRejectedValue(duplicateEmailError());

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ email: 'admin@toktickit.xyz' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.fields.email).toBeDefined();
  });

  it('answers 404 for an unknown user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('Self-deactivation guard (API-44, AC-29, BR-25)', () => {
  it('refuses an Administrator deactivating their own account', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      adminUserRow({ id: ADMIN.id, role: 'Administrator', name: ADMIN.name, email: ADMIN.email }) as never
    );

    const res = await request(app)
      .patch(`/api/admin/users/${ADMIN.id}`)
      .set('Cookie', cookieHeader())
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('You cannot deactivate your own account.');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('lets an Administrator edit their own name and email', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      adminUserRow({ id: ADMIN.id, role: 'Administrator' }) as never
    );

    const res = await request(app)
      .patch(`/api/admin/users/${ADMIN.id}`)
      .set('Cookie', cookieHeader())
      .send({ name: 'System Admin' });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ name: 'System Admin' });
  });

  it('lets an Administrator deactivate somebody else', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ isActive: false });

    expect(res.status).toBe(200);
  });
});

describe('Last-active-Administrator guard (API-45, AC-29, BR-26)', () => {
  const lastAdmin = () =>
    adminUserRow({ id: TARGET_ID, role: 'Administrator', isActive: true, name: 'Second Admin' });

  beforeEach(() => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(lastAdmin() as never);
  });

  it.each([
    ['deactivating', { isActive: false }],
    ['changing the role of', { role: 'ITStaff' }]
  ])('refuses %s the last active Administrator', async (_label, body) => {
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('At least one active administrator is required.');
    expect(prisma.user.update).not.toHaveBeenCalled();

    expect(vi.mocked(prisma.user.count).mock.calls[0][0]).toEqual({
      where: { role: 'Administrator', isActive: true }
    });
  });

  it.each([
    ['deactivating', { isActive: false }],
    ['changing the role of', { role: 'ITStaff' }]
  ])('allows %s an Administrator when a second active one exists', async (_label, body) => {
    vi.mocked(prisma.user.count).mockResolvedValue(2 as never);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('does not count administrators when the target is not one', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(adminUserRow({ role: 'ITStaff' }) as never);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('does not count when an already-inactive Administrator is edited', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      adminUserRow({ role: 'Administrator', isActive: false }) as never
    );

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ role: 'Requester' });

    expect(res.status).toBe(200);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('allows promoting somebody to Administrator without counting', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(adminUserRow({ role: 'ITStaff' }) as never);

    const res = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ role: 'Administrator' });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ role: 'Administrator' });
  });
});

describe('Session revocation on edit (API-48, AC-27, BR-10, BR-27)', () => {
  it('deletes the target’s sessions when they are deactivated', async () => {
    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ isActive: false });

    expect(vi.mocked(prisma.session.deleteMany).mock.calls[0][0]).toEqual({
      where: { userId: TARGET_ID }
    });
  });

  it('deletes them when the role changes', async () => {
    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ role: 'Requester' });

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it('leaves them alone for a name or email change, or an unchanged role', async () => {
    await request(app)
      .patch(`/api/admin/users/${TARGET_ID}`)
      .set('Cookie', cookieHeader())
      .send({ name: 'Chen W.', email: 'chen.w@kmutt.ac.th', role: 'ITStaff', isActive: true });

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/users/:id/initial-password (API-46, AC-28, BR-27)', () => {
  it('stores a new hash, forces a change and deletes every session', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/initial-password`)
      .set('Cookie', cookieHeader())
      .send({ initialPassword: 'Reset123!pass' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('Reset123!pass');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const data = lastUpdate().data as { passwordHash: string; mustChangePassword: boolean };
    expect(bcrypt.compareSync('Reset123!pass', data.passwordHash)).toBe(true);
    expect(data.mustChangePassword).toBe(true);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  }, 20_000);

  it.each([
    ['too short', 'Ab1!'],
    ['no digit', 'Password!'],
    ['no special character', 'Password123'],
    ['no upper case', 'password123!'],
    ['missing', undefined]
  ])('answers 400 for a password that is %s', async (_label, password) => {
    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/initial-password`)
      .set('Cookie', cookieHeader())
      .send(password === undefined ? {} : { initialPassword: password });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.initialPassword).toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/admin/users/${TARGET_ID}/initial-password`)
      .set('Cookie', cookieHeader())
      .send({ initialPassword: 'Reset123!pass' });

    expect(res.status).toBe(404);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('is allowed on the caller’s own account, ending their own session', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      adminUserRow({ id: ADMIN.id, role: 'Administrator' }) as never
    );

    const res = await request(app)
      .post(`/api/admin/users/${ADMIN.id}/initial-password`)
      .set('Cookie', cookieHeader())
      .send({ initialPassword: 'Reset123!pass' });

    expect(res.status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: ADMIN.id } });
  }, 20_000);
});

describe('Only an Administrator reaches these routes (API-15, API-47, AC-30)', () => {
  const ADMIN_ROUTES: { method: 'get' | 'post' | 'patch'; path: string; body?: object }[] = [
    { method: 'get', path: '/api/admin/users' },
    { method: 'post', path: '/api/admin/users', body: VALID_CREATE },
    { method: 'get', path: `/api/admin/users/${TARGET_ID}` },
    { method: 'patch', path: `/api/admin/users/${TARGET_ID}`, body: { name: 'Nope' } },
    {
      method: 'post',
      path: `/api/admin/users/${TARGET_ID}/initial-password`,
      body: { initialPassword: 'Reset123!pass' }
    }
  ];

  it.each(ADMIN_ROUTES)('refuses IT Staff on $method $path (API-15)', async ({ method, path, body }) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);

    const res = await request(app)[method](path).set('Cookie', cookieHeader()).send(body ?? {});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' }
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROUTES)('refuses a Requester on $method $path with no user data', async ({ method, path, body }) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    const res = await request(app)[method](path).set('Cookie', cookieHeader()).send(body ?? {});

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('chen.wei');
    expect(JSON.stringify(res.body)).not.toContain('Chen Wei');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROUTES)('answers 401 without a session on $method $path', async ({ method, path, body }) => {
    const res = await request(app)[method](path).send(body ?? {});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('Safe failures (BR-30, AC-34)', () => {
  it('answers a generic 500 with a correlation id when the query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error('relation "User" does not exist'));

    const res = await request(app).get('/api/admin/users').set('Cookie', cookieHeader());

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('does not exist');
    expect(typeof res.body.error.correlationId).toBe('string');
  });
});
