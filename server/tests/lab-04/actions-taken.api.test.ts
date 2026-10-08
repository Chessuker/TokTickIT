import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    ticketAction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ACTION_ORDER_BY } from '../../src/actionRules.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from '../lab-03/sessionMock.js';
import type { FixtureUser } from '../lab-03/sessionMock.js';

/**
 * API-01 … API-13 — Actions Taken (Lab 4 api-spec.md §3.1 – §3.4; FR-01 …
 * FR-04, BR-01 … BR-12, AC-01, AC-03 … AC-11).
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const OTHER_TICKET_ID = 'd4e5f6a7-1111-4222-8333-444455556666';
const ACTION_ID = 'a1b2c3d4-5555-4666-8777-888899990000';
const REQUEST_ID = '9b2f4c1e-8d3a-4f6b-9c2d-1e5f7a8b9c0d';

const CHEN: FixtureUser = {
  id: '44444444-2222-4333-8444-555555555555',
  name: 'Chen Wei',
  email: 'chen.wei@kmutt.ac.th',
  role: 'ITStaff',
  mustChangePassword: false,
  isActive: true
};

/** A second Requester who has already changed their password (unlike Sarah). */
const DAVID: FixtureUser = {
  id: '55555555-2222-4333-8444-555555555555',
  name: 'David Lee',
  email: 'david.lee@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: false,
  isActive: true
};

const TICKET_CREATED = new Date('2026-09-30T03:20:00.000Z');

/** Every column any Lab 4 loader selects: the action routes and `loadTicketAccess`. */
function ticketRow(overrides: Record<string, unknown> = {}) {
  return { id: TICKET_ID, status: 'InProgress', createdAt: TICKET_CREATED, requesterId: JENNIFER.id, ...overrides };
}

const REF = (user: FixtureUser) => ({ id: user.id, name: user.name, role: user.role });

/** An `ACTION_SELECT` row as Prisma would return it. */
function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    ticketId: TICKET_ID,
    actionAt: new Date('2026-10-01T02:00:00.000Z'),
    description: 'Re-created the Outlook profile.',
    result: 'Prompt stopped for two hours.',
    attachmentNotes: null,
    followUpRequired: false,
    followUpNote: null,
    followUpStatus: null,
    followUpClosedAt: null,
    version: 0,
    createdAt: new Date('2026-10-01T02:05:00.000Z'),
    updatedAt: new Date('2026-10-01T02:05:00.000Z'),
    performedBy: REF(PRIYA),
    followUpAssignee: null,
    followUpClosedBy: null,
    updatedBy: null,
    ...overrides
  };
}

function withOpenFollowUp(overrides: Record<string, unknown> = {}) {
  return actionRow({
    followUpRequired: true,
    followUpNote: 'Check the Exchange policy.',
    followUpStatus: 'Open',
    followUpAssignee: { ...REF(CHEN), isActive: true },
    ...overrides
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: '2026-10-01T02:00:00.000Z',
    description: 'Re-created the Outlook profile.',
    result: 'Prompt stopped for two hours.',
    ...overrides
  };
}

const staffPath = (ticketId = TICKET_ID) => `/api/staff/tickets/${ticketId}/actions`;
const actionPath = (ticketId = TICKET_ID, actionId = ACTION_ID) => `${staffPath(ticketId)}/${actionId}`;

function signIn(user: FixtureUser) {
  mockSessionFor(vi.mocked(prisma.session.findUnique), user);
}

const createCalls = () => vi.mocked(prisma.ticketAction.create).mock.calls;
const lastCreateData = () => (createCalls().at(-1)?.[0] as { data: Record<string, unknown> }).data;
const lastUpdateMany = () =>
  vi.mocked(prisma.ticketAction.updateMany).mock.calls.at(-1)?.[0] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };

/** `findUnique` serves two lookups: replay by `clientRequestId`, and re-read by `id`. */
function mockFindUnique(byRequestId: unknown, byId: unknown = actionRow()) {
  vi.mocked(prisma.ticketAction.findUnique).mockImplementation((({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve('clientRequestId' in where ? byRequestId : byId)) as never);
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
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: CHEN.id } as never);
  vi.mocked(prisma.ticketAction.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.ticketAction.create).mockResolvedValue(actionRow() as never);
  vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(
    { id: ACTION_ID, version: 2, followUpRequired: false, followUpStatus: null } as never
  );
  vi.mocked(prisma.ticketAction.updateMany).mockResolvedValue({ count: 1 } as never);
  mockFindUnique(null);
});

