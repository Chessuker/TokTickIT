import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    requesterUser: { findFirst: vi.fn() },
    category: { findFirst: vi.fn() },
    relatedSystem: { findFirst: vi.fn(), findMany: vi.fn() },
    ticket: { findFirst: vi.fn(), create: vi.fn() },
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
