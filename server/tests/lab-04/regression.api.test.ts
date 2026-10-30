import { describe, it, expect, vi, beforeEach } from 'vitest';

const failure = new Error('invalid input syntax for type uuid: "SELECT * FROM \\"Ticket\\"" at PrismaClient.ticket.findFirst');

vi.mock('../../src/db.js', () => {
  const broken = () => vi.fn(() => Promise.reject(failure));
  const delegate = () =>
    new Proxy({}, { get: (target: Record<string, unknown>, key: string) => (target[key] ??= broken()) });
  return {
    prisma: {
      session: { findUnique: vi.fn(), delete: vi.fn() },
      ticket: delegate(),
      ticketAction: delegate(),
      ticketStatusChange: delegate(),
      user: delegate(),
      $transaction: broken(),
      $queryRaw: vi.fn()
    }
  };
});

import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db.js';
import { JENNIFER, PRIYA, cookieHeader, mockSessionFor } from '../lab-03/sessionMock.js';
import type { FixtureUser } from '../lab-03/sessionMock.js';

/**
 * API-37, API-38 — health and safe failure on every Lab 4 route (api-spec.md
 * §1.1, §4.5; BR-28, AC-27, AC-31).
 *
 * Every database delegate rejects with an error whose message looks like SQL
 * and a stack, so a route that leaked its cause would show it. Only the
 * session lookup works, so each request reaches its handler.
 */

const TICKET = 'c3d4e5f6-1111-4222-8333-444455556666';
const ACTION = 'a1b2c3d4-5555-4666-8777-888899990000';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GET /api/health (API-37, AC-31)', () => {
  it('answers 200 CONNECTED when the database answers', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }] as never);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'CONNECTED' });
  });

  it('answers 503 UNREACHABLE when it does not, with no detail', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(failure);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', database: 'UNREACHABLE' });
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
  });
});

describe('safe 500 on every Lab 4 route (API-38, BR-28, AC-27)', () => {
  const routes: [string, FixtureUser, () => request.Test][] = [
    ['GET staff actions', PRIYA, () => request(app).get(`/api/staff/tickets/${TICKET}/actions`)],
    ['GET requester actions', JENNIFER, () => request(app).get(`/api/tickets/${TICKET}/actions`)],
    [
      'POST action',
      PRIYA,
      () =>
        request(app)
          .post(`/api/staff/tickets/${TICKET}/actions`)
          .send({ actionAt: '2026-10-01T02:00:00.000Z', description: 'Checked.', result: 'Fine.' })
    ],
    [
      'PATCH action',
      PRIYA,
      () => request(app).patch(`/api/staff/tickets/${TICKET}/actions/${ACTION}`).send({ version: 0, result: 'Fine.' })
    ],
    ['GET history', JENNIFER, () => request(app).get(`/api/tickets/${TICKET}/history`)],
    ['GET staff detail', PRIYA, () => request(app).get(`/api/staff/tickets/${TICKET}`)],
    ['PATCH status', PRIYA, () => request(app).patch(`/api/staff/tickets/${TICKET}/status`).send({ status: 'Resolved' })],
    ['PATCH owner', PRIYA, () => request(app).patch(`/api/staff/tickets/${TICKET}/owner`).send({ ownerId: null })],
    ['PATCH it-priority', PRIYA, () => request(app).patch(`/api/staff/tickets/${TICKET}/it-priority`).send({ itPriority: 'High' })],
    ['POST claim', PRIYA, () => request(app).post(`/api/staff/tickets/${TICKET}/claim`).send({})],
    ['GET requester dashboard', JENNIFER, () => request(app).get('/api/dashboard/requester')],
    ['GET staff dashboard', PRIYA, () => request(app).get('/api/staff/dashboard')],
    ['GET queue with followUp=mine', PRIYA, () => request(app).get('/api/staff/tickets?followUp=mine')],
    ['GET My Tickets with two statuses', JENNIFER, () => request(app).get('/api/tickets?status=Open&status=New')]
  ];

  it.each(routes)('%s → 500 INTERNAL_ERROR, generic message, correlation id, nothing else', async (_name, user, call) => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), user);

    const res = await call().set('Cookie', cookieHeader());

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'correlationId', 'message']);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(res.body.error.correlationId).toMatch(/^[a-z0-9]{8,}$/);
    const text = JSON.stringify(res.body);
    for (const leak of ['SELECT', 'Prisma', 'uuid', ' at ', 'stack']) expect(text).not.toContain(leak);
  });

  it('logs the real cause server-side against the same correlation id', async () => {
    mockSessionFor(vi.mocked(prisma.session.findUnique), PRIYA);
    const res = await request(app).get('/api/staff/dashboard').set('Cookie', cookieHeader());

    const logged = vi.mocked(console.error).mock.calls.map((args) => String(args[0]));
    expect(logged.some((line) => line.includes(res.body.error.correlationId))).toBe(true);
  });
});
