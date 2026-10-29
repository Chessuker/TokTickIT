import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn() },
    ticketStatusChange: { create: vi.fn(), findMany: vi.fn() },
    ticketAction: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from '../lab-03/sessionMock.js';
import type { FixtureUser } from '../lab-03/sessionMock.js';

/**
 * API-14 … API-22 — Ticket workflow, resolution gate, stale updates and status
 * history (Lab 4 api-spec.md §1.4, §3.5, §4.1, §4.2; FR-05 … FR-07, BR-13 …
 * BR-20, AC-12 … AC-18).
 *
 * The database is a small stateful fake of one ticket rather than canned
 * answers: the version check, the status write, the history row and the
 * follow-up cancellations all act on the same state, so a sequence (refused →
 * fix the cause → accepted) is tested the way it happens.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const CHEN_ID = '44444444-2222-4333-8444-555555555555';
const DAVID: FixtureUser = {
  id: '55555555-2222-4333-8444-555555555555',
  name: 'David Lee',
  email: 'david.lee@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: false,
  isActive: true
};

const CREATED = new Date('2026-09-30T03:20:00.000Z');
const EARLY = new Date('2026-10-01T02:00:00.000Z');
const REOPENED = new Date('2026-10-05T02:00:00.000Z');
const LATE = new Date('2026-10-06T02:00:00.000Z');

interface FakeAction {
  createdAt: Date;
  followUpStatus: string | null;
}

interface FakeTicket {
  status: string;
  ownerId: string | null;
  itPriority: string;
  version: number;
  actions: FakeAction[];
  lastReopenedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  requesterResolvedAt: Date | null;
}

interface HistoryRow {
  ticketId: string;
  fromStatus: string;
  toStatus: string;
  changedById: string;
}

let state: FakeTicket;
let history: HistoryRow[];

function fresh(overrides: Partial<FakeTicket> = {}): FakeTicket {
  return {
    status: 'InProgress',
    ownerId: PRIYA.id,
    itPriority: 'Medium',
    version: 3,
    actions: [{ createdAt: EARLY, followUpStatus: null }],
    lastReopenedAt: null,
    resolvedAt: null,
    closedAt: null,
    requesterResolvedAt: null,
    ...overrides
  };
}

/** A superset of every column the loaders select; the fake ignores `select`. */
function row() {
  return {
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000042',
    summary: 'Outlook keeps asking for the password',
    description: 'Since Monday.',
    status: state.status,
    priority: 'Medium',
    itPriority: state.itPriority,
    requesterResolvedAt: state.requesterResolvedAt,
    resolvedAt: state.resolvedAt,
    closedAt: state.closedAt,
    createdAt: CREATED,
    updatedAt: CREATED,
    requesterId: JENNIFER.id,
    category: { id: 'cat-1', name: 'Email' },
    relatedSystem: null,
    requester: { id: JENNIFER.id, name: JENNIFER.name, email: JENNIFER.email, department: 'Registrar', role: 'Requester' },
    owner: state.ownerId ? { id: state.ownerId, name: 'Owner', role: 'ITStaff' } : null,
    ownerId: state.ownerId,
    attachments: [],
    _count: { comments: 0, internalNotes: 0 },
    version: state.version,
    actions: state.actions,
    statusChanges: state.lastReopenedAt ? [{ createdAt: state.lastReopenedAt }] : []
  };
}

function signIn(user: FixtureUser) {
  mockSessionFor(vi.mocked(prisma.session.findUnique), user);
}

const statusPath = `/api/staff/tickets/${TICKET_ID}/status`;
const patchStatus = (body: Record<string, unknown>) =>
  request(app).patch(statusPath).set('Cookie', cookieHeader()).send(body);