describe('GET /api/staff/tickets/:id/actions (API-01, AC-11, BR-11)', () => {
  it.each([
    ['IT Staff', PRIYA],
    ['an Administrator', ADMIN]
  ])('lists the Actions for %s in BR-11 order, with the Action shape', async (_label, user) => {
    signIn(user);
    vi.mocked(prisma.ticketAction.findMany).mockResolvedValue([
      withOpenFollowUp({ id: 'a-2', actionAt: new Date('2026-10-02T00:00:00.000Z') }),
      actionRow({ id: 'a-1' })
    ] as never);

    const res = await request(app).get(staffPath()).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(prisma.ticketAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticketId: TICKET_ID }, orderBy: ACTION_ORDER_BY })
    );
    expect(res.body.data.map((action: { id: string }) => action.id)).toEqual(['a-2', 'a-1']);
    expect(res.body.data[0]).toMatchObject({
      performedBy: REF(PRIYA),
      followUp: {
        required: true,
        note: 'Check the Exchange policy.',
        assignee: { id: CHEN.id, name: CHEN.name, role: 'ITStaff', isActive: true },
        status: 'Open',
        closedAt: null,
        closedBy: null
      },
      version: 0
    });
    expect(res.body.data[1].followUp).toEqual({
      required: false,
      note: null,
      assignee: null,
      status: null,
      closedAt: null,
      closedBy: null
    });
    expect(res.body.data[0]).not.toHaveProperty('followUpRequired');
  });

  it('orders by actionAt, then createdAt, then id', () => {
    expect(ACTION_ORDER_BY).toEqual([{ actionAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('answers 404 for an unknown ticket', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never);

    const res = await request(app).get(staffPath()).set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
    expect(prisma.ticketAction.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/tickets/:id/actions (API-02, AC-03, AC-08, BR-04)', () => {
  it('gives the owning Requester the same list and shape as IT Staff', async () => {
    signIn(JENNIFER);
    vi.mocked(prisma.ticketAction.findMany).mockResolvedValue([withOpenFollowUp()] as never);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}/actions`).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].followUp.status).toBe('Open');
    expect(prisma.ticketAction.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: ACTION_ORDER_BY }));
  });

  it("refuses another Requester's ticket with 403 and no Action data", async () => {
    signIn(DAVID);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}/actions`).set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body).not.toHaveProperty('data');
    expect(prisma.ticketAction.findMany).not.toHaveBeenCalled();
  });

  it('lets IT Staff read it too, and answers them 404 for an unknown ticket', async () => {
    signIn(PRIYA);
    const ok = await request(app).get(`/api/tickets/${TICKET_ID}/actions`).set('Cookie', cookieHeader());
    expect(ok.status).toBe(200);

    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never);
    const missing = await request(app).get(`/api/tickets/${TICKET_ID}/actions`).set('Cookie', cookieHeader());
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/staff/tickets/:id/actions (API-03 … API-06)', () => {
  it('API-03 (AC-01): creates a valid Action under the Ticket, by the session user, with the approved assignee', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.create).mockResolvedValue(withOpenFollowUp() as never);

    const res = await request(app)
      .post(staffPath())
      .set('Cookie', cookieHeader())
      .send(validBody({ followUpRequired: true, followUpNote: 'Check the Exchange policy.', followUpAssigneeId: CHEN.id }));

    expect(res.status).toBe(201);
    expect(lastCreateData()).toEqual({
      ticketId: TICKET_ID,
      performedById: PRIYA.id,
      actionAt: new Date('2026-10-01T02:00:00.000Z'),
      description: 'Re-created the Outlook profile.',
      result: 'Prompt stopped for two hours.',
      attachmentNotes: null,
      clientRequestId: null,
      followUpRequired: true,
      followUpNote: 'Check the Exchange policy.',
      followUpAssigneeId: CHEN.id,
      followUpStatus: 'Open'
    });
    // The assignee was checked against active IT Staff (BR-06).
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CHEN.id, role: 'ITStaff', isActive: true } })
    );
    // The ticket reads as recently updated, but its version does not move (BR-12).
    const ticketUpdate = vi.mocked(prisma.ticket.update).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(ticketUpdate.data).toEqual({ updatedAt: expect.any(Date) });
    expect(res.body.performedBy).toEqual(REF(PRIYA));
    expect(res.body.followUp.assignee.id).toBe(CHEN.id);
  });

  it('API-04 (AC-05, BR-02, BR-03): ignores performedById, ticketId, followUpStatus and version in the body', async () => {
    signIn(PRIYA);

    const res = await request(app)
      .post(staffPath())
      .set('Cookie', cookieHeader())
      .send(validBody({ performedById: ADMIN.id, ticketId: OTHER_TICKET_ID, followUpStatus: 'Completed', version: 7 }));

    expect(res.status).toBe(201);
    const data = lastCreateData();
    expect(data.performedById).toBe(PRIYA.id);
    expect(data.ticketId).toBe(TICKET_ID);
    expect(data.followUpRequired).toBe(false);
    expect(data).not.toHaveProperty('followUpStatus');
    expect(data).not.toHaveProperty('version');
    // Nothing about the ticket's owner is read or written: a non-owner may record work.
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { updatedAt: expect.any(Date) } }));
  });

  it.each([
    ['missing description', { description: '' }, 'description'],
    ['missing result', { result: '   ' }, 'result'],
    ['missing actionAt', { actionAt: undefined }, 'actionAt'],
    ['actionAt in the future', { actionAt: '2099-01-01T00:00:00.000Z' }, 'actionAt'],
    ['actionAt before the ticket', { actionAt: '2026-09-29T00:00:00.000Z' }, 'actionAt'],
    ['attachment notes too long', { attachmentNotes: 'x'.repeat(501) }, 'attachmentNotes'],
    ['follow-up without a note', { followUpRequired: true, followUpAssigneeId: CHEN.id }, 'followUpNote'],
    ['follow-up without an assignee', { followUpRequired: true, followUpNote: 'Call back' }, 'followUpAssigneeId'],
    ['malformed clientRequestId', { clientRequestId: 'retry-1' }, 'clientRequestId']
  ])('API-05 (AC-04): %s → 400 naming the field, nothing written', async (_label, overrides, field) => {
    signIn(PRIYA);

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody(overrides));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toHaveProperty(field);
    expect(prisma.ticketAction.create).not.toHaveBeenCalled();
  });

  it('API-06 (AC-07, BR-06): refuses an assignee who is not an active IT Staff member', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    const res = await request(app)
      .post(staffPath())
      .set('Cookie', cookieHeader())
      .send(validBody({ followUpRequired: true, followUpNote: 'Deploy it', followUpAssigneeId: 'robert-inactive-id' }));

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({
      followUpAssigneeId: 'The follow-up must be assigned to an active IT Staff member.'
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'robert-inactive-id', role: 'ITStaff', isActive: true } })
    );
    expect(prisma.ticketAction.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown ticket', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never);

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody());

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/staff/tickets/:id/actions/:actionId (API-06 … API-09)', () => {
  it('API-07 (AC-06, BR-08): edits with the current version, keeping ticket and performer, stamping the editor', async () => {
    signIn(CHEN);
    mockFindUnique(null, actionRow({ result: 'Fixed for good.', version: 3, updatedBy: REF(CHEN) }));

    const res = await request(app)
      .patch(actionPath())
      .set('Cookie', cookieHeader())
      .send({ version: 2, result: ' Fixed for good. ', performedById: CHEN.id, ticketId: OTHER_TICKET_ID });

    expect(res.status).toBe(200);
    const { where, data } = lastUpdateMany();
    expect(where).toEqual({ id: ACTION_ID, version: 2 });
    expect(data).toEqual({ result: 'Fixed for good.', updatedById: CHEN.id, version: { increment: 1 } });
    expect(res.body.version).toBe(3);
    expect(res.body.performedBy).toEqual(REF(PRIYA));
    expect(res.body.updatedBy).toEqual(REF(CHEN));
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { updatedAt: expect.any(Date) } }));
  });

  it('API-08 (AC-06, BR-19): an old version is 409 STALE_UPDATE with the current version, nothing written', async () => {
    signIn(PRIYA);

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 1, result: 'Mine' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_UPDATE');
    expect(res.body.error.current).toEqual({ version: 2 });
    expect(prisma.ticketAction.updateMany).not.toHaveBeenCalled();
  });

  it('API-08: a missing version is 400 on fields.version', async () => {
    signIn(PRIYA);

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ result: 'Mine' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('version');
  });

  it('API-08: a race lost between the check and the write is also STALE_UPDATE, never a silent overwrite', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.updateMany).mockResolvedValue({ count: 0 } as never);
    mockFindUnique(null, { version: 3 });

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 2, result: 'Mine' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'STALE_UPDATE', current: { version: 3 } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it.each(['Completed', 'Cancelled'])('API-09 (AC-07): %s an Open follow-up, stamping who and when', async (status) => {
    signIn(CHEN);
    vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(
      { id: ACTION_ID, version: 0, followUpRequired: true, followUpStatus: 'Open' } as never
    );

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 0, followUpStatus: status });

    expect(res.status).toBe(200);
    expect(lastUpdateMany().data).toMatchObject({
      followUpStatus: status,
      followUpClosedAt: expect.any(Date),
      followUpClosedById: CHEN.id,
      updatedById: CHEN.id
    });
  });

  it('API-09: closing an already closed follow-up, or editing its note, is 409 CONFLICT', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(
      { id: ACTION_ID, version: 0, followUpRequired: true, followUpStatus: 'Completed' } as never
    );

    for (const body of [{ version: 0, followUpStatus: 'Cancelled' }, { version: 0, followUpNote: 'Late edit' }]) {
      const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    }
    expect(prisma.ticketAction.updateMany).not.toHaveBeenCalled();
  });

  it('API-09: turning a follow-up off is 400 — cancel it instead', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(
      { id: ACTION_ID, version: 0, followUpRequired: true, followUpStatus: 'Open' } as never
    );

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 0, followUpRequired: false });

    expect(res.status).toBe(400);
    expect(res.body.error.fields.followUpRequired).toMatch(/Cancel the follow-up/);
  });

  it('API-09: opening a follow-up on an Action without one sets it Open', async () => {
    signIn(PRIYA);

    const res = await request(app)
      .patch(actionPath())
      .set('Cookie', cookieHeader())
      .send({ version: 2, followUpRequired: true, followUpNote: 'Swap the cable', followUpAssigneeId: CHEN.id });

    expect(res.status).toBe(200);
    expect(lastUpdateMany().data).toMatchObject({
      followUpRequired: true,
      followUpNote: 'Swap the cable',
      followUpAssigneeId: CHEN.id,
      followUpStatus: 'Open'
    });
  });

  it('API-06 (BR-06): reassigning an Open follow-up to an inactive member is 400', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(
      { id: ACTION_ID, version: 0, followUpRequired: true, followUpStatus: 'Open' } as never
    );
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(actionPath())
      .set('Cookie', cookieHeader())
      .send({ version: 0, followUpAssigneeId: 'robert-inactive-id' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('followUpAssigneeId');
    expect(prisma.ticketAction.updateMany).not.toHaveBeenCalled();
  });

  it('answers 400 when the body changes nothing', async () => {
    signIn(PRIYA);

    const res = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Nothing to update.');
  });
});

