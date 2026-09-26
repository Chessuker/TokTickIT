import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    ticketInternalNote: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from './sessionMock.js';

/**
 * API-31 … API-37 — the staff Ticket Detail and the four operations
 * (FR-09 … FR-11, BR-15 … BR-20, BR-31, AC-18 … AC-22, AC-24).
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const CHEN_ID = '44444444-2222-4333-8444-555555555555';
const CATEGORY_ID = 'a1b2c3d4-1111-4222-8333-444455556666';

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000042',
    summary: 'Laptop battery drains quickly',
    description: 'Drops from 100% to 20% within an hour.',
    status: 'Open',
    priority: 'Medium',
    itPriority: 'High',
    requesterResolvedAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-09-10T04:15:00.000Z'),
    updatedAt: new Date('2026-09-14T09:30:00.000Z'),
    category: { id: CATEGORY_ID, name: 'Hardware' },
    relatedSystem: { id: 'sys-1', name: 'Corporate Laptop' },
    requester: {
      id: JENNIFER.id,
      name: JENNIFER.name,
      email: JENNIFER.email,
      department: 'Registrar',
      role: 'Requester'
    },
    owner: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
    ownerId: PRIYA.id,
    attachments: [],
    _count: { comments: 3, internalNotes: 2 },
    ...overrides
  };
}

/** Unassigned, still `New` — the state claim and the owner rule care about. */
function unownedRow(overrides: Record<string, unknown> = {}) {
  return ticketRow({ status: 'New', owner: null, ownerId: null, ...overrides });
}

const ATTACHMENTS = [
  {
    id: 'att-1',
    fileName: 'battery-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    uploadedAt: new Date('2026-09-10T05:00:00.000Z'),
    isRemoved: false,
    removedReason: null,
    removedAt: null
  },
  {
    id: 'att-2',
    fileName: 'wrong-shot.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    uploadedAt: new Date('2026-09-10T04:30:00.000Z'),
    isRemoved: true,
    removedReason: 'Uploaded the wrong screenshot',
    removedAt: new Date('2026-09-11T06:00:00.000Z')
  }
];

/** The last `data` written by `prisma.ticket.update`. */
function lastUpdate() {
  const calls = vi.mocked(prisma.ticket.update).mock.calls;
  return calls[calls.length - 1][0] as { where: unknown; data: Record<string, unknown> };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((operations: unknown) =>
    (typeof operations === 'function'
      ? Promise.resolve((operations as (tx: unknown) => unknown)(prisma))
      : Promise.all(operations as Promise<unknown>[])) as never
  );
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow() as never);
  vi.mocked(prisma.ticket.update).mockResolvedValue({ id: TICKET_ID } as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: CHEN_ID } as never);
  vi.mocked(prisma.ticketInternalNote.findMany).mockResolvedValue([] as never);
});

describe('GET /api/staff/tickets/:id (API-31, AC-24)', () => {
  it('answers the StaffTicketDetail shape with counts, attachments and permittedTransitions', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ attachments: ATTACHMENTS }) as never
    );

    const res = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe('TKT-2026-000042');
    expect(res.body.requestedPriority).toBe('Medium');
    expect(res.body.itPriority).toBe('High');
    expect(res.body.requester).toEqual({
      id: JENNIFER.id,
      name: JENNIFER.name,
      email: JENNIFER.email,
      department: 'Registrar',
      role: 'Requester'
    });
    expect(res.body.counts).toEqual({ comments: 3, internalNotes: 2, attachments: 1 });
    expect(res.body.permittedTransitions).toEqual([
      'InProgress',
      'WaitingForRequester',
      'Resolved',
      'Cancelled'
    ]);
    // Internal bookkeeping never reaches the client.
    expect(res.body).not.toHaveProperty('priority');
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('_count');
  });

  it('lists active attachments with a download url and removed ones without (AC-24)', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ attachments: ATTACHMENTS }) as never
    );

    const res = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.body.attachments).toHaveLength(2);
    expect(res.body.attachments[0]).toMatchObject({
      fileName: 'battery-report.pdf',
      isRemoved: false,
      downloadUrl: '/api/attachments/att-1/download'
    });
    expect(res.body.attachments[1]).toMatchObject({
      fileName: 'wrong-shot.png',
      isRemoved: true,
      removedReason: 'Uploaded the wrong screenshot',
      downloadUrl: null
    });
    expect(JSON.stringify(res.body)).not.toContain('storagePath');
  });

  it('hides the owner-only transitions on an unassigned ticket (BR-19)', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(unownedRow() as never);

    const res = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.body.permittedTransitions).toEqual(['Open', 'Cancelled']);
  });

  it('gives an Administrator the ticket but no permitted transitions (BR-17)', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);

    const res = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.permittedTransitions).toEqual([]);
  });

  it('answers 404 for an unknown id and 403 for a Requester', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);
    const missing = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    expect(missing.status).toBe(404);

    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockClear();
    const requester = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    expect(requester.status).toBe(403);
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
  });
});

