/**
 * MIG-01 — Lab 3 migration check (AC-31, BR-28; tests.md §2 "Migration").
 *
 * Run by hand against PostgreSQL, in two steps around `prisma migrate deploy`
 * and *before* the seed (the seed upserts rows, so counts are only comparable
 * pre-seed):
 *
 *   npx tsx scripts/verify-lab03-migration.ts before   # on the Lab 2 schema
 *   npx prisma migrate deploy
 *   npx tsx scripts/verify-lab03-migration.ts after    # on the Lab 3 schema
 *
 * `before` writes a snapshot file; `after` re-counts through the new schema
 * and compares. Everything is raw SQL, because the generated Prisma client
 * only knows the Lab 3 schema and the "before" step runs on Lab 2.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const SNAPSHOT = new URL('./lab03-migration-before.json', import.meta.url);

interface Snapshot {
  tickets: number;
  attachments: number;
  users: number;
  requesterIds: string[];
  priorities: Record<string, string>;
}

const prisma = new PrismaClient();

async function count(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint AS count FROM "${table}"`);
  return Number(rows[0].count);
}

async function before(): Promise<void> {
  const requesterRows = await prisma.$queryRawUnsafe<{ requesterId: string }[]>(
    'SELECT DISTINCT "requesterId" FROM "Ticket" ORDER BY "requesterId"'
  );
  const priorityRows = await prisma.$queryRawUnsafe<{ id: string; priority: string }[]>(
    'SELECT "id", "priority"::text AS priority FROM "Ticket"'
  );

  const snapshot: Snapshot = {
    tickets: await count('Ticket'),
    attachments: await count('Attachment'),
    users: await count('RequesterUser'),
    requesterIds: requesterRows.map((row) => row.requesterId),
    priorities: Object.fromEntries(priorityRows.map((row) => [row.id, row.priority]))
  };

  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2));
  console.log('Before migration:', {
    tickets: snapshot.tickets,
    attachments: snapshot.attachments,
    requesterUsers: snapshot.users,
    distinctRequesters: snapshot.requesterIds.length
  });
}

async function after(): Promise<void> {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8')) as Snapshot;
  const failures: string[] = [];

  const tickets = await count('Ticket');
  const attachments = await count('Attachment');
  const users = await count('User');

  if (tickets !== snapshot.tickets) failures.push(`Ticket count ${snapshot.tickets} → ${tickets}`);
  if (attachments !== snapshot.attachments) failures.push(`Attachment count ${snapshot.attachments} → ${attachments}`);
  if (users !== snapshot.users) failures.push(`User count ${snapshot.users} → ${users}`);

  // Every requesterId still resolves to a User (BR-28).
  const dangling = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT count(*)::bigint AS count FROM "Ticket" t LEFT JOIN "User" u ON u."id" = t."requesterId" WHERE u."id" IS NULL'
  );
  if (Number(dangling[0].count) !== 0) failures.push(`${dangling[0].count} tickets have a requesterId with no User`);

  const requesterRows = await prisma.$queryRawUnsafe<{ requesterId: string }[]>(
    'SELECT DISTINCT "requesterId" FROM "Ticket" ORDER BY "requesterId"'
  );
  const requesterIds = requesterRows.map((row) => row.requesterId);
  if (JSON.stringify(requesterIds) !== JSON.stringify(snapshot.requesterIds)) {
    failures.push('The set of requesterId values changed');
  }

  // itPriority equals priority on every row (BR-16).
  const mismatched = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    'SELECT count(*)::bigint AS count FROM "Ticket" WHERE "itPriority" <> "priority"'
  );
  if (Number(mismatched[0].count) !== 0) failures.push(`${mismatched[0].count} tickets have itPriority <> priority`);

  const priorityRows = await prisma.$queryRawUnsafe<{ id: string; priority: string }[]>(
    'SELECT "id", "priority"::text AS priority FROM "Ticket"'
  );
  for (const row of priorityRows) {
    if (snapshot.priorities[row.id] !== row.priority) failures.push(`Ticket ${row.id} priority changed`);
  }

  // Every migrated user is a Requester who must change the password, with an
  // empty hash until the seed runs (AD-13).
  const migrated = await prisma.$queryRawUnsafe<{ role: string; must: boolean; hash: string }[]>(
    'SELECT "role"::text AS role, "mustChangePassword" AS must, "passwordHash" AS hash FROM "User"'
  );
  for (const row of migrated) {
    if (row.role !== 'Requester') failures.push('A migrated user is not a Requester');
    if (row.must !== true) failures.push('A migrated user does not have mustChangePassword = true');
    if (row.hash !== '') failures.push('A migrated user has a non-empty passwordHash before the seed');
  }

  // Statuses survived the enum swap.
  const statuses = await prisma.$queryRawUnsafe<{ status: string; count: bigint }[]>(
    'SELECT "status"::text AS status, count(*)::bigint AS count FROM "Ticket" GROUP BY "status"'
  );

  console.log('After migration:', {
    tickets,
    attachments,
    users,
    distinctRequesters: requesterIds.length,
    statuses: Object.fromEntries(statuses.map((row) => [row.status, Number(row.count)]))
  });

  if (failures.length > 0) {
    console.error('MIG-01 FAILED:');
    for (const failure of failures) console.error(' -', failure);
    process.exitCode = 1;
  } else {
    console.log('MIG-01 PASSED: counts, ownership, priorities and migrated users all verified.');
  }
}

const phase = process.argv[2];

(phase === 'before' ? before() : phase === 'after' ? after() : Promise.reject(new Error('Usage: verify-lab03-migration.ts <before|after>')))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