describe('locked tickets (API-10, AC-09, BR-09)', () => {
  it.each(['Resolved', 'Closed', 'Cancelled'])('refuses create and edit on a %s ticket with 409 TICKET_LOCKED', async (status) => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

    const created = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody());
    const edited = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 2, result: 'x' });

    for (const res of [created, edited]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TICKET_LOCKED');
      expect(res.body.error.message).toMatch(/Reopen it to record more work/);
    }
    expect(prisma.ticketAction.create).not.toHaveBeenCalled();
    expect(prisma.ticketAction.updateMany).not.toHaveBeenCalled();
  });

  it.each(['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened'])('accepts a create on a %s ticket', async (status) => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status }) as never);

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody());

    expect(res.status).toBe(201);
  });
});

describe('authorization (API-11, AC-08, BR-04)', () => {
  it('refuses a Requester every staff Action route with 403, before any lookup', async () => {
    signIn(JENNIFER);

    const responses = [
      await request(app).get(staffPath()).set('Cookie', cookieHeader()),
      await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody()),
      await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 2, result: 'x' })
    ];

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(prisma.ticketAction.create).not.toHaveBeenCalled();
  });

  it('answers 401 to every Action route without a session', async () => {
    const responses = [
      await request(app).get(staffPath()),
      await request(app).post(staffPath()).send(validBody()),
      await request(app).patch(actionPath()).send({ version: 2, result: 'x' }),
      await request(app).get(`/api/tickets/${TICKET_ID}/actions`)
    ];

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).not.toHaveProperty('data');
    }
  });

  it('lets an Administrator create and edit Actions (AD-02)', async () => {
    signIn(ADMIN);

    const created = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody());
    expect(created.status).toBe(201);
    expect(lastCreateData().performedById).toBe(ADMIN.id);

    const edited = await request(app).patch(actionPath()).set('Cookie', cookieHeader()).send({ version: 2, result: 'x' });
    expect(edited.status).toBe(200);
    expect(lastUpdateMany().data.updatedById).toBe(ADMIN.id);
  });
});

