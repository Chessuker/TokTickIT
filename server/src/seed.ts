import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { BCRYPT_COST } from './passwordPolicy.js';
import { CATEGORIES, RELATED_SYSTEMS, TICKETS, USERS } from './seedData.js';

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

  // The ids the tickets reference are taken from the upserts' return values,
  // so the seed never has to look anything up and works against a fresh or a
  // migrated database alike.
  const categoryIds = new Map<string, string>();
  const systemIds = new Map<string, string>();
  const userIds = new Map<string, string>();

  for (const category of CATEGORIES) {
    const row = await client.category.upsert({
      where: { name: category.name },
      update: { description: category.description, isActive: true },
      create: { ...category, isActive: true },
    });
    categoryIds.set(category.name, row.id);
  }

  for (const system of RELATED_SYSTEMS) {
    const row = await client.relatedSystem.upsert({
      where: { name: system.name },
      update: { isActive: true },
      create: { ...system, isActive: true },
    });
    systemIds.set(system.name, row.id);
  }

  for (const user of USERS) {
    const { password, ...fields } = user;
    const passwordHash = await hashPassword(password);

    const row = await client.user.upsert({
      where: { email: fields.email },
      update: { ...fields, passwordHash },
      create: { ...fields, passwordHash },
    });
    userIds.set(fields.email, row.id);
  }

  // Tickets are keyed on the reserved `TKT-2026-9000xx` numbers, so a re-run
  // resets each seeded ticket to its documented state and never touches a
  // ticket a user created. Timestamps are fixed for the same reason: the
  // queue's default order is stable across runs.
  for (const ticket of TICKETS) {
    const fields = {
      summary: ticket.summary,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      itPriority: ticket.itPriority,
      requesterId: lookup(userIds, ticket.requesterEmail, 'user'),
      ownerId: ticket.ownerEmail ? lookup(userIds, ticket.ownerEmail, 'user') : null,
      categoryId: lookup(categoryIds, ticket.category, 'category'),
      relatedSystemId: lookup(systemIds, ticket.relatedSystem, 'related system'),
      requesterResolvedAt: ticket.requesterResolvedAt ? new Date(ticket.requesterResolvedAt) : null,
      // BR-20: Resolved carries resolvedAt; Closed carries both.
      resolvedAt: ticket.status === 'Resolved' || ticket.status === 'Closed' ? new Date(ticket.updatedAt) : null,
      closedAt: ticket.status === 'Closed' ? new Date(ticket.updatedAt) : null,
      createdAt: new Date(ticket.createdAt),
      updatedAt: new Date(ticket.updatedAt),
    };

    await client.ticket.upsert({
      where: { ticketNumber: ticket.ticketNumber },
      update: fields,
      create: { ticketNumber: ticket.ticketNumber, ...fields },
    });
  }
}

/** A seeded ticket naming a category, system or user the seed did not create is a bug in the data. */
function lookup(ids: Map<string, string>, key: string, kind: string): string {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`Seed ticket references an unknown ${kind}: ${key}`);
  }
  return id;
}

/** Entry point used by `prisma db seed` / `npm run prisma:seed`. */
async function main(): Promise<void> {
  await seed();

  const [categories, relatedSystems, requesters, itStaff, administrators, inactiveUsers, seededTickets] =
    await Promise.all([
      prisma.category.count(),
      prisma.relatedSystem.count(),
      prisma.user.count({ where: { role: 'Requester' } }),
      prisma.user.count({ where: { role: 'ITStaff' } }),
      prisma.user.count({ where: { role: 'Administrator' } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.ticket.count({ where: { ticketNumber: { startsWith: 'TKT-2026-9000' } } }),
    ]);

  // Counts only — never an email, password or hash (BR-09, BR-29).
  console.log('Seed complete:', {
    categories,
    relatedSystems,
    requesters,
    itStaff,
    administrators,
    inactiveUsers,
    seededTickets,
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