describe('POST /api/staff/tickets/:id/claim (API-32, AC-18, BR-15, BR-31)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it('sets the caller as owner and opens a New ticket in the same write', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(unownedRow() as never);

    const res = await request(app)
      .post(`/api/staff/tickets/${TICKET_ID}/claim`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ ownerId: PRIYA.id, status: 'Open' });
  });

  it('leaves a non-New status alone when claiming', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ status: 'WaitingForRequester', owner: null, ownerId: null }) as never
    );

    await request(app).post(`/api/staff/tickets/${TICKET_ID}/claim`).set('Cookie', cookieHeader());

    expect(lastUpdate().data).toEqual({ ownerId: PRIYA.id });
  });

  it('takes a ticket over from another owner (reassign to self)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ owner: { id: CHEN_ID, name: 'Chen Wei', role: 'ITStaff' }, ownerId: CHEN_ID }) as never
    );

    const res = await request(app)
      .post(`/api/staff/tickets/${TICKET_ID}/claim`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ ownerId: PRIYA.id });
  });

  it.each(['Closed', 'Cancelled'])('answers 409 on a %s ticket (BR-31)', async (status) => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

    const res = await request(app)
      .post(`/api/staff/tickets/${TICKET_ID}/claim`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown ticket', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/staff/tickets/${TICKET_ID}/claim`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/staff/tickets/:id/owner (API-33, AC-19, BR-15, BR-31)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it('assigns another active IT Staff member', async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: CHEN_ID });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ ownerId: CHEN_ID });
    expect(vi.mocked(prisma.user.findFirst).mock.calls[0][0]).toEqual({
      where: { id: CHEN_ID, role: 'ITStaff', isActive: true },
      select: { id: true }
    });
  });

  it('opens a New ticket when it is assigned (BR-31)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(unownedRow() as never);

    await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: CHEN_ID });

    expect(lastUpdate().data).toEqual({ ownerId: CHEN_ID, status: 'Open' });
  });

  it('unassigns with ownerId null, without touching the status', async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: null });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ ownerId: null });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an inactive or non-IT-Staff target with 400 under ownerId (AC-19)', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: JENNIFER.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.ownerId).toMatch(/active IT Staff/i);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', {}],
    ['a non-string id', { ownerId: 42 }]
  ])('answers 400 for %s', async (_label, body) => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.fields.ownerId).toBeDefined();
  });

  it('refuses to unassign an InProgress ticket with 409 (BR-31)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status: 'InProgress' }) as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: null });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toMatch(/In Progress/i);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('allows reassigning an InProgress ticket to somebody else', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status: 'InProgress' }) as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: CHEN_ID });

    expect(res.status).toBe(200);
  });

  it.each(['Closed', 'Cancelled'])('answers 409 on a %s ticket', async (status) => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/owner`)
      .set('Cookie', cookieHeader())
      .send({ ownerId: CHEN_ID });

    expect(res.status).toBe(409);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/staff/tickets/:id/it-priority (API-34, AC-20, BR-16, BR-31)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it.each(['Low', 'Medium', 'High'])('sets %s and never touches the requested priority', async (value) => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/it-priority`)
      .set('Cookie', cookieHeader())
      .send({ itPriority: value });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ itPriority: value });
    expect(res.body.requestedPriority).toBe('Medium');
  });

  it('ignores a priority smuggled into the same body (BR-16)', async () => {
    await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/it-priority`)
      .set('Cookie', cookieHeader())
      .send({ itPriority: 'Low', priority: 'High' });

    expect(lastUpdate().data).toEqual({ itPriority: 'Low' });
  });

  it.each([
    ['an unknown value', { itPriority: 'Urgent' }],
    ['a missing field', {}],
    ['a non-string', { itPriority: 3 }]
  ])('answers 400 for %s', async (_label, body) => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/it-priority`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.fields.itPriority).toMatch(/Low, Medium, High/);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(['Closed', 'Cancelled'])('answers 409 on a %s ticket (BR-31)', async (status) => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/it-priority`)
      .set('Cookie', cookieHeader())
      .send({ itPriority: 'Low' });

    expect(res.status).toBe(409);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/staff/tickets/:id/status (API-35, API-36, AC-21, AC-22, BR-18 … BR-20)', () => {
  beforeEach(() => mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA));

  it('applies a permitted transition', async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'InProgress' });

    expect(res.status).toBe(200);
    expect(lastUpdate().data).toEqual({ status: 'InProgress' });
  });

  it('stamps resolvedAt on Resolved and closedAt on Closed (BR-20)', async () => {
    await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'Resolved' });

    const resolved = lastUpdate().data;
    expect(resolved.status).toBe('Resolved');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(resolved.closedAt).toBeNull();

    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ status: 'Resolved', resolvedAt: new Date('2026-09-15T00:00:00.000Z') }) as never
    );

    await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'Closed' });

    const closed = lastUpdate().data;
    expect(closed.status).toBe('Closed');
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(closed.resolvedAt).toEqual(new Date('2026-09-15T00:00:00.000Z'));
  });

  it('Reopened clears resolvedAt, closedAt and the requester indication (BR-20)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({
        status: 'Closed',
        resolvedAt: new Date('2026-09-15T00:00:00.000Z'),
        closedAt: new Date('2026-09-16T00:00:00.000Z'),
        requesterResolvedAt: new Date('2026-09-14T00:00:00.000Z')
      }) as never
    );

    await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'Reopened' });

    expect(lastUpdate().data).toEqual({
      status: 'Reopened',
      resolvedAt: null,
      closedAt: null,
      requesterResolvedAt: null
    });
  });

  it('refuses a transition outside the matrix with 409 naming the permitted targets (AC-21)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(unownedRow() as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'Closed' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toContain('Open');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(['InProgress', 'Resolved'])(
    'refuses %s on an unassigned ticket with 409 and an owner hint (AC-22)',
    async (status) => {
      vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
        ticketRow({ owner: null, ownerId: null }) as never
      );

      const res = await request(app)
        .patch(`/api/staff/tickets/${TICKET_ID}/status`)
        .set('Cookie', cookieHeader())
        .send({ status });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
      expect(res.body.error.message).toMatch(/owner/i);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    }
  );

  it('refuses every change on a Cancelled ticket', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status: 'Cancelled' }) as never);

    for (const status of ['Open', 'Reopened', 'Closed']) {
      const res = await request(app)
        .patch(`/api/staff/tickets/${TICKET_ID}/status`)
        .set('Cookie', cookieHeader())
        .send({ status });
      expect(res.status).toBe(409);
    }
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown status', { status: 'Done' }],
    ['a missing field', {}]
  ])('answers 400 for %s', async (_label, body) => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.fields.status).toBeDefined();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('recomputes permittedTransitions in the response', async () => {
    // The re-read after the write is what the client sees.
    vi.mocked(prisma.ticket.findFirst)
      .mockResolvedValueOnce(ticketRow() as never)
      .mockResolvedValueOnce(ticketRow({ status: 'InProgress' }) as never);

    const res = await request(app)
      .patch(`/api/staff/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'InProgress' });

    expect(res.body.status).toBe('InProgress');
    expect(res.body.permittedTransitions).toEqual(['WaitingForRequester', 'Resolved', 'Cancelled']);
  });
});

