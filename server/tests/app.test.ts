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
    },
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

  it('GET /api/categories returns categories ordered by name', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
    expect(res.body).toEqual([
      { id: '1', name: 'Hardware' },
      { id: '2', name: 'Software' }
    ]);
  });

  it('GET /api/categories returns 500 when the database call fails', async () => {
    vi.mocked(prisma.category.findMany).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch categories');
  });
});
