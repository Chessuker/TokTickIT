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
import { action, ticket, useFixture } from './dashboardFake.js';
import type { FakeTicket, Fixture } from './dashboardFake.js';

/**
 * API-29 … API-35 — IT Staff / Administrator dashboard (Lab 4 api-spec.md
 * §3.7, §4.3; FR-09, BR-21, BR-22, BR-24 … BR-27, AC-19 … AC-21, AC-30).
 *
 * Same evaluating fake as the Requester suite: the expected numbers below are
 * computed from the fixture by plain array code, independently of the metric
 * definitions, and API-33 follows every card's `href` into the Queue.
 */

const CHEN: FixtureUser = {
  id: '44444444-2222-4333-8444-555555555555',
  name: 'Chen Wei',
  email: 'chen.wei@kmutt.ac.th',
  role: 'ITStaff',
  mustChangePassword: false,
  isActive: true
};

const ACTIVE = ['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened'];
const R = JENNIFER.id;

function fixture(): Fixture {
  const tickets: FakeTicket[] = [
    ticket({ requesterId: R, status: 'New' }, 1),
    ticket({ requesterId: R, status: 'New', itPriority: 'High' }, 2),
    ticket({ requesterId: R, status: 'Open', ownerId: PRIYA.id, itPriority: 'High' }, 3),
    ticket({ requesterId: R, status: 'Open', ownerId: null, requesterResolvedAt: new Date('2026-10-04T00:00:00Z') }, 4),
    ticket({ requesterId: R, status: 'InProgress', ownerId: PRIYA.id, itPriority: 'High' }, 5),
    ticket({ requesterId: R, status: 'InProgress', ownerId: CHEN.id, itPriority: 'Low' }, 6),
    ticket({ requesterId: R, status: 'WaitingForRequester', ownerId: PRIYA.id, requesterResolvedAt: new Date('2026-10-07T00:00:00Z') }, 7),
    ticket({ requesterId: R, status: 'Reopened', ownerId: CHEN.id, itPriority: 'High' }, 8),
    ticket({ requesterId: R, status: 'Reopened', ownerId: PRIYA.id, itPriority: 'High' }, 9),
    ticket({ requesterId: R, status: 'Resolved', ownerId: PRIYA.id, itPriority: 'High', requesterResolvedAt: new Date('2026-10-09T00:00:00Z') }, 10),
    ticket({ requesterId: R, status: 'Closed', ownerId: PRIYA.id, itPriority: 'High' }, 11),
    ticket({ requesterId: R, status: 'Cancelled', ownerId: null, itPriority: 'High' }, 12)
  ];
  const [, , t3, , t5, t6, t7, t8, , t10, t11] = tickets;
  const actions = [
    // Priya's open follow-ups: two on one active Ticket, one on another, one on a Resolved one (not counted).
    action({ ticketId: t5.id, performedById: CHEN.id, followUpAssigneeId: PRIYA.id, followUpStatus: 'Open' }, 5),
    action({ ticketId: t5.id, performedById: PRIYA.id, followUpAssigneeId: PRIYA.id, followUpStatus: 'Open' }, 6),
    action({ ticketId: t8.id, performedById: CHEN.id, followUpAssigneeId: PRIYA.id, followUpStatus: 'Open' }, 8),
    action({ ticketId: t10.id, performedById: PRIYA.id, followUpAssigneeId: PRIYA.id, followUpStatus: 'Open' }, 10),
    // Closed follow-ups and someone else's.
    action({ ticketId: t3.id, performedById: PRIYA.id, followUpAssigneeId: PRIYA.id, followUpStatus: 'Completed' }, 3),
    action({ ticketId: t6.id, performedById: PRIYA.id, followUpAssigneeId: CHEN.id, followUpStatus: 'Open' }, 7),
    action({ ticketId: t7.id, performedById: PRIYA.id, description: 'x '.repeat(200) }, 9),
    action({ ticketId: t11.id, performedById: PRIYA.id }, 11),
    action({ ticketId: t11.id, performedById: PRIYA.id }, 12),
    action({ ticketId: t3.id, performedById: CHEN.id }, 13)
  ];
  const users = [
    { id: 'u1', role: 'Requester', isActive: true },
    { id: 'u2', role: 'Requester', isActive: true },
    { id: 'u3', role: 'Requester', isActive: false },
    { id: PRIYA.id, role: 'ITStaff', isActive: true },
    { id: CHEN.id, role: 'ITStaff', isActive: true },
    { id: 'u6', role: 'ITStaff', isActive: false },
    { id: ADMIN.id, role: 'Administrator', isActive: true }
  ];
  return { tickets, actions, users };
}

