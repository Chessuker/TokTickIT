import dotenv from 'dotenv';
import { app } from './app.js';
import { prisma } from './db.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function main() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to PostgreSQL via Prisma');
  } catch (error) {
    console.error('Warning: PostgreSQL connection error on startup:', error);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

main();
