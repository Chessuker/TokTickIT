import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { BCRYPT_COST } from './passwordPolicy.js';
import { CATEGORIES, RELATED_SYSTEMS, USERS } from './seedData.js';

export interface SeedOptions {
  /**
   * Turns a plain seed password into the stored hash. Defaults to bcrypt at
   * the production cost; tests pass a cheap stand-in so the suite stays fast.
   */
  hashPassword?: (password: string) => Promise<string>;
}

/**
 * Idempotent seed (Lab 2 BR-12, Lab 3 BR-29): every write is an upsert keyed
 * on a unique column, so running this any number of times leaves exactly one
 * row per seeded entity and never fails on a re-run. Nothing is ever deleted.
 *
 * Users are upserted by email, which is what makes the migration hand-off
 * work (AD-13): the migration renames the Lab 2 requesters into `User` with an
 * empty `passwordHash`, and this seed writes the real hash of the documented
 * initial password onto those same rows. Re-running the seed resets each
 * local account to its documented password and `mustChangePassword` state,
 * which is the behaviour the E2E suite relies on.
 */
export async function seed(client: typeof prisma = prisma, options: SeedOptions = {}): Promise<void> {
  const hashPassword = options.hashPassword ?? ((password: string) => bcrypt.hash(password, BCRYPT_COST));

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

  for (const user of USERS) {
    const { password, ...fields } = user;
    const passwordHash = await hashPassword(password);

    await client.user.upsert({
      where: { email: fields.email },
      update: { ...fields, passwordHash },
      create: { ...fields, passwordHash },
    });
  }
}

/** Entry point used by `prisma db seed` / `npm run prisma:seed`. */
async function main(): Promise<void> {
  await seed();

  const [categories, relatedSystems, requesters, itStaff, administrators, inactiveUsers] =
    await Promise.all([
      prisma.category.count(),
      prisma.relatedSystem.count(),
      prisma.user.count({ where: { role: 'Requester' } }),
      prisma.user.count({ where: { role: 'ITStaff' } }),
      prisma.user.count({ where: { role: 'Administrator' } }),
      prisma.user.count({ where: { isActive: false } }),
    ]);

  // Counts only — never an email, password or hash (BR-09, BR-29).
  console.log('Seed complete:', {
    categories,
    relatedSystems,
    requesters,
    itStaff,
    administrators,
    inactiveUsers,
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
