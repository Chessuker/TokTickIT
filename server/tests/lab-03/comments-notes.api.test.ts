import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    ticketComment: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from './sessionMock.js';

/**
 * API-22 … API-25 — Public Comments and the resolution indication
 * (FR-06, FR-07, BR-04, BR-05, BR-21 … BR-23, AC-14, AC-15).
 *
 * Internal Notes (API-08, API-38, API-39) are added to this file by Issue #40
 * together with their routes.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const OTHER_REQUESTER_ID = '99999999-2222-4333-8444-555555555555';

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    description: 'Drops from 100% to 20% within an hour.',
    status: 'Open',
    priority: 'Medium',
    itPriority: 'Medium',
    requesterResolvedAt: null,
    createdAt: new Date('2026-08-23T04:15:00.000Z'),
    updatedAt: new Date('2026-08-23T04:15:00.000Z'),
    category: { id: 'cat-1', name: 'Hardware' },
    relatedSystem: { id: 'sys-1', name: 'Corporate Laptop' },
    requester: { id: JENNIFER.id, name: JENNIFER.name, email: JENNIFER.email, department: 'Registrar' },
    owner: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
    requesterId: JENNIFER.id,
    attachments: [],
    ...overrides
  };
}

const COMMENTS = [
  {
    id: 'cmt-2',
    body: 'Still happening after the update.',
    author: { id: JENNIFER.id, name: JENNIFER.name, role: 'Requester' },
    createdAt: new Date('2026-09-14T10:00:00.000Z')
  },
  {
    id: 'cmt-1',
    body: 'We are investigating the issue on your device.',
    author: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
    createdAt: new Date('2026-09-14T09:30:00.000Z')
  }
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((operations: unknown) =>
    (typeof operations === 'function'
      ? Promise.resolve((operations as (tx: unknown) => unknown)(prisma))
      : Promise.all(operations as Promise<unknown>[])) as never
  );
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow() as never);
  vi.mocked(prisma.ticketComment.findMany).mockResolvedValue(COMMENTS as never);
  vi.mocked(prisma.ticket.update).mockResolvedValue({ id: TICKET_ID } as never);
});

describe('POST /api/tickets/:id/comments — body rules (API-22, AC-14, BR-22)', () => {
  beforeEach(() => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticketComment.create).mockImplementation(
      ({ data }: { data: { body: string; authorId: string } }) =>
        Promise.resolve({
          id: 'cmt-3',
          body: data.body,
          author: { id: data.authorId, name: JENNIFER.name, role: 'Requester' },
          createdAt: new Date('2026-09-14T11:00:00.000Z')
        }) as never
    );
  });

  it('creates a trimmed comment with server-set author and time', async () => {
    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: '  The fix worked, thank you.  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'cmt-3',
      body: 'The fix worked, thank you.',
      author: { id: JENNIFER.id, name: JENNIFER.name, role: 'Requester' },
      createdAt: '2026-09-14T11:00:00.000Z'
    });

    const data = vi.mocked(prisma.ticketComment.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toEqual({ ticketId: TICKET_ID, authorId: JENNIFER.id, body: 'The fix worked, thank you.' });
  });

  it("touches the ticket's updatedAt in the same transaction", async () => {
    await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'Any update?' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const update = vi.mocked(prisma.ticket.update).mock.calls[0][0] as { where: unknown; data: { updatedAt: unknown } };
    expect(update.where).toEqual({ id: TICKET_ID });
    expect(update.data.updatedAt).toBeInstanceOf(Date);
  });

  it('ignores a client-supplied author, id and createdAt', async () => {
    await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({
        body: 'Any update?',
        authorId: OTHER_REQUESTER_ID,
        id: 'forged',
        createdAt: '2000-01-01T00:00:00.000Z'
      });

    const data = vi.mocked(prisma.ticketComment.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.authorId).toBe(JENNIFER.id);
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('createdAt');
  });

  it.each([
    ['missing', {}],
    ['empty', { body: '' }],
    ['whitespace', { body: '   \n\t ' }],
    ['not a string', { body: 42 }]
  ])('answers 400 with fields.body for a %s body', async (_label, payload) => {
    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toEqual({ body: 'Comment cannot be empty.' });
    expect(prisma.ticketComment.create).not.toHaveBeenCalled();
  });

  it('answers 400 for 2001 characters and accepts exactly 2000', async () => {
    const tooLong = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'x'.repeat(2001) });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fields.body).toMatch(/2000/);
    expect(prisma.ticketComment.create).not.toHaveBeenCalled();

    const atLimit = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'x'.repeat(2000) });

    expect(atLimit.status).toBe(201);
  });

  it('stores the body as plain text, never interpreting markup (BR-22)', async () => {
    const markup = '<b>bold</b> & <script>alert(1)</script>';

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: markup });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe(markup);
    const data = vi.mocked(prisma.ticketComment.create).mock.calls[0][0].data as { body: string };
    expect(data.body).toBe(markup);
  });

  it('answers 404 for a ticket that does not exist', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'Hello?' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/tickets/:id/comments — who may comment (API-23, BR-23, BR-17)', () => {
  it("refuses a Requester commenting on another Requester's ticket with 403 and no ticket content", async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterId: OTHER_REQUESTER_ID }) as never
    );

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'Not my ticket.' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('Laptop battery');
    expect(prisma.ticketComment.create).not.toHaveBeenCalled();
  });

  it('lets IT Staff comment on any ticket', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticketComment.create).mockResolvedValue(COMMENTS[1] as never);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'We are investigating the issue on your device.' });

    expect(res.status).toBe(201);
    expect(res.body.author.role).toBe('ITStaff');
    const data = vi.mocked(prisma.ticketComment.create).mock.calls[0][0].data as { authorId: string };
    expect(data.authorId).toBe(PRIYA.id);
  });

  it('refuses an Administrator with 403 before any lookup', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), ADMIN);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader())
      .send({ body: 'Admins only read.' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticketComment.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/tickets/:id/comments — listing (API-24, BR-04, AC-14)', () => {
  it.each([
    ['owner', JENNIFER],
    ['IT Staff', PRIYA],
    ['Administrator', ADMIN]
  ])('returns the same newest-first thread to the %s', async (_label, user) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), user);

    const res = await request(app)
      .get(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.map((comment: { id: string }) => comment.id)).toEqual(['cmt-2', 'cmt-1']);
    expect(res.body.data[0]).toEqual({
      id: 'cmt-2',
      body: 'Still happening after the update.',
      author: { id: JENNIFER.id, name: JENNIFER.name, role: 'Requester' },
      createdAt: '2026-09-14T10:00:00.000Z'
    });

    const query = vi.mocked(prisma.ticketComment.findMany).mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
    };
    expect(query.where).toEqual({ ticketId: TICKET_ID });
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
  });

  it("never selects the author's email or password hash", async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    await request(app).get(`/api/tickets/${TICKET_ID}/comments`).set('Cookie', cookieHeader());

    const select = vi.mocked(prisma.ticketComment.findMany).mock.calls[0][0].select as {
      author: { select: Record<string, boolean> };
    };
    expect(select.author.select).toEqual({ id: true, name: true, role: true });
  });

  it("refuses a Requester reading another Requester's thread with 403 and no comment content", async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterId: OTHER_REQUESTER_ID }) as never
    );

    const res = await request(app)
      .get(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(prisma.ticketComment.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('investigating');
  });

  it('answers 404 to IT Staff for an unknown ticket id', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/tickets/${TICKET_ID}/comments`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
  });
});

describe('POST /api/tickets/:id/resolution-indication (API-25, BR-05, BR-21, AC-15)', () => {
  const RESOLVED_AT = new Date('2026-09-14T12:00:00.000Z');

  beforeEach(() => {
    vi.mocked(prisma.ticket.update).mockImplementation(
      ({ data }: { data: { requesterResolvedAt: Date } }) =>
        Promise.resolve(ticketRow({ requesterResolvedAt: data.requesterResolvedAt })) as never
    );
  });

  it('sets requesterResolvedAt on an owned Open ticket and leaves the status alone', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Open');
    expect(typeof res.body.requesterResolvedAt).toBe('string');
    expect(res.body.ticketNumber).toBe('TKT-2026-000001');
    expect(res.body.attachments).toEqual([]);
    expect(res.body).not.toHaveProperty('requesterId');

    const update = vi.mocked(prisma.ticket.update).mock.calls[0][0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(update.where).toEqual({ id: TICKET_ID });
    expect(Object.keys(update.data)).toEqual(['requesterResolvedAt']);
    expect(update.data.requesterResolvedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: a repeat answers 200 with the original timestamp and writes nothing', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterResolvedAt: RESOLVED_AT }) as never
    );

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.requesterResolvedAt).toBe(RESOLVED_AT.toISOString());
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(['Resolved', 'Closed', 'Cancelled'])(
    'answers 409 INVALID_TRANSITION on a %s ticket',
    async (status) => {
      mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
      vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

      const res = await request(app)
        .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
        .set('Cookie', cookieHeader());

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['IT Staff', PRIYA],
    ['Administrator', ADMIN]
  ])('refuses %s with 403 before any lookup', async (_label, user) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), user);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a Requester on another Requester's ticket with 403", async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterId: OTHER_REQUESTER_ID }) as never
    );

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a ticket that does not exist', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
  });

  it('offers a Requester no route to set the status (AC-15)', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);

    // The status route lives under /api/staff (Issue #40) and is role-gated
    // there; on the Requester ticket path there is no such route at all.
    const res = await request(app)
      .patch(`/api/tickets/${TICKET_ID}/status`)
      .set('Cookie', cookieHeader())
      .send({ status: 'Resolved' });

    expect(res.status).toBe(404);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});
