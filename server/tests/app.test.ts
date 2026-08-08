import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: '1', email: 'test@example.com', name: 'Test User', createdAt: new Date().toISOString() }
      ]),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: '2', ...data, createdAt: new Date().toISOString() })
      )
    }
  }
}));

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';

describe('Express API Endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: '1', email: 'test@example.com', name: 'Test User', createdAt: new Date().toISOString() }
    ]);
    vi.mocked(prisma.user.create).mockImplementation(({ data }: { data: { email: string; name?: string } }) =>
      Promise.resolve({ id: '2', ...data, createdAt: new Date().toISOString() })
    );
  });

  it('GET /api/health returns 200 OK and database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.database).toBe('CONNECTED');
  });

  it('GET /api/health returns 503 and ERROR status when the database is unreachable', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('ERROR');
    expect(res.body.database).toBe('UNREACHABLE');
  });

  it('GET /api/users returns list of users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].email).toBe('test@example.com');
  });

  it('POST /api/users creates a new user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'newuser@example.com', name: 'New User' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newuser@example.com');
  });

  it('POST /api/users requires email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'No Email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email is required');
  });
});