describe('clientRequestId replay (API-12, AC-10, BR-10)', () => {
  it('creates on the first request and returns the same Action, writing nothing, on a retry', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticketAction.create).mockResolvedValue(actionRow() as never);

    const first = await request(app)
      .post(staffPath())
      .set('Cookie', cookieHeader())
      .send(validBody({ clientRequestId: REQUEST_ID }));
    expect(first.status).toBe(201);
    expect(lastCreateData().clientRequestId).toBe(REQUEST_ID);

    mockFindUnique({ ...actionRow(), performedById: PRIYA.id });
    const retry = await request(app)
      .post(staffPath())
      .set('Cookie', cookieHeader())
      .send(validBody({ clientRequestId: REQUEST_ID }));

    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(ACTION_ID);
    expect(retry.body).not.toHaveProperty('performedById');
    expect(createCalls()).toHaveLength(1);
  });

  it('answers a retry even after the ticket was locked, since the request already succeeded', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ status: 'Resolved' }) as never);
    mockFindUnique({ ...actionRow(), performedById: PRIYA.id });

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody({ clientRequestId: REQUEST_ID }));

    expect(res.status).toBe(200);
  });

  it.each([
    ['another user', { performedById: CHEN.id, ticketId: TICKET_ID }],
    ['another ticket', { performedById: PRIYA.id, ticketId: OTHER_TICKET_ID }]
  ])('refuses an id already used by %s with 409', async (_label, owner) => {
    signIn(PRIYA);
    mockFindUnique({ ...actionRow(), ...owner });

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody({ clientRequestId: REQUEST_ID }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body).not.toHaveProperty('id');
    expect(prisma.ticketAction.create).not.toHaveBeenCalled();
  });

  it('answers the loser of a race on the unique index as a replay', async () => {
    signIn(PRIYA);
    let lookups = 0;
    vi.mocked(prisma.ticketAction.findUnique).mockImplementation((() => {
      lookups += 1;
      // First lookup (before the insert) finds nothing; the one after the
      // unique violation finds the winner's row.
      return Promise.resolve(lookups === 1 ? null : { ...actionRow(), performedById: PRIYA.id });
    }) as never);
    vi.mocked(prisma.ticketAction.create).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['clientRequestId'] } }) as never
    );

    const res = await request(app).post(staffPath()).set('Cookie', cookieHeader()).send(validBody({ clientRequestId: REQUEST_ID }));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ACTION_ID);
  });
});

describe('one Ticket per Action (API-13, BR-01, BR-08)', () => {
  it("answers 404 for an Action id reached through another ticket's URL", async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow({ id: OTHER_TICKET_ID }) as never);
    vi.mocked(prisma.ticketAction.findFirst).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(actionPath(OTHER_TICKET_ID))
      .set('Cookie', cookieHeader())
      .send({ version: 2, result: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Action not found.');
    expect(prisma.ticketAction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ACTION_ID, ticketId: OTHER_TICKET_ID } })
    );
  });

  it('has no DELETE route', async () => {
    signIn(PRIYA);

    const res = await request(app).delete(actionPath()).set('Cookie', cookieHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'No such endpoint.' });
  });
});
