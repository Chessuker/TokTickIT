import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { findMany: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn() }
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, SARAH, cookieHeader, mockSessionFor } from './sessionMock.js';

/**
 * API-26 … API-30 — the IT Staff Ticket Queue and the assignee list
 * (FR-08, AD-10, AC-16, AC-17, AC-19).
 */

const CATEGORY_ID = 'a1b2c3d4-1111-4222-8333-444455556666';
const OTHER_STAFF_ID = '44444444-2222-4333-8444-555555555555';

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c3d4e5f6-1111-4222-8333-444455556666',
    ticketNumber: 'TKT-2026-000042',
    summary: 'Laptop battery drains quickly',
    status: 'InProgress',
    priority: 'Medium',
    itPriority: 'High',
    requesterResolvedAt: null,
    createdAt: new Date('2026-09-10T04:15:00.000Z'),
    updatedAt: new Date('2026-09-14T09:30:00.000Z'),
    category: { id: CATEGORY_ID, name: 'Hardware' },
    requester: { id: JENNIFER.id, name: JENNIFER.name, role: 'Requester' },
    owner: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
    ...overrides
  };
}

function lastQuery() {
  const calls = vi.mocked(prisma.ticket.findMany).mock.calls;
  return calls[calls.length - 1][0] as {
    where: Record<string, unknown>;
    orderBy: unknown;
    skip: number;
    take: number;
    select: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.ticket.count).mockResolvedValue(1);
  vi.mocked(prisma.ticket.findMany).mockResolvedValue([ticketRow()] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: OTHER_STAFF_ID, name: 'Chen Wei' },
    { id: PRIYA.id, name: PRIYA.name }
  ] as never);
});

describe('GET /api/staff/tickets — default request (API-26, AC-16, AD-10)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it('lists every requester’s tickets, newest-updated first, 10 per page, with metadata', async () => {
    vi.mocked(prisma.ticket.count).mockResolvedValue(87);

    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 87,
      totalPages: 9,
      hasNextPage: true,
      hasPreviousPage: false
    });

    const query = lastQuery();
    // No requester scope: the queue spans the system.
    expect(query.where).toEqual({});
    expect(query.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
    expect(query.skip).toBe(0);
    expect(query.take).toBe(10);
    expect(vi.mocked(prisma.ticket.count).mock.calls[0][0]).toEqual({ where: {} });
  });

  it('answers the StaffTicketListItem shape with requestedPriority, requester and owner refs', async () => {
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());

    expect(res.body.data[0]).toEqual({
      id: 'c3d4e5f6-1111-4222-8333-444455556666',
      ticketNumber: 'TKT-2026-000042',
      summary: 'Laptop battery drains quickly',
      status: 'InProgress',
      requestedPriority: 'Medium',
      itPriority: 'High',
      requesterResolvedAt: null,
      createdAt: '2026-09-10T04:15:00.000Z',
      updatedAt: '2026-09-14T09:30:00.000Z',
      category: { id: CATEGORY_ID, name: 'Hardware' },
      requester: { id: JENNIFER.id, name: JENNIFER.name, role: 'Requester' },
      owner: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' }
    });
    expect(res.body.data[0]).not.toHaveProperty('priority');
    expect(res.body.data[0]).not.toHaveProperty('description');
  });

  it('never selects the requester’s email or anything from the user beyond the UserRef', async () => {
    await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());

    const select = lastQuery().select as { requester: { select: unknown }; owner: { select: unknown } };
    expect(select.requester.select).toEqual({ id: true, name: true, role: true });
    expect(select.owner.select).toEqual({ id: true, name: true, role: true });
  });

  it('answers a safe 500 envelope when the query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(prisma.ticket.findMany).mockRejectedValue(new Error('relation "Ticket" does not exist'));

    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // The key "correlationId" itself contains "relation", so check the message.
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('does not exist');
    expect(typeof res.body.error.correlationId).toBe('string');
  });
});

