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

  res.json({
    status: 'OK',
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
