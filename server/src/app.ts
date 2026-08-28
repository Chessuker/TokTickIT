import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'DISCONNECTED';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'CONNECTED';
  } catch (error) {
    dbStatus = 'UNREACHABLE';
  }

  const isHealthy = dbStatus === 'CONNECTED';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'error',
    service: 'TokTickIT API',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

// User routes (Prisma integration)
app.get('/api/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Category routes (Prisma integration)
app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Development Requester routes (Issue #3, FR-02, BR-11, AC-14).
//
// This endpoint backs the Development Requester selector, which is a testing
// mechanism and not authentication (BR-03). Only active requesters are ever
// returned, and `isActive` itself is never exposed: an inactive requester must
// be indistinguishable from one that does not exist.
app.get('/api/requesters', async (_req, res) => {
  try {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, department: true }
    });
    res.json({ data: requesters });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.'
      }
    });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.create({
      data: { email, name }
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: 'User creation failed. Email may already exist.' });
  }
});
