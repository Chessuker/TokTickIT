import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    requesterUser: { findFirst: vi.fn() },
    category: { findFirst: vi.fn() },
    relatedSystem: { findFirst: vi.fn(), findMany: vi.fn() },
    ticket: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';

/**
 * API-01 / API-02 / API-03 — POST /api/tickets (AC-01, BR-01, BR-02).
 *
 * The suite runs without PostgreSQL: `src/db.js` is mocked, and `$transaction`
 * hands the callback the same mock client so the route's read-then-insert path
 * is exercised exactly as it runs in production.
 */

const REQUESTER_ID = '6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2';
const OTHER_REQUESTER_ID = '11111111-2222-4333-8444-555555555555';
const CATEGORY_ID = 'a1b2c3d4-1111-4222-8333-444455556666';
const RELATED_SYSTEM_ID = 'b2c3d4e5-1111-4222-8333-444455556666';

const REQUESTER = {
  id: REQUESTER_ID,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar'
};

const VALID_BODY = {
  summary: 'Laptop battery drains quickly',
  description: 'The battery drops from 100% to 20% within an hour of unplugging.',
  categoryId: CATEGORY_ID,
  relatedSystemId: RELATED_SYSTEM_ID,
  priority: 'Medium'
};

function createdTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c3d4e5f6-1111-4222-8333-444455556666',
    ticketNumber: 'TKT-2026-000001',
    summary: VALID_BODY.summary,
    description: VALID_BODY.description,
    status: 'New',
    priority: 'Medium',
    createdAt: new Date('2026-08-23T04:15:00.000Z'),
    updatedAt: new Date('2026-08-23T04:15:00.000Z'),
    category: { id: CATEGORY_ID, name: 'Hardware' },
    relatedSystem: { id: RELATED_SYSTEM_ID, name: 'Corporate Laptop' },
    requester: REQUESTER,
    ...overrides
  };
}

function post(body: unknown, requesterId: string | null = REQUESTER_ID) {
  const pending = request(app).post('/api/tickets');
  return requesterId === null ? pending.send(body) : pending.set('X-Requester-Id', requesterId).send(body);
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(prisma.requesterUser.findFirst).mockResolvedValue(REQUESTER);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: CATEGORY_ID });
  vi.mocked(prisma.relatedSystem.findFirst).mockResolvedValue({ id: RELATED_SYSTEM_ID });
  // No ticket exists yet, so the generator starts the year at sequence 1.
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.ticket.create).mockResolvedValue(createdTicket());
  vi.mocked(prisma.$transaction).mockImplementation((callback: (tx: unknown) => unknown) =>
    Promise.resolve(callback(prisma))
  );
});

describe('POST /api/tickets — valid create (API-01, AC-01)', () => {
  it('returns 201 with the created ticket and its ticket number', async () => {
    const res = await post(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toBe('TKT-2026-000001');
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.id).toBeTruthy();
    expect(res.body.summary).toBe(VALID_BODY.summary);
  });

  it('persists the ticket with a server-generated number inside one transaction', async () => {
    await post(VALID_BODY);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ticket.create).toHaveBeenCalledTimes(1);

    const data = vi.mocked(prisma.ticket.create).mock.calls[0][0].data;
    expect(data.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(data.summary).toBe(VALID_BODY.summary);
    expect(data.description).toBe(VALID_BODY.description);
    expect(data.categoryId).toBe(CATEGORY_ID);
    expect(data.relatedSystemId).toBe(RELATED_SYSTEM_ID);
    expect(data.priority).toBe('Medium');
  });

  it('associates the ticket with the requester from X-Requester-Id, not the body', async () => {
    await post({ ...VALID_BODY, requesterId: OTHER_REQUESTER_ID });

    const data = vi.mocked(prisma.ticket.create).mock.calls[0][0].data;
    expect(data.requesterId).toBe(REQUESTER_ID);
  });

  it('trims summary and description before storing them', async () => {
    await post({ ...VALID_BODY, summary: '   Printer jams   ', description: '   Paper jams on every print job.   ' });

    const data = vi.mocked(prisma.ticket.create).mock.calls[0][0].data;
    expect(data.summary).toBe('Printer jams');
    expect(data.description).toBe('Paper jams on every print job.');
  });

  it('returns an empty attachment list on a freshly created ticket', async () => {
    const res = await post(VALID_BODY);

    expect(res.body.attachments).toEqual([]);
    expect(res.body.attachmentCount).toBe(0);
  });
});