describe('Administrator and Requester on the operations (API-16, AC-12, BR-17)', () => {
  const WRITES: { method: 'post' | 'patch'; path: string; body?: object }[] = [
    { method: 'post', path: `/api/staff/tickets/${TICKET_ID}/claim` },
    { method: 'patch', path: `/api/staff/tickets/${TICKET_ID}/owner`, body: { ownerId: CHEN_ID } },
    { method: 'patch', path: `/api/staff/tickets/${TICKET_ID}/it-priority`, body: { itPriority: 'Low' } },
    { method: 'patch', path: `/api/staff/tickets/${TICKET_ID}/status`, body: { status: 'InProgress' } },
    { method: 'post', path: `/api/staff/tickets/${TICKET_ID}/internal-notes`, body: { body: 'note' } }
  ];

  it.each(WRITES)('an Administrator is refused $method $path with 403 and no write', async ({ method, path, body }) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);

    const res = await request(app)[method](path).set('Cookie', cookieHeader()).send(body ?? {});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(prisma.ticketInternalNote.create).not.toHaveBeenCalled();
  });

  it('the same Administrator can read the ticket and its notes', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);

    const detail = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    const notes = await request(app)
      .get(`/api/staff/tickets/${TICKET_ID}/internal-notes`)
      .set('Cookie', cookieHeader());

    expect(detail.status).toBe(200);
    expect(notes.status).toBe(200);
  });

  it.each([...WRITES, { method: 'get' as const, path: `/api/staff/tickets/${TICKET_ID}/internal-notes` }])(
    'a Requester is refused $method $path before any lookup (API-14, AC-04)',
    async ({ method, path, body }) => {
      mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

      const res = await request(app)[method](path).set('Cookie', cookieHeader()).send(body ?? {});

      expect(res.status).toBe(403);
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
      expect(prisma.ticketInternalNote.findMany).not.toHaveBeenCalled();
    }
  );
});
