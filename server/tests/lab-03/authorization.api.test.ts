import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    category: { findFirst: vi.fn(), findMany: vi.fn() },
    relatedSystem: { findFirst: vi.fn(), findMany: vi.fn() },
    ticket: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    attachment: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, SARAH, cookieHeader, mockSessionFor } from './sessionMock.js';

/**
 * API-13, API-17, API-18 — server-side authorization on the routes that exist
 * after the authentication foundation (FR-04, AC-03, AC-12, AC-27, BR-03,
 * BR-10, BR-27, BR-30). The staff and admin route families are added by later
 * issues and get their own rows (API-14 … API-16) there.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const ATTACHMENT_ID = 'd4e5f6a7-1111-4222-8333-444455556666';
const OTHER_REQUESTER_ID = '99999999-2222-4333-8444-555555555555';

/** Every protected route the server exposes at this point, with a body where one is needed. */
const PROTECTED_ROUTES: { method: 'get' | 'post' | 'patch'; path: string }[] = [
  { method: 'get', path: '/api/auth/me' },
  { method: 'post', path: '/api/auth/logout' },
  { method: 'post', path: '/api/auth/change-password' },
  { method: 'get', path: '/api/categories' },
  { method: 'get', path: '/api/related-systems' },
  { method: 'get', path: '/api/tickets' },
  { method: 'post', path: '/api/tickets' },
  { method: 'get', path: `/api/tickets/${TICKET_ID}` },
  { method: 'post', path: `/api/tickets/${TICKET_ID}/attachments` },
  { method: 'get', path: `/api/attachments/${ATTACHMENT_ID}` },
  { method: 'get', path: `/api/attachments/${ATTACHMENT_ID}/download` },
  { method: 'patch', path: `/api/attachments/${ATTACHMENT_ID}/remove` }
];

function ticketRow(requesterId: string) {
  return {
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    description: 'Drops from 100% to 20% within an hour.',
    status: 'New',
    priority: 'Medium',
    itPriority: 'Medium',
    requesterResolvedAt: null,
    createdAt: new Date('2026-08-23T04:15:00.000Z'),
    updatedAt: new Date('2026-08-23T04:15:00.000Z'),
    category: { id: 'cat-1', name: 'Hardware' },
    relatedSystem: { id: 'sys-1', name: 'Corporate Laptop' },
    requester: { id: requesterId, name: 'Someone', email: 'someone@kmutt.ac.th', department: null },
    owner: null,
    requesterId,
    attachments: []
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((operations: unknown) =>
    (typeof operations === 'function'
      ? Promise.resolve((operations as (tx: unknown) => unknown)(prisma))
      : Promise.all(operations as Promise<unknown>[])) as never
  );
  vi.mocked(prisma.ticket.count).mockResolvedValue(0);
  vi.mocked(prisma.ticket.findMany).mockResolvedValue([]);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: 'cat-1' } as never);
  vi.mocked(prisma.relatedSystem.findFirst).mockResolvedValue({ id: 'sys-1' } as never);
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);
});

describe('Unauthenticated calls (API-13, AC-12, BR-30)', () => {
  it.each(PROTECTED_ROUTES)('$method $path answers 401 UNAUTHORIZED with no data', async ({ method, path }) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'You must sign in to continue.' }
    });
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('answers 401 with a cookie that resolves to no session', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const res = await request(app).get('/api/tickets').set('Cookie', cookieHeader('stale-token'));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('Client-supplied requesterId is ignored (API-17, AC-03, BR-03)', () => {
  beforeEach(() => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.create).mockResolvedValue(ticketRow(JENNIFER.id) as never);
  });

  it('creates the ticket for the session user even when the body names someone else', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookieHeader())
      .send({
        summary: 'Laptop battery drains quickly',
        description: 'Drops from 100% to 20% within an hour.',
        categoryId: 'cat-1',
        relatedSystemId: 'sys-1',
        priority: 'Medium',
        requesterId: OTHER_REQUESTER_ID
      });

    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.ticket.create).mock.calls[0][0].data as { requesterId: string };
    expect(data.requesterId).toBe(JENNIFER.id);
  });

  it('scopes the list to the session user even when the query names someone else', async () => {
    const res = await request(app)
      .get(`/api/tickets?requesterId=${OTHER_REQUESTER_ID}`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    const where = vi.mocked(prisma.ticket.findMany).mock.calls[0][0].where as { requesterId: string };
    expect(where.requesterId).toBe(JENNIFER.id);
    expect(JSON.stringify(where)).not.toContain(OTHER_REQUESTER_ID);
  });

  it('refuses another requester’s ticket with 403 and no ticket content', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow(OTHER_REQUESTER_ID) as never);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('Laptop battery');
  });
});

describe('Role gate on Requester-only routes (FR-04, BR-14)', () => {
  it.each([
    ['IT Staff', PRIYA],
    ['Administrator', ADMIN]
  ])('%s may read a ticket but is refused create, upload and remove', async (_label, user) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), user);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow(JENNIFER.id) as never);

    const read = await request(app).get(`/api/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    expect(read.status).toBe(200);
    expect(read.body.ticketNumber).toBe('TKT-2026-000001');

    const list = await request(app).get('/api/tickets').set('Cookie', cookieHeader());
    expect(list.status).toBe(403);

    const create = await request(app).post('/api/tickets').set('Cookie', cookieHeader()).send({});
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');

    const upload = await request(app)
      .post(`/api/tickets/${TICKET_ID}/attachments`)
      .set('Cookie', cookieHeader())
      .attach('file', Buffer.from('%PDF-1.4 test'), 'note.pdf');
    expect(upload.status).toBe(403);

    const remove = await request(app)
      .patch(`/api/attachments/${ATTACHMENT_ID}/remove`)
      .set('Cookie', cookieHeader())
      .send({ reason: 'Wrong file' });
    expect(remove.status).toBe(403);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('answers 404, not 403, when IT Staff open a ticket id that does not exist', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
  });
});

describe('Revoked sessions (API-18, AC-27, BR-10, BR-27)', () => {
  it('answers 401 once the session user has been deactivated', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), { ...JENNIFER, isActive: false });

    const res = await request(app).get('/api/tickets').set('Cookie', cookieHeader());

    expect(res.status).toBe(401);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('answers 401 once the session row has been deleted (role change, set-initial-password)', async () => {
    // Deletion of the row is what those operations do; from the request's
    // side the cookie simply resolves to nothing.
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const res = await request(app).get('/api/tickets').set('Cookie', cookieHeader());

    expect(res.status).toBe(401);
  });

  it('gates a pending password change on every data route, not only tickets', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);

    const categories = await request(app).get('/api/categories').set('Cookie', cookieHeader());
    const detail = await request(app).get(`/api/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(categories.status).toBe(403);
    expect(categories.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(detail.status).toBe(403);
    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
  });
});
