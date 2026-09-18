import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    session: { findUnique: vi.fn() },
    category: {
      findMany: vi.fn().mockResolvedValue([
        { id: '1', name: 'Hardware' },
        { id: '2', name: 'Software' }
      ])
    }
  }
}));

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { JENNIFER, cookieHeader, mockSessionFor } from './lab-03/sessionMock.js';

// Lab 3 removed the Lab 1 `/api/users` directory (specification.md §7) and put
// the reference data behind the session, so the category calls carry the cookie.
describe('Express API Endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);
    mockSessionFor(vi.mocked(prisma.session.findUnique), JENNIFER);
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: '1', name: 'Hardware' },
      { id: '2', name: 'Software' }
    ]);
  });

  it('GET /api/health returns 200 with status ok, the service name, and database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('TokTickIT API');
    expect(res.body.database).toBe('CONNECTED');
  });

  it('GET /api/health returns 503 and error status when the database is unreachable', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.service).toBe('TokTickIT API');
    expect(res.body.database).toBe('UNREACHABLE');
  });

  it('GET /api/health needs no session', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('GET /api/users is gone: the Lab 1 user directory was dropped by the Lab 3 migration', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(404);
  });

  it('GET /api/categories returns active categories ordered by name under a data key', async () => {
    const res = await request(app).get('/api/categories').set('Cookie', cookieHeader());
    expect(res.status).toBe(200);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true }
    });
    expect(res.body.data).toEqual([
      { id: '1', name: 'Hardware' },
      { id: '2', name: 'Software' }
    ]);
  });

  it('GET /api/categories answers 401 without a session', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });

  it('GET /api/categories returns a safe 500 envelope when the database call fails', async () => {
    vi.mocked(prisma.category.findMany).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/categories').set('Cookie', cookieHeader());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });
});