describe('GET /api/staff/tickets — filters (API-27, AC-17)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it('search matches ticketNumber and summary, case-insensitively, and nothing else', async () => {
    await request(app).get('/api/staff/tickets?search=%20battery%20').set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({
      OR: [
        { ticketNumber: { contains: 'battery', mode: 'insensitive' } },
        { summary: { contains: 'battery', mode: 'insensitive' } }
      ]
    });
  });

  it('a repeated status is an OR', async () => {
    await request(app)
      .get('/api/staff/tickets?status=Open&status=InProgress')
      .set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({ status: { in: ['Open', 'InProgress'] } });
  });

  it('itPriority and category filter on their columns', async () => {
    await request(app)
      .get(`/api/staff/tickets?itPriority=High&category=${CATEGORY_ID}`)
      .set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({ itPriority: 'High', categoryId: CATEGORY_ID });
  });

  it('owner=me resolves to the session user, never to a client-supplied id', async () => {
    await request(app)
      .get(`/api/staff/tickets?owner=me&ownerId=${OTHER_STAFF_ID}`)
      .set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({ ownerId: PRIYA.id });
  });

  it('owner=unassigned filters on a null owner', async () => {
    await request(app).get('/api/staff/tickets?owner=unassigned').set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({ ownerId: null });
  });

  it('owner=<uuid> filters on that IT Staff member', async () => {
    await request(app).get(`/api/staff/tickets?owner=${OTHER_STAFF_ID}`).set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({ ownerId: OTHER_STAFF_ID });
  });

  it('combines every filter with AND', async () => {
    await request(app)
      .get(`/api/staff/tickets?search=wifi&status=New&itPriority=Low&owner=unassigned&category=${CATEGORY_ID}`)
      .set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({
      OR: [
        { ticketNumber: { contains: 'wifi', mode: 'insensitive' } },
        { summary: { contains: 'wifi', mode: 'insensitive' } }
      ],
      status: { in: ['New'] },
      itPriority: 'Low',
      ownerId: null,
      categoryId: CATEGORY_ID
    });
  });

  it('ignores a requesterId parameter: the queue is never requester-scoped', async () => {
    await request(app).get(`/api/staff/tickets?requesterId=${JENNIFER.id}`).set('Cookie', cookieHeader());

    expect(lastQuery().where).toEqual({});
  });
});

describe('GET /api/staff/tickets — sorting (API-28, AC-17)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it.each([
    ['updatedAt:desc', { updatedAt: 'desc' }],
    ['updatedAt:asc', { updatedAt: 'asc' }],
    ['createdAt:desc', { createdAt: 'desc' }],
    ['createdAt:asc', { createdAt: 'asc' }],
    ['ticketNumber:desc', { ticketNumber: 'desc' }],
    ['ticketNumber:asc', { ticketNumber: 'asc' }],
    ['itPriority:desc', { itPriority: 'desc' }],
    ['itPriority:asc', { itPriority: 'asc' }],
    ['status:desc', { status: 'desc' }],
    ['status:asc', { status: 'asc' }]
  ])('sort=%s orders by the field then id asc', async (sort, expected) => {
    const res = await request(app).get(`/api/staff/tickets?sort=${sort}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(lastQuery().orderBy).toEqual([expected, { id: 'asc' }]);
  });

  it('pages with skip/take from page and pageSize', async () => {
    await request(app).get('/api/staff/tickets?page=3&pageSize=25').set('Cookie', cookieHeader());

    expect(lastQuery().skip).toBe(50);
    expect(lastQuery().take).toBe(25);
  });
});

describe('GET /api/staff/tickets — invalid parameters (API-29, AC-17)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it.each([
    ['status=Done', 'status'],
    ['status=Open&status=Done', 'status'],
    ['sort=priority:desc', 'sort'],
    ['pageSize=20', 'pageSize'],
    ['page=0', 'page'],
    ['itPriority=Urgent', 'itPriority'],
    ['owner=priya', 'owner'],
    ['category=hardware', 'category']
  ])('?%s → 400 naming %s and no query runs', async (params, field) => {
    const res = await request(app).get(`/api/staff/tickets?${params}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields)).toEqual([field]);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    expect(prisma.ticket.count).not.toHaveBeenCalled();
  });

  it('an out-of-range page answers 200 with an empty page and the real total', async () => {
    vi.mocked(prisma.ticket.count).mockResolvedValue(12);
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([]);

    const res = await request(app).get('/api/staff/tickets?page=9').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 9,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true
    });
  });
});

describe('GET /api/staff/assignees and role access (API-30, AC-16, AC-19, BR-27)', () => {
  it('lists active IT Staff only, sorted by name, as {id, name}', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);

    const res = await request(app).get('/api/staff/assignees').set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: OTHER_STAFF_ID, name: 'Chen Wei' },
        { id: PRIYA.id, name: PRIYA.name }
      ]
    });
    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]).toEqual({
      where: { role: 'ITStaff', isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
  });

  it('gives an Administrator the queue and the assignees (read-only continuity)', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);

    const queue = await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());
    const assignees = await request(app).get('/api/staff/assignees').set('Cookie', cookieHeader());

    expect(queue.status).toBe(200);
    expect(assignees.status).toBe(200);
  });

  it.each([
    ['/api/staff/tickets'],
    ['/api/staff/assignees'],
    ['/api/staff/tickets?owner=me']
  ])('refuses a Requester on %s with 403 before any lookup (API-14, AC-04)', async (path) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    const res = await request(app).get(path).set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' }
    });
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('answers 401 without a session and 403 PASSWORD_CHANGE_REQUIRED with a pending change', async () => {
    const anonymous = await request(app).get('/api/staff/tickets');
    expect(anonymous.status).toBe(401);

    mockSessionFor(vi.mocked(prisma.session.findUnique), SARAH);
    const pending = await request(app).get('/api/staff/tickets').set('Cookie', cookieHeader());
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });
});