beforeEach(() => {
  vi.resetAllMocks();
  state = fresh();
  history = [];

  vi.mocked(prisma.$transaction).mockImplementation((operations: unknown) =>
    (typeof operations === 'function'
      ? Promise.resolve((operations as (tx: unknown) => unknown)(prisma))
      : Promise.all(operations as Promise<unknown>[])) as never
  );
  vi.mocked(prisma.ticket.findFirst).mockImplementation((() => Promise.resolve(row())) as never);
  vi.mocked(prisma.ticket.updateMany).mockImplementation((({ where }: { where: Record<string, unknown> }) => {
    const matches = where.version === state.version && where.status === state.status;
    if (matches) state.version += 1;
    return Promise.resolve({ count: matches ? 1 : 0 });
  }) as never);
  vi.mocked(prisma.ticket.update).mockImplementation((({ data }: { data: Record<string, unknown> }) => {
    Object.assign(state, data);
    return Promise.resolve({ id: TICKET_ID });
  }) as never);
  vi.mocked(prisma.ticketStatusChange.create).mockImplementation((({ data }: { data: HistoryRow }) => {
    history.push(data);
    if (data.toStatus === 'Reopened') state.lastReopenedAt = REOPENED;
    return Promise.resolve({ id: `h-${history.length}` });
  }) as never);
  vi.mocked(prisma.ticketAction.updateMany).mockImplementation((({ data }: { data: { followUpStatus: string } }) => {
    const open = state.actions.filter((action) => action.followUpStatus === 'Open');
    for (const action of open) action.followUpStatus = data.followUpStatus;
    return Promise.resolve({ count: open.length });
  }) as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: CHEN_ID } as never);
});

describe('resolution gate (API-14, API-15, AC-12, BR-14)', () => {
  beforeEach(() => signIn(PRIYA));

  it('API-14: refuses to resolve an owned ticket with no Action, and changes nothing', async () => {
    state = fresh({ actions: [] });

    const res = await patchStatus({ status: 'Resolved' });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'RESOLUTION_BLOCKED',
      message: 'This ticket cannot be resolved yet: record at least one action taken.',
      unmet: ['ACTION_SINCE_REOPEN']
    });
    expect(state.status).toBe('InProgress');
    expect(state.version).toBe(3);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(history).toEqual([]);
  });

  it('API-15: an open follow-up blocks; once it is completed, the ticket resolves', async () => {
    state = fresh({ actions: [{ createdAt: EARLY, followUpStatus: 'Open' }] });

    const before = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    expect(before.body.resolutionGate).toEqual({ ok: false, unmet: ['OPEN_FOLLOW_UPS'], reopenedAt: null });
    expect(before.body.permittedTransitions).not.toContain('Resolved');
    expect(before.body.counts).toMatchObject({ actions: 1, openFollowUps: 1 });
    expect(before.body.version).toBe(3);

    const blocked = await patchStatus({ status: 'Resolved' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.unmet).toEqual(['OPEN_FOLLOW_UPS']);
    expect(blocked.body.error.message).toContain('complete or cancel 1 open follow-up');

    // The follow-up is completed through the Actions API (API-09).
    state.actions[0].followUpStatus = 'Completed';

    const after = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());
    expect(after.body.resolutionGate).toEqual({ ok: true, unmet: [], reopenedAt: null });
    expect(after.body.permittedTransitions).toContain('Resolved');

    const resolved = await patchStatus({ status: 'Resolved', expectedVersion: 3 });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('Resolved');
    expect(resolved.body.version).toBe(4);
    expect(state.resolvedAt).toBeInstanceOf(Date);
  });

  it('reports every unmet condition the route can reach, in order', async () => {
    state = fresh({
      status: 'Reopened',
      lastReopenedAt: REOPENED,
      actions: [{ createdAt: EARLY, followUpStatus: 'Open' }]
    });

    const res = await patchStatus({ status: 'Resolved' });

    expect(res.body.error.unmet).toEqual(['ACTION_SINCE_REOPEN', 'OPEN_FOLLOW_UPS']);
    expect(res.body.error.message).toBe(
      'This ticket cannot be resolved yet: record at least one action taken since the ticket was reopened; complete or cancel 1 open follow-up.'
    );
  });
});

