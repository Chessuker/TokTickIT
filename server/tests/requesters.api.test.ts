import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    requesterUser: {
      findMany: vi.fn()
    }
  }
}));

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';

/**
 * API-12 — GET /api/requesters (AC-14, BR-11).
 *
 * The seed ships four active requesters plus one inactive one (Alex Smith).
 * The rows below mirror that shape so the "inactive requester never leaves the
 * database" rule is asserted against realistic data.
 */
const ACTIVE_REQUESTERS = [
  { id: 'r-3', name: 'David Lee', email: 'david.lee@kmutt.ac.th', department: 'Engineering' },
  { id: 'r-1', name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th', department: 'Registrar' },
  { id: 'r-4', name: 'Michael Brown', email: 'michael.brown@kmutt.ac.th', department: 'Library' },
  { id: 'r-2', name: 'Sarah Johnson', email: 'sarah.johnson@kmutt.ac.th', department: 'Finance' }
];

const INACTIVE_REQUESTER = {
  id: 'r-5',
  name: 'Alex Smith',
  email: 'alex.smith@kmutt.ac.th',
  department: 'Facilities'
};

describe('GET /api/requesters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The route is expected to filter in the query, so the mock answers with
    // active rows only — the `where` clause is asserted separately below.
    vi.mocked(prisma.requesterUser.findMany).mockResolvedValue(ACTIVE_REQUESTERS);
  });

  it('returns 200 with the active requesters under a data key', async () => {
    const res = await request(app).get('/api/requesters');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(ACTIVE_REQUESTERS);
  });

  it('queries only active requesters, sorted by name ascending (BR-11)', async () => {
    await request(app).get('/api/requesters');

    expect(prisma.requesterUser.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, department: true }
    });
  });

  it('never exposes isActive on the returned requesters', async () => {
    const res = await request(app).get('/api/requesters');

    for (const requester of res.body.data) {
      expect(requester).not.toHaveProperty('isActive');
    }
  });

  it('does not return the inactive requester (AC-14)', async () => {
    const res = await request(app).get('/api/requesters');

    const names = res.body.data.map((r: { name: string }) => r.name);
    expect(names).not.toContain(INACTIVE_REQUESTER.name);
    expect(res.body.data.some((r: { id: string }) => r.id === INACTIVE_REQUESTER.id)).toBe(false);
    expect(res.body.data).toHaveLength(4);
  });

  it('returns 200 with an empty list when no requester is active', async () => {
    vi.mocked(prisma.requesterUser.findMany).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/requesters');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns a safe 500 envelope when the database call fails', async () => {
    vi.mocked(prisma.requesterUser.findMany).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/requesters');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });
});
