// Loaded here rather than only in index.ts so every entry point that touches the
// database — the server, the seed script, one-off scripts — picks up DATABASE_URL.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