describe('reopen needs new work (API-16, AC-13, BR-17)', () => {
  beforeEach(() => signIn(PRIYA));

  it('refuses while the only Actions predate the reopen, accepts after one new Action', async () => {
    state = fresh({ status: 'Resolved', resolvedAt: EARLY });

    const reopened = await patchStatus({ status: 'Reopened' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.resolutionGate).toEqual({ ok: false, unmet: ['ACTION_SINCE_REOPEN'], reopenedAt: REOPENED.toISOString() });
    expect(reopened.body.permittedTransitions).not.toContain('Resolved');

    const blocked = await patchStatus({ status: 'Resolved' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.unmet).toEqual(['ACTION_SINCE_REOPEN']);

    state.actions.push({ createdAt: LATE, followUpStatus: null });

    const resolved = await patchStatus({ status: 'Resolved' });
    expect(resolved.status).toBe(200);
    expect(history.map((entry) => entry.toStatus)).toEqual(['Reopened', 'Resolved']);
  });
});

describe('transition matrix through the API (API-17, AC-14, BR-13)', () => {
  beforeEach(() => signIn(PRIYA));

  it.each([
    ['New', 'Open'],
    ['Open', 'WaitingForRequester'],
    ['InProgress', 'Resolved'],
    ['WaitingForRequester', 'InProgress'],
    ['Resolved', 'Closed'],
    ['Closed', 'Reopened'],
    ['Reopened', 'Cancelled']
  ])('allows %s → %s', async (from, to) => {
    state = fresh({ status: from });

    const res = await patchStatus({ status: to });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(to);
    expect(history).toEqual([{ ticketId: TICKET_ID, fromStatus: from, toStatus: to, changedById: PRIYA.id }]);
  });

  it.each([
    ['New', 'Resolved'],
    ['Open', 'Closed'],
    ['InProgress', 'Open'],
    ['Resolved', 'InProgress'],
    ['Closed', 'Resolved'],
    ['Cancelled', 'Reopened'],
    ['Cancelled', 'Open']
  ])('refuses %s → %s with INVALID_TRANSITION and writes nothing', async (from, to) => {
    state = fresh({ status: from });

    const res = await patchStatus({ status: to });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(history).toEqual([]);
  });

  it('keeps the Lab 3 owner answer for an unassigned Resolve, before the gate', async () => {
    state = fresh({ status: 'Open', ownerId: null, actions: [] });

    const res = await patchStatus({ status: 'Resolved' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toContain('must have an owner');
    expect(res.body.error).not.toHaveProperty('unmet');
  });
});

describe('stale updates (API-18, AC-17, BR-19)', () => {
  beforeEach(() => signIn(PRIYA));

  const operations: [string, () => request.Test][] = [
    ['claim', () => request(app).post(`/api/staff/tickets/${TICKET_ID}/claim`).set('Cookie', cookieHeader())],
    ['owner', () => request(app).patch(`/api/staff/tickets/${TICKET_ID}/owner`).set('Cookie', cookieHeader())],
    ['it-priority', () => request(app).patch(`/api/staff/tickets/${TICKET_ID}/it-priority`).set('Cookie', cookieHeader())],
    ['status', () => request(app).patch(statusPath).set('Cookie', cookieHeader())]
  ];
  const bodies: Record<string, Record<string, unknown>> = {
    claim: {},
    owner: { ownerId: CHEN_ID },
    'it-priority': { itPriority: 'High' },
    status: { status: 'WaitingForRequester' }
  };

  it.each(operations)('%s with an old expectedVersion is 409 STALE_UPDATE and changes nothing', async (name, call) => {
    const res = await call().send({ ...bodies[name], expectedVersion: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_UPDATE');
    expect(res.body.error.current).toEqual({ version: 3 });
    expect(res.body.error.message).toMatch(/someone else changed this ticket/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(state.version).toBe(3);
  });

  it.each(operations)('%s with the current expectedVersion applies and bumps the version', async (name, call) => {
    const res = await call().send({ ...bodies[name], expectedVersion: 3 });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(4);
  });

  it.each(operations)('%s without expectedVersion keeps the Lab 3 behaviour', async (name, call) => {
    const res = await call().send(bodies[name]);

    expect(res.status).toBe(200);
    expect(state.version).toBe(4);
  });

  it.each(operations)('%s refuses a non-integer expectedVersion with 400', async (name, call) => {
    for (const bad of ['3', 1.5, -1, null]) {
      const res = await call().send({ ...bodies[name], expectedVersion: bad });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('expectedVersion');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a change that lands between the read and the write loses with 409, even without expectedVersion', async () => {
    // Another request bumps the version after this one has read the ticket.
    vi.mocked(prisma.ticket.updateMany).mockImplementationOnce((() => {
      state.version = 4;
      return Promise.resolve({ count: 0 });
    }) as never);

    const res = await patchStatus({ status: 'WaitingForRequester' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'STALE_UPDATE', current: { version: 4 } });
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    expect(history).toEqual([]);
  });

  it('checks the version against both version and status in one conditional write', async () => {
    await patchStatus({ status: 'WaitingForRequester', expectedVersion: 3 });

    expect(vi.mocked(prisma.ticket.updateMany).mock.calls[0][0]).toEqual({
      where: { id: TICKET_ID, version: 3, status: 'InProgress' },
      data: { version: { increment: 1 } }
    });
  });
});

describe('status history (API-19, AC-16, BR-18)', () => {
  it('writes one row for a status change, a claim of New, and an assign of New; none for IT Priority', async () => {
    signIn(PRIYA);

    state = fresh({ status: 'New', ownerId: null });
    await request(app).post(`/api/staff/tickets/${TICKET_ID}/claim`).set('Cookie', cookieHeader()).send({});
    expect(history).toEqual([{ ticketId: TICKET_ID, fromStatus: 'New', toStatus: 'Open', changedById: PRIYA.id }]);

    history = [];
    state = fresh({ status: 'New', ownerId: null });
    await request(app).patch(`/api/staff/tickets/${TICKET_ID}/owner`).set('Cookie', cookieHeader()).send({ ownerId: CHEN_ID });
    expect(history).toEqual([{ ticketId: TICKET_ID, fromStatus: 'New', toStatus: 'Open', changedById: PRIYA.id }]);

    history = [];
    state = fresh({ status: 'Open' });
    await request(app).post(`/api/staff/tickets/${TICKET_ID}/claim`).set('Cookie', cookieHeader()).send({});
    await request(app).patch(`/api/staff/tickets/${TICKET_ID}/it-priority`).set('Cookie', cookieHeader()).send({ itPriority: 'Low' });
    expect(history).toEqual([]);

    await patchStatus({ status: 'Cancelled' });
    expect(history).toEqual([{ ticketId: TICKET_ID, fromStatus: 'Open', toStatus: 'Cancelled', changedById: PRIYA.id }]);
  });

  const historyRows = [
    { id: 'h-1', fromStatus: 'New', toStatus: 'Open', createdAt: EARLY, changedBy: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' } },
    { id: 'h-2', fromStatus: 'Open', toStatus: 'InProgress', createdAt: LATE, changedBy: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' } }
  ];

  it.each([
    ['the owning Requester', JENNIFER],
    ['IT Staff', PRIYA],
    ['an Administrator', ADMIN]
  ])('GET /api/tickets/:id/history answers %s oldest first, with the Created origin', async (_label, user) => {
    signIn(user);
    vi.mocked(prisma.ticketStatusChange.findMany).mockResolvedValue(historyRows as never);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}/history`).set('Cookie', cookieHeader());

    expect(res.status).toBe(200);
    expect(prisma.ticketStatusChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticketId: TICKET_ID }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    );
    expect(res.body.createdAt).toBe(CREATED.toISOString());
    expect(res.body.createdBy).toMatchObject({ id: JENNIFER.id, name: JENNIFER.name });
    expect(res.body.data.map((entry: { id: string }) => entry.id)).toEqual(['h-1', 'h-2']);
    expect(res.body.data[0]).toEqual({ ...historyRows[0], createdAt: EARLY.toISOString() });
  });

  it("answers another Requester's ticket with 403 and no history", async () => {
    signIn(DAVID);

    const res = await request(app).get(`/api/tickets/${TICKET_ID}/history`).set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(res.body.error).not.toHaveProperty('data');
    expect(prisma.ticketStatusChange.findMany).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown ticket and 401 without a session', async () => {
    signIn(PRIYA);
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never);
    expect((await request(app).get(`/api/tickets/${TICKET_ID}/history`).set('Cookie', cookieHeader())).status).toBe(404);
    expect((await request(app).get(`/api/tickets/${TICKET_ID}/history`)).status).toBe(401);
  });
});

describe('cancel cancels open follow-ups (API-20, AC-18, BR-16)', () => {
  it('cancels the two open follow-ups in the same transaction and leaves the completed one', async () => {
    signIn(PRIYA);
    state = fresh({
      actions: [
        { createdAt: EARLY, followUpStatus: 'Open' },
        { createdAt: EARLY, followUpStatus: 'Open' },
        { createdAt: EARLY, followUpStatus: 'Completed' }
      ]
    });

    const res = await patchStatus({ status: 'Cancelled' });

    expect(res.status).toBe(200);
    expect(state.actions.map((action) => action.followUpStatus)).toEqual(['Cancelled', 'Cancelled', 'Completed']);
    const call = vi.mocked(prisma.ticketAction.updateMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ ticketId: TICKET_ID, followUpStatus: 'Open' });
    expect(call.data).toMatchObject({
      followUpStatus: 'Cancelled',
      followUpClosedById: PRIYA.id,
      updatedById: PRIYA.id,
      version: { increment: 1 }
    });
    expect(call.data.followUpClosedAt).toBeInstanceOf(Date);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.body.counts.openFollowUps).toBe(0);
  });

  it('touches no follow-up on any other transition', async () => {
    signIn(PRIYA);
    state = fresh({ actions: [{ createdAt: EARLY, followUpStatus: 'Open' }] });

    await patchStatus({ status: 'WaitingForRequester' });

    expect(prisma.ticketAction.updateMany).not.toHaveBeenCalled();
    expect(state.actions[0].followUpStatus).toBe('Open');
  });
});

describe('Requester indication stays advisory (API-21, AC-15, BR-15)', () => {
  it('sets requesterResolvedAt without changing status; a Requester status change is 403', async () => {
    signIn(JENNIFER);

    const indicated = await request(app)
      .post(`/api/tickets/${TICKET_ID}/resolution-indication`)
      .set('Cookie', cookieHeader());

    expect(indicated.status).toBe(200);
    expect(state.status).toBe('InProgress');
    expect(state.requesterResolvedAt).toBeInstanceOf(Date);

    const refused = await patchStatus({ status: 'Resolved' });
    expect(refused.status).toBe(403);
    expect(history).toEqual([]);
  });
});

describe('Administrator stays read-only for the workflow (API-22, AC-14, BR-13, AD-02)', () => {
  beforeEach(() => signIn(ADMIN));

  it.each([
    ['status', () => request(app).patch(statusPath).send({ status: 'WaitingForRequester' })],
    ['owner', () => request(app).patch(`/api/staff/tickets/${TICKET_ID}/owner`).send({ ownerId: CHEN_ID })],
    ['it-priority', () => request(app).patch(`/api/staff/tickets/${TICKET_ID}/it-priority`).send({ itPriority: 'High' })],
    ['claim', () => request(app).post(`/api/staff/tickets/${TICKET_ID}/claim`).send({})]
  ])('%s is 403', async (_name, call) => {
    const res = await call().set('Cookie', cookieHeader());

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still reads the gate, with no permitted transitions', async () => {
    const res = await request(app).get(`/api/staff/tickets/${TICKET_ID}`).set('Cookie', cookieHeader());

    expect(res.body.resolutionGate).toEqual({ ok: true, unmet: [], reopenedAt: null });
    expect(res.body.permittedTransitions).toEqual([]);
  });

  it('may record an Action (AD-02)', async () => {
    vi.mocked(prisma.ticketAction.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.ticketAction.create).mockResolvedValue({
      id: 'a-new',
      ticketId: TICKET_ID,
      actionAt: EARLY,
      description: 'Checked the mailbox.',
      result: 'Quota fine.',
      attachmentNotes: null,
      followUpRequired: false,
      followUpNote: null,
      followUpStatus: null,
      followUpClosedAt: null,
      version: 0,
      createdAt: LATE,
      updatedAt: LATE,
      performedBy: { id: ADMIN.id, name: ADMIN.name, role: 'Administrator' },
      followUpAssignee: null,
      followUpClosedBy: null,
      updatedBy: null
    } as never);

    const res = await request(app)
      .post(`/api/staff/tickets/${TICKET_ID}/actions`)
      .set('Cookie', cookieHeader())
      .send({ actionAt: EARLY.toISOString(), description: 'Checked the mailbox.', result: 'Quota fine.' });

    expect(res.status).toBe(201);
  });
});