describe('POST /api/tickets — initial status (API-02, BR-02)', () => {
  it('returns a ticket whose status is New', async () => {
    const res = await post(VALID_BODY);

    expect(res.body.status).toBe('New');
  });

  it('never writes a status, leaving the schema default to own it', async () => {
    await post(VALID_BODY);

    const data = vi.mocked(prisma.ticket.create).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
  });

  it('rejects a client-supplied status instead of honouring it', async () => {
    const res = await post({ ...VALID_BODY, status: 'Closed' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toHaveProperty('status');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('rejects a client-supplied ticket number (BR-01)', async () => {
    const res = await post({ ...VALID_BODY, ticketNumber: 'TKT-1999-000001' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('ticketNumber');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/tickets — validation (API-03, AC-01)', () => {
  it('returns 400 with a field error for every missing required field', async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'categoryId',
      'description',
      'priority',
      'relatedSystemId',
      'summary'
    ]);
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it.each([
    ['summary', 'summary'],
    ['description', 'description'],
    ['categoryId', 'categoryId'],
    ['relatedSystemId', 'relatedSystemId'],
    ['priority', 'priority']
  ])('names %s when only that field is missing', async (omitted, expectedKey) => {
    const body: Record<string, unknown> = { ...VALID_BODY };
    delete body[omitted];

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual([expectedKey]);
  });

  it('treats a whitespace-only value as missing', async () => {
    const res = await post({ ...VALID_BODY, summary: '     ' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.summary).toBe('Summary is required.');
  });

  it('rejects a summary shorter than the minimum length', async () => {
    const res = await post({ ...VALID_BODY, summary: 'Wifi' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.summary).toMatch(/between 5 and 150/);
  });

  it('rejects a summary longer than the maximum length', async () => {
    const res = await post({ ...VALID_BODY, summary: 'a'.repeat(151) });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.summary).toMatch(/between 5 and 150/);
  });

  it('rejects a priority outside Low, Medium and High', async () => {
    const res = await post({ ...VALID_BODY, priority: 'Urgent' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.priority).toMatch(/Low, Medium, High/);
  });

  it('rejects a category that does not exist or is inactive', async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValueOnce(null);

    const res = await post(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error.fields.categoryId).toBe('Category not found.');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('rejects a related system that does not exist or is inactive', async () => {
    vi.mocked(prisma.relatedSystem.findFirst).mockResolvedValueOnce(null);

    const res = await post(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error.fields.relatedSystemId).toBe('Related System not found.');
  });
});

describe('POST /api/tickets — requester context (api-spec §1.1)', () => {
  it('returns 400 REQUESTER_REQUIRED when the header is absent', async () => {
    const res = await post(VALID_BODY, null);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUESTER_REQUIRED');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('returns 400 REQUESTER_REQUIRED when the header is malformed', async () => {
    const res = await post(VALID_BODY, 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUESTER_REQUIRED');
    expect(prisma.requesterUser.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when the header names an unknown or inactive requester', async () => {
    vi.mocked(prisma.requesterUser.findFirst).mockResolvedValueOnce(null);

    const res = await post(VALID_BODY, OTHER_REQUESTER_ID);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it('resolves the requester with an active-only lookup (BR-11)', async () => {
    await post(VALID_BODY);

    expect(prisma.requesterUser.findFirst).toHaveBeenCalledWith({
      where: { id: REQUESTER_ID, isActive: true },
      select: { id: true, name: true, email: true, department: true }
    });
  });
});

describe('POST /api/tickets — failure handling (api-spec §1.3)', () => {
  it('returns a safe 500 envelope when the insert fails', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('relation "Ticket" does not exist'));

    const res = await post(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('relation "Ticket" does not exist');
  });

  it('retries once and succeeds when a concurrent create takes the ticket number', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['ticketNumber'] }
    });
    vi.mocked(prisma.ticket.create).mockRejectedValueOnce(collision);

    const res = await post(VALID_BODY);

    expect(res.status).toBe(201);
    expect(prisma.ticket.create).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/related-systems (api-spec §3.3)', () => {
  it('returns active related systems under a data key, sorted by name', async () => {
    const relatedSystems = [
      { id: RELATED_SYSTEM_ID, name: 'Campus Wi-Fi' },
      { id: 'd4e5f6a7-1111-4222-8333-444455556666', name: 'VPN' }
    ];
    vi.mocked(prisma.relatedSystem.findMany).mockResolvedValue(relatedSystems);

    const res = await request(app).get('/api/related-systems');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(relatedSystems);
    expect(prisma.relatedSystem.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
  });
});

/**
 * API-04 / API-06 / API-13 — GET /api/tickets (AC-04, AC-10, AC-15, BR-04).
 *
 * These assert the *contract*, not Prisma: the mock returns whatever it is told
 * to, so what is checked is the `where` / `orderBy` / `skip` / `take` the route
 * builds from the query string, and the envelope it builds from the result.
 *
 * The ownership assertions matter most. A `where` that had lost its
 * `requesterId` would still return rows here — the mock does not care — so
 * every list test inspects the clause the route actually sent rather than
 * trusting the response body alone.
 */

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-1111-4222-8333-444455556666',
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    status: 'New',
    priority: 'Medium',
    createdAt: new Date('2026-08-23T04:15:00.000Z'),
    updatedAt: new Date('2026-08-23T04:15:00.000Z'),
    category: { id: CATEGORY_ID, name: 'Hardware' },
    relatedSystem: { id: RELATED_SYSTEM_ID, name: 'Corporate Laptop' },
    attachments: [],
    ...overrides
  };
}

function listTickets(queryString = '', requesterId: string | null = REQUESTER_ID) {
  const pending = request(app).get('/api/tickets' + queryString);
  return requesterId === null ? pending : pending.set('X-Requester-Id', requesterId);
}

/** The arguments the route handed to `findMany` on its most recent call. */
function lastFindManyArgs(): Record<string, any> {
  const calls = vi.mocked(prisma.ticket.findMany).mock.calls;
  return calls[calls.length - 1][0] as Record<string, any>;
}

function givenTickets(rows: unknown[], totalItems = rows.length) {
  vi.mocked(prisma.ticket.findMany).mockResolvedValue(rows as never);
  vi.mocked(prisma.ticket.count).mockResolvedValue(totalItems as never);
}

describe('GET /api/tickets — ownership scoping (API-04, AC-04, BR-04)', () => {
  it('returns the requester tickets under a data key with pagination metadata', async () => {
    givenTickets([ticketRow()]);

    const res = await listTickets();

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].ticketNumber).toBe('TKT-2026-000001');
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    });
  });

  it('scopes both the page and the count to the requester from X-Requester-Id', async () => {
    givenTickets([]);

    await listTickets();

    expect(lastFindManyArgs().where).toMatchObject({ requesterId: REQUESTER_ID });
    expect(vi.mocked(prisma.ticket.count).mock.calls[0][0].where).toMatchObject({
      requesterId: REQUESTER_ID
    });
  });

  it('ignores a requesterId supplied in the query string', async () => {
    givenTickets([]);

    await listTickets('?requesterId=' + OTHER_REQUESTER_ID);

    expect(lastFindManyArgs().where.requesterId).toBe(REQUESTER_ID);
    expect(JSON.stringify(lastFindManyArgs().where)).not.toContain(OTHER_REQUESTER_ID);
  });

  it('counts only active attachments on each list item', async () => {
    givenTickets([ticketRow({ attachments: [{ id: 'x' }, { id: 'y' }] })]);

    const res = await listTickets();

    expect(res.body.data[0].attachmentCount).toBe(2);
    expect(res.body.data[0]).not.toHaveProperty('attachments');
  });

  it('returns 400 REQUESTER_REQUIRED without the header', async () => {
    const res = await listTickets('', null);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUESTER_REQUIRED');
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when the header names an unknown or inactive requester', async () => {
    vi.mocked(prisma.requesterUser.findFirst).mockResolvedValueOnce(null);

    const res = await listTickets('', OTHER_REQUESTER_ID);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/tickets — search, filter, sort, pagination (API-06, AC-10)', () => {
  beforeEach(() => {
    givenTickets([ticketRow()], 34);
  });

  it('defaults to newest first, page 1, page size 10, tie-broken by id', async () => {
    await listTickets();

    const args = lastFindManyArgs();
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
  });

  it('matches search case-insensitively against ticket number, summary and description', async () => {
    await listTickets('?search=BATTERY');

    expect(lastFindManyArgs().where.OR).toEqual([
      { ticketNumber: { contains: 'BATTERY', mode: 'insensitive' } },
      { summary: { contains: 'BATTERY', mode: 'insensitive' } },
      { description: { contains: 'BATTERY', mode: 'insensitive' } }
    ]);
  });

  it('trims the search term and ignores one that is only whitespace', async () => {
    await listTickets('?search=%20%20printer%20%20');
    expect(lastFindManyArgs().where.OR[1]).toEqual({
      summary: { contains: 'printer', mode: 'insensitive' }
    });

    await listTickets('?search=%20%20%20');
    expect(lastFindManyArgs().where).not.toHaveProperty('OR');
  });

  it('filters by category and status alongside the ownership clause', async () => {
    await listTickets('?category=' + CATEGORY_ID + '&status=New');

    expect(lastFindManyArgs().where).toEqual({
      requesterId: REQUESTER_ID,
      categoryId: CATEGORY_ID,
      status: 'New'
    });
  });

  it.each([
    ['createdAt:asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
    ['ticketNumber:asc', [{ ticketNumber: 'asc' }, { id: 'asc' }]],
    ['ticketNumber:desc', [{ ticketNumber: 'desc' }, { id: 'asc' }]],
    ['priority:desc', [{ priority: 'desc' }, { id: 'asc' }]],
    ['priority:asc', [{ priority: 'asc' }, { id: 'asc' }]]
  ])('translates sort=%s into the matching orderBy', async (sort, expected) => {
    await listTickets('?sort=' + sort);

    expect(lastFindManyArgs().orderBy).toEqual(expected);
  });

  it('pages with skip/take and reports the page metadata', async () => {
    const res = await listTickets('?page=3&pageSize=10');

    const args = lastFindManyArgs();
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(res.body.pagination).toEqual({
      page: 3,
      pageSize: 10,
      totalItems: 34,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: true
    });
  });

  it('marks the last page as having no next page', async () => {
    const res = await listTickets('?page=4&pageSize=10');

    expect(res.body.pagination.hasNextPage).toBe(false);
    expect(res.body.pagination.hasPreviousPage).toBe(true);
  });

  it('honours a larger page size', async () => {
    const res = await listTickets('?pageSize=50');

    expect(lastFindManyArgs().take).toBe(50);
    expect(res.body.pagination).toMatchObject({ pageSize: 50, totalPages: 1 });
  });

  it('answers 200 with an empty page beyond the last one, not 404', async () => {
    givenTickets([], 34);

    const res = await listTickets('?page=99');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(34);
  });

  it.each([
    ['category=not-a-uuid', 'category'],
    ['status=Closed', 'status'],
    ['sort=summary:asc', 'sort'],
    ['page=0', 'page'],
    ['page=abc', 'page'],
    ['pageSize=25', 'pageSize']
  ])('rejects %s with a 400 naming the parameter', async (query, field) => {
    const res = await listTickets('?' + query);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toHaveProperty(field);
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('rejects a search term longer than 150 characters', async () => {
    const res = await listTickets('?search=' + 'a'.repeat(151));

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('search');
  });

  it('returns a safe 500 envelope when the query fails', async () => {
    vi.mocked(prisma.ticket.findMany).mockRejectedValueOnce(
      new Error('relation "Ticket" does not exist')
    );

    const res = await listTickets();

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('relation "Ticket" does not exist');
  });
});

describe('GET /api/tickets — filter that matches nothing (API-13, AC-15)', () => {
  it('returns 200 with an empty array and totalItems 0', async () => {
    givenTickets([], 0);

    const res = await listTickets('?search=nothing-matches-this');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    });
  });

  it('keeps the ownership clause on a filter that matches nothing', async () => {
    givenTickets([], 0);

    await listTickets('?category=' + CATEGORY_ID + '&status=New&search=zzz');

    expect(lastFindManyArgs().where.requesterId).toBe(REQUESTER_ID);
  });
});

/**
 * API-05 — GET /api/tickets/:id (AC-03, AC-05, BR-04).
 *
 * The detail route reads one row and compares its `requesterId` with the
 * resolved header. The assertions below pin both halves of that: the owner sees
 * the ticket, and Requester B gets `403` with no ticket data in the body.
 */
describe('GET /api/tickets/:id — ownership (API-05, AC-03, BR-04)', () => {
  const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';

  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      ...createdTicket(),
      requesterId: REQUESTER_ID,
      attachments: [],
      ...overrides
    };
  }

  function getDetail(requesterId: string | null = REQUESTER_ID) {
    const pending = request(app).get(`/api/tickets/${TICKET_ID}`);
    return requesterId === null ? pending : pending.set('X-Requester-Id', requesterId);
  }

  it('returns the ticket to the requester who owns it', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(detailRow());

    const res = await getDetail();

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe('TKT-2026-000001');
    expect(res.body.description).toBe(VALID_BODY.description);
    expect(res.body.attachments).toEqual([]);
    expect(res.body.attachmentCount).toBe(0);
  });

  it('answers 403 when Requester B reads Requester A\'s ticket', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      detailRow({ requesterId: OTHER_REQUESTER_ID })
    );

    const res = await getDetail();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('leaks no ticket content in the forbidden response', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      detailRow({ requesterId: OTHER_REQUESTER_ID })
    );

    const res = await getDetail();
    const body = JSON.stringify(res.body);

    expect(body).not.toContain(VALID_BODY.summary);
    expect(body).not.toContain(VALID_BODY.description);
    expect(body).not.toContain('TKT-2026-000001');
  });

  it('never exposes the internal requesterId to the owner either', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(detailRow());

    const res = await getDetail();

    expect(res.body.requesterId).toBeUndefined();
    expect(res.body.requester.id).toBe(REQUESTER_ID);
  });

  it('answers 404 for a ticket that does not exist', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await getDetail();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('requires a selected requester before reading anything', async () => {
    const res = await getDetail(null);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUESTER_REQUIRED');
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
  });

  it('counts active attachments only and orders removed ones last', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      detailRow({
        attachments: [
          {
            id: 'a-1',
            fileName: 'active.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            uploadedAt: new Date('2026-08-23T05:00:00.000Z'),
            isRemoved: false,
            removedReason: null,
            removedAt: null
          },
          {
            id: 'a-2',
            fileName: 'removed.png',
            mimeType: 'image/png',
            sizeBytes: 2048,
            uploadedAt: new Date('2026-08-23T04:00:00.000Z'),
            isRemoved: true,
            removedReason: 'Wrong screenshot',
            removedAt: new Date('2026-08-24T09:00:00.000Z')
          }
        ]
      })
    );

    const res = await getDetail();

    expect(res.status).toBe(200);
    expect(res.body.attachmentCount).toBe(1);
    expect(res.body.attachments[0].downloadUrl).toBe('/api/attachments/a-1/download');
    expect(res.body.attachments[1].downloadUrl).toBeNull();
    expect(res.body.attachments[1].removedReason).toBe('Wrong screenshot');
  });
});
