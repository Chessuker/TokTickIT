import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { BCRYPT_COST } from './passwordPolicy.js';
import {
  CATEGORIES,
  RELATED_SYSTEMS,
  TICKETS,
  TICKET_ACTIONS,
  TICKET_COMMENTS,
  TICKET_INTERNAL_NOTES,
  TICKET_STATUS_CHANGES,
  USERS,
} from './seedData.js';
import type { ThreadSeed } from './seedData.js';

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
  const ticketIds = new Map<string, string>();

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

    const row = await client.ticket.upsert({
      where: { ticketNumber: ticket.ticketNumber },
      update: fields,
      create: { ticketNumber: ticket.ticketNumber, ...fields },
    });
    ticketIds.set(ticket.ticketNumber, row.id);
  }

  // Comments and notes have no natural unique key, so they are keyed on the
  // deterministic ids in seedData: a re-run rewrites the same rows instead of
  // appending a second copy of every thread (BR-29).
  const threadFields = (entry: ThreadSeed) => ({
    ticketId: lookup(ticketIds, entry.ticketNumber, 'ticket'),
    authorId: lookup(userIds, entry.authorEmail, 'user'),
    body: entry.body,
    createdAt: new Date(entry.createdAt),
  });

  for (const comment of TICKET_COMMENTS) {
    const fields = threadFields(comment);
    await client.ticketComment.upsert({
      where: { id: comment.id },
      update: fields,
      create: { id: comment.id, ...fields },
    });
  }

  for (const note of TICKET_INTERNAL_NOTES) {
    const fields = threadFields(note);
    await client.ticketInternalNote.upsert({
      where: { id: note.id },
      update: fields,
      create: { id: note.id, ...fields },
    });
  }

  // Lab 4 Actions Taken (specification.md §7, BR-30). Keyed on fixed ids like
  // the threads, so a re-run resets each seeded Action — follow-up state and
  // version included — and leaves Actions created through the app alone.
  for (const action of TICKET_ACTIONS) {
    const followUp = action.followUp;
    const fields = {
      ticketId: lookup(ticketIds, action.ticketNumber, 'ticket'),
      performedById: lookup(userIds, action.performedByEmail, 'user'),
      actionAt: new Date(action.actionAt),
      description: action.description,
      result: action.result,
      attachmentNotes: action.attachmentNotes,
      followUpRequired: followUp !== null,
      followUpNote: followUp?.note ?? null,
      followUpAssigneeId: followUp ? lookup(userIds, followUp.assigneeEmail, 'user') : null,
      followUpStatus: followUp?.status ?? null,
      followUpClosedAt: followUp?.closedAt ? new Date(followUp.closedAt) : null,
      followUpClosedById: followUp?.closedByEmail ? lookup(userIds, followUp.closedByEmail, 'user') : null,
      version: 0,
      updatedById: null,
      createdAt: new Date(action.actionAt),
      updatedAt: new Date(followUp?.closedAt ?? action.actionAt),
    };

    await client.ticketAction.upsert({
      where: { id: action.id },
      update: fields,
      create: { id: action.id, ...fields },
    });
  }

  // Status history (BR-18). The application only ever appends to this table;
  // the seed may rewrite its own fixed rows because they are fixtures, not
  // history anyone recorded.
  for (const change of TICKET_STATUS_CHANGES) {
    const fields = {
      ticketId: lookup(ticketIds, change.ticketNumber, 'ticket'),
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      changedById: lookup(userIds, change.changedByEmail, 'user'),
      createdAt: new Date(change.createdAt),
    };

    await client.ticketStatusChange.upsert({
      where: { id: change.id },
      update: fields,
      create: { id: change.id, ...fields },
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

  const [
    categories,
    relatedSystems,
    requesters,
    itStaff,
    administrators,
    inactiveUsers,
    seededTickets,
    comments,
    internalNotes,
    actions,
    openFollowUps,
    statusChanges,
  ] =
    await Promise.all([
      prisma.category.count(),
      prisma.relatedSystem.count(),
      prisma.user.count({ where: { role: 'Requester' } }),
      prisma.user.count({ where: { role: 'ITStaff' } }),
      prisma.user.count({ where: { role: 'Administrator' } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.ticket.count({ where: { ticketNumber: { startsWith: 'TKT-2026-9000' } } }),
      prisma.ticketComment.count(),
      prisma.ticketInternalNote.count(),
      prisma.ticketAction.count(),
      prisma.ticketAction.count({ where: { followUpStatus: 'Open' } }),
      prisma.ticketStatusChange.count(),
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
    comments,
    internalNotes,
    actions,
    openFollowUps,
    statusChanges,
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