let data: Fixture;

function signIn(user: FixtureUser) {
  mockSessionFor(vi.mocked(prisma.session.findUnique), user);
}

const getDashboard = () => request(app).get('/api/staff/dashboard').set('Cookie', cookieHeader());
const active = (row: FakeTicket) => ACTIVE.includes(row.status);

beforeEach(() => {
  vi.resetAllMocks();
  data = fixture();
  useFixture(prisma as unknown as Record<string, unknown>, data);
  signIn(PRIYA);
});

describe('shared counts (API-29, AC-19, BR-22)', () => {
  it('unassigned, requesterReportsResolved, byStatus and byItPriority match the fixture', async () => {
    const res = await getDashboard();
    const m = res.body.metrics;

    expect(res.status).toBe(200);
    expect(m.unassigned.count).toBe(data.tickets.filter((row) => active(row) && row.ownerId === null).length);
    expect(m.unassigned.count).toBe(3);
    // The Resolved one with an indication is not active, so it is not counted.
    expect(m.requesterReportsResolved.count).toBe(2);
    expect(Object.fromEntries(Object.entries(m.byStatus).map(([key, value]) => [key, (value as { count: number }).count]))).toEqual({
      New: 2,
      Open: 2,
      InProgress: 2,
      WaitingForRequester: 1,
      Reopened: 2,
      Resolved: 1
    });
    // Active only: the High on Resolved, Closed and Cancelled Tickets are not "IT High" work.
    expect(m.byItPriority.High.count).toBe(5);
    expect(m.byItPriority.Medium.count).toBe(3);
    expect(m.byItPriority.Low.count).toBe(1);
    expect(res.body.viewer).toBe('ITStaff');
    expect(res.body.users).toBeNull();
  });

  it('reads everything in one REPEATABLE READ batch (BR-21)', async () => {
    await getDashboard();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$transaction).mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
  });
});

describe('"my" metrics (API-30, AC-19, BR-24)', () => {
  it('mine, myFollowUps (+ ticketCount) and myRecentActions are Priya’s', async () => {
    const res = await getDashboard();
    const m = res.body.metrics;

    expect(m.mine.count).toBe(data.tickets.filter((row) => active(row) && row.ownerId === PRIYA.id).length);
    expect(m.mine.count).toBe(4);
    // Three open follow-ups on active Tickets; the one on the Resolved Ticket does not count.
    expect(m.myFollowUps).toEqual({ count: 3, ticketCount: 2, href: '/staff/queue?followUp=mine' });

    const recent = res.body.lists.myRecentActions as { ticketNumber: string; descriptionPreview: string }[];
    expect(recent).toHaveLength(5);
    const expected = data.actions
      .filter((row) => row.performedById === PRIYA.id)
      .sort((a, b) => +b.createdAt - +a.createdAt)
      .slice(0, 5)
      .map((row) => row.id);
    expect(recent.map((row) => (row as unknown as { id: string }).id)).toEqual(expected);
    expect(recent.every((row) => row.ticketNumber.startsWith('TKT-'))).toBe(true);
    expect(recent.find((row) => row.descriptionPreview.startsWith('x x'))?.descriptionPreview.endsWith('…')).toBe(true);
  });

  it('Chen gets Chen’s numbers from the same data', async () => {
    signIn(CHEN);
    const res = await getDashboard();

    expect(res.body.metrics.mine.count).toBe(2);
    expect(res.body.metrics.myFollowUps).toMatchObject({ count: 1, ticketCount: 1 });
    expect(res.body.lists.myRecentActions).toHaveLength(3);
    // The shared cards do not depend on who asks.
    expect(res.body.metrics.unassigned.count).toBe(3);
  });
});

