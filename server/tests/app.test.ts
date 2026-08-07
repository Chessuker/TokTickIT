import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

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

describe('Express API Endpoints', () => {
  it('GET /api/health returns 200 OK and database status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.database).toBe('CONNECTED');
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
