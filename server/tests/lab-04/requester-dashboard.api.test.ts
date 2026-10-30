import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db.js', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { count: vi.fn(), findMany: vi.fn() },
    ticketAction: { count: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn() },
    $transaction: vi.fn()
  }
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { ADMIN, JENNIFER, PRIYA, cookieHeader, mockSessionFor } from '../lab-03/sessionMock.js';
import type { FixtureUser } from '../lab-03/sessionMock.js';
import { at, ticket, useFixture } from './dashboardFake.js';
import type { Fixture } from './dashboardFake.js';

/**
 * API-23 … API-28 — Requester dashboard (Lab 4 api-spec.md §3.6, §4.4;
 * FR-08, BR-21 … BR-27, AC-02, AC-20, AC-21, AC-23).
 *
 * The database is `dashboardFake.ts`: it evaluates every `where`, so the
 * counts below are the fixture's real counts, and API-28 can follow each
 * card's `href` into `GET /api/tickets` and compare the totals.
 */

const DAVID: FixtureUser = {
  id: '55555555-2222-4333-8444-555555555555',
  name: 'David Lee',
  email: 'david.lee@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: false,
  isActive: true
};

const PLOY: FixtureUser = { ...DAVID, id: '77777777-2222-4333-8444-555555555555', name: 'Ploy Chaiyaporn', email: 'ploy@kmutt.ac.th' };

const me = JENNIFER.id;

/** Jennifer: one Ticket in every status, two waiting, seven resolved/closed; David: one of each. */
function fixture(): Fixture {
  const mine = [
    ticket({ requesterId: me, status: 'New' }, 1),
    ticket({ requesterId: me, status: 'Open' }, 2),
    ticket({ requesterId: me, status: 'InProgress' }, 3),
    ticket({ requesterId: me, status: 'WaitingForRequester' }, 4),
    ticket({ requesterId: me, status: 'WaitingForRequester' }, 20),
    ticket({ requesterId: me, status: 'Reopened' }, 5),
    ...[6, 7, 8, 9].map((day) => ticket({ requesterId: me, status: 'Resolved', resolvedAt: at(day, 5) }, day)),
    ...[10, 11, 12].map((day) => ticket({ requesterId: me, status: 'Closed', resolvedAt: at(day, 5) }, day)),
    ticket({ requesterId: me, status: 'Cancelled' }, 13)
  ];
  const davids = ['New', 'WaitingForRequester', 'Resolved', 'Closed'].map((status, index) =>
    ticket({ requesterId: DAVID.id, status, resolvedAt: status === 'Resolved' ? at(25) : null }, 25 + index)
  );
  return { tickets: [...mine, ...davids], actions: [], users: [] };
}

let data: Fixture;

function signIn(user: FixtureUser) {
  mockSessionFor(vi.mocked(prisma.session.findUnique), user);
}

const getDashboard = (query = '') =>
  request(app).get(`/api/dashboard/requester${query}`).set('Cookie', cookieHeader());

beforeEach(() => {
  vi.resetAllMocks();
  data = fixture();
  useFixture(prisma as unknown as Record<string, unknown>, data);
  signIn(JENNIFER);
});