describe('Administrator variant (API-31, AC-19, BR-24)', () => {
  it('has no "my" cards, and adds the user-account counts', async () => {
    signIn(ADMIN);
    const res = await getDashboard();

    expect(res.status).toBe(200);
    expect(res.body.viewer).toBe('Administrator');
    expect(res.body.metrics.mine).toBeNull();
    expect(res.body.metrics.myFollowUps).toBeNull();
    expect(res.body.metrics.unassigned.count).toBe(3);
    expect(res.body.users).toEqual({
      activeByRole: { Requester: 2, ITStaff: 2, Administrator: 1 },
      inactive: 2,
      href: '/admin/users'
    });
    expect(res.body.lists.myRecentActions).toEqual([]);
  });
});

describe('role protection (API-32, AC-21)', () => {
  it('refuses a Requester with 403 before any count', async () => {
    signIn(JENNIFER);
    const res = await getDashboard();
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses no session with 401', async () => {
    expect((await request(app).get('/api/staff/dashboard')).status).toBe(401);
  });
});

describe('drill-down totals equal the cards (API-33, AC-20, BR-27)', () => {
  async function queueTotal(href: string) {
    const res = await request(app).get(`/api${href.replace('/staff/queue', '/staff/tickets')}`).set('Cookie', cookieHeader());
    expect(res.status).toBe(200);
    return res.body.pagination.totalItems as number;
  }

  it('every card, IT Staff', async () => {
    const m = (await getDashboard()).body.metrics;
    const cards: { count: number; href: string }[] = [
      m.unassigned,
      m.mine,
      m.requesterReportsResolved,
      ...Object.values(m.byStatus as Record<string, { count: number; href: string }>),
      ...Object.values(m.byItPriority as Record<string, { count: number; href: string }>)
    ];
    for (const card of cards) expect(await queueTotal(card.href), card.href).toBe(card.count);

    // The follow-up card counts follow-ups; the Queue lists the Tickets that hold them.
    expect(await queueTotal(m.myFollowUps.href)).toBe(m.myFollowUps.ticketCount);
  });

  it('followUp=mine as an Administrator is a 400 naming the parameter', async () => {
    signIn(ADMIN);
    const res = await request(app).get('/api/staff/tickets?followUp=mine').set('Cookie', cookieHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('followUp');
  });
});

describe('lists (API-34, BR-25)', () => {
  it('urgent: active IT High only, longest untouched first, capped at 5', async () => {
    const res = await getDashboard();
    const expected = data.tickets
      .filter((row) => active(row) && row.itPriority === 'High')
      .sort((a, b) => +a.updatedAt - +b.updatedAt)
      .slice(0, 5)
      .map((row) => row.id);
    expect(res.body.lists.urgent.map((row: { id: string }) => row.id)).toEqual(expected);
  });

  it('recentlyUpdated: every status, newest first, capped at 5', async () => {
    const res = await getDashboard();
    const expected = [...data.tickets].sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, 5).map((row) => row.id);
    expect(res.body.lists.recentlyUpdated.map((row: { id: string }) => row.id)).toEqual(expected);
  });
});

describe('payload (API-35, AC-30)', () => {
  it.each([
    ['IT Staff', PRIYA],
    ['an Administrator', ADMIN]
  ])('is under 10 KB for %s and carries no body text', async (_label, user) => {
    signIn(user);
    const res = await getDashboard();
    const text = JSON.stringify(res.body);

    expect(Buffer.byteLength(text)).toBeLessThan(10 * 1024);
    expect(text).not.toContain('private description');
    expect(text).not.toMatch(/"description"|"body"/);
  });
});
