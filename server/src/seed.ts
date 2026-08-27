import { prisma } from './db.js';
import { ADMIN_USER, CATEGORIES, RELATED_SYSTEMS, REQUESTERS } from './seedData.js';

/**
 * Idempotent seed (BR-12): every write is an upsert keyed on a unique column,
 * so running this any number of times leaves exactly one row per seeded entity
 * and never fails on a re-run.
 */
export async function seed(client: typeof prisma = prisma): Promise<void> {
  await client.user.upsert({
    where: { email: ADMIN_USER.email },
    update: { name: ADMIN_USER.name },
    create: ADMIN_USER,
  });

  for (const category of CATEGORIES) {
    await client.category.upsert({
      where: { name: category.name },
      update: { description: category.description, isActive: true },
      create: { ...category, isActive: true },
    });
  }

  for (const system of RELATED_SYSTEMS) {
    await client.relatedSystem.upsert({
      where: { name: system.name },
      update: { isActive: true },
      create: { ...system, isActive: true },
    });
  }

  for (const requester of REQUESTERS) {
    await client.requesterUser.upsert({
      where: { email: requester.email },
      update: {
        name: requester.name,
        department: requester.department,
        isActive: requester.isActive,
      },
      create: requester,
    });
  }
}

/** Entry point used by `prisma db seed` / `npm run prisma:seed`. */
async function main(): Promise<void> {
  await seed();

  const [categories, relatedSystems, activeRequesters, inactiveRequesters] = await Promise.all([
    prisma.category.count(),
    prisma.relatedSystem.count(),
    prisma.requesterUser.count({ where: { isActive: true } }),
    prisma.requesterUser.count({ where: { isActive: false } }),
  ]);

  console.log('Seed complete:', {
    categories,
    relatedSystems,
    activeRequesters,
    inactiveRequesters,
  });
}

// Only run when executed directly, so importing `seed` in tests has no side effects.
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/src/seed.ts');

if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