describe('counts (API-23, AC-02, BR-21, BR-22)', () => {
  it('counts only the caller, with active = New, Open, In Progress, Waiting, Reopened', async () => {
    const res = await getDashboard();

    expect(res.status).toBe(200);
    expect(res.body.metrics.open.count).toBe(6);
    expect(res.body.metrics.waitingForMe.count).toBe(2);
    expect(res.body.metrics.resolved.count).toBe(4);
    expect(res.body.metrics.closed.count).toBe(3);
    expect(res.body.totalTickets).toBe(14);
    expect(new Date(res.body.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('reads everything in one REPEATABLE READ batch, so the counts describe one moment (BR-21)', async () => {
    await getDashboard();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [operations, options] = vi.mocked(prisma.$transaction).mock.calls[0] as unknown as [unknown[], unknown];
    expect(operations).toHaveLength(8);
    expect(options).toEqual({ isolationLevel: 'RepeatableRead' });
  });

  it('carries each card’s drill-down href from the server', async () => {
    const res = await getDashboard();
    expect(res.body.metrics.open.href).toBe(
      '/tickets?status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened'
    );
    expect(res.body.metrics.waitingForMe.href).toBe('/tickets?status=WaitingForRequester');
    expect(res.body.metrics.resolved.href).toBe('/tickets?status=Resolved');
    expect(res.body.metrics.closed.href).toBe('/tickets?status=Closed');
  });
});

describe('ownership (API-24, AC-02, BR-23)', () => {
  it('scopes every count and list to the session user', async () => {
    await getDashboard();

    const wheres = [
      ...vi.mocked(prisma.ticket.count).mock.calls,
      ...vi.mocked(prisma.ticket.findMany).mock.calls
    ].map(([args]) => (args as { where: Record<string, unknown> }).where);
    expect(wheres).toHaveLength(8);
    for (const where of wheres) expect(where.requesterId).toBe(me);
  });

  it('ignores a requesterId (or any) parameter: the answer is the same', async () => {
    const plain = await getDashboard();
    const widened = await getDashboard(`?requesterId=${DAVID.id}&status=Closed`);

    const strip = (body: Record<string, unknown>) => ({ ...body, generatedAt: null });
    expect(strip(widened.body)).toEqual(strip(plain.body));
    const davidsIds = data.tickets.filter((row) => row.requesterId === DAVID.id).map((row) => row.id);
    const listed = Object.values(widened.body.lists as Record<string, { id: string }[]>).flat().map((row) => row.id);
    expect(listed.some((id) => davidsIds.includes(id))).toBe(false);
  });
});

describe('lists (API-25, AC-23, BR-25)', () => {
  it('needsAttention: waiting for the Requester, most recently updated first', async () => {
    const res = await getDashboard();
    const waiting = data.tickets.filter((row) => row.requesterId === me && row.status === 'WaitingForRequester');
    expect(res.body.lists.needsAttention.map((row: { id: string }) => row.id)).toEqual(
      [...waiting].sort((a, b) => +b.updatedAt - +a.updatedAt).map((row) => row.id)
    );
  });

  it('recentlyUpdated: any status, newest first, capped at 5', async () => {
    const res = await getDashboard();
    const expected = data.tickets
      .filter((row) => row.requesterId === me)
      .sort((a, b) => +b.updatedAt - +a.updatedAt)
      .slice(0, 5)
      .map((row) => row.ticketNumber);
    expect(res.body.lists.recentlyUpdated.map((row: { ticketNumber: string }) => row.ticketNumber)).toEqual(expected);
  });

  it('recentlyResolved: Resolved and Closed by resolvedAt, newest first, capped at 5', async () => {
    const res = await getDashboard();
    const rows = res.body.lists.recentlyResolved as { status: string; resolvedAt: string }[];
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => ['Resolved', 'Closed'].includes(row.status))).toBe(true);
    const times = rows.map((row) => Date.parse(row.resolvedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('every row is a DashboardTicket: no description or other body text (AC-30)', async () => {
    const res = await getDashboard();
    for (const row of Object.values(res.body.lists as Record<string, Record<string, unknown>[]>).flat()) {
      expect(Object.keys(row).sort()).toEqual(
        ['id', 'itPriority', 'resolvedAt', 'status', 'summary', 'ticketNumber', 'updatedAt'].sort()
      );
    }
    expect(JSON.stringify(res.body)).not.toContain('private description');
  });
});

describe('empty (API-26, AC-21, BR-26)', () => {
  it('a Requester with no Tickets gets every count as 0 (present) and empty lists', async () => {
    signIn(PLOY);

    const res = await getDashboard();

    expect(res.status).toBe(200);
    for (const key of ['open', 'waitingForMe', 'resolved', 'closed']) {
      expect(res.body.metrics[key].count).toBe(0);
      expect(typeof res.body.metrics[key].href).toBe('string');
    }
    expect(res.body.lists).toEqual({ needsAttention: [], recentlyUpdated: [], recentlyResolved: [] });
    expect(res.body.totalTickets).toBe(0);
  });
});

describe('role protection (API-27, AC-21)', () => {
  it.each([
    ['IT Staff', PRIYA],
    ['an Administrator', ADMIN]
  ])('refuses %s with 403 and runs no query', async (_label, user) => {
    signIn(user);
    const res = await getDashboard();

    expect(res.status).toBe(403);
    expect(res.body.error).not.toHaveProperty('metrics');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses no session with 401', async () => {
    const res = await request(app).get('/api/dashboard/requester');
    expect(res.status).toBe(401);
  });

  it('answers a database failure with the safe 500', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('connection reset'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await getDashboard();

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('connection reset');
  });
});

describe('drill-down totals equal the cards (API-28, AC-20, BR-27)', () => {
  it.each(['open', 'waitingForMe', 'resolved', 'closed'])('%s', async (key) => {
    const dashboard = await getDashboard();
    const { count, href } = dashboard.body.metrics[key] as { count: number; href: string };

    const list = await request(app).get(`/api${href}`).set('Cookie', cookieHeader());

    expect(list.status).toBe(200);
    expect(list.body.pagination.totalItems).toBe(count);
  });
});
