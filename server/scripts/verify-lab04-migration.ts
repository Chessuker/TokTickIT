/**
 * MIG-01 / MIG-02 — Lab 4 migration and rollback check (AC-24, BR-29;
 * tests.md §2 "Migration, seed and performance").
 *
 * Run by hand against PostgreSQL, around `prisma migrate deploy` and *before*
 * the seed (the seed upserts rows, so counts are only comparable pre-seed):
 *
 *   npx tsx scripts/verify-lab04-migration.ts before          # on the Lab 3 schema
 *   npx prisma migrate deploy
 *   npx tsx scripts/verify-lab04-migration.ts after           # MIG-01
 *   npx prisma db execute --file prisma/rollback/20261003000000_lab04_actions_taken.down.sql --schema prisma/schema.prisma
 *   npx tsx scripts/verify-lab04-migration.ts after-rollback  # MIG-02
 *   npx prisma migrate deploy                                 # MIG-02 re-apply
 *   npx tsx scripts/verify-lab04-migration.ts after
 *
 * Raw SQL throughout, because the "before" and "after-rollback" steps run on
 * the Lab 3 schema, which the generated (Lab 4) client does not match.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const SNAPSHOT = new URL('./lab04-migration-before.json', import.meta.url);

/** Every Lab 1–3 table whose rows must survive untouched (BR-29). */
const LAB3_TABLES = ['User', 'Session', 'Category', 'RelatedSystem', 'Ticket', 'Attachment', 'TicketComment', 'TicketInternalNote'];

/** Foreign keys that must still resolve: [table, column, target]. */
const FOREIGN_KEYS: Array<[string, string, string]> = [
  ['Ticket', 'requesterId', 'User'],
  ['Ticket', 'ownerId', 'User'],
  ['Ticket', 'categoryId', 'Category'],
  ['Attachment', 'ticketId', 'Ticket'],
  ['TicketComment', 'ticketId', 'Ticket'],
  ['TicketComment', 'authorId', 'User'],
  ['TicketInternalNote', 'ticketId', 'Ticket'],
  ['TicketInternalNote', 'authorId', 'User']
];

interface Snapshot {
  counts: Record<string, number>;
  /** id → status, so a migration that rewrote a row would show. */
  ticketStatuses: Record<string, string>;
}

const prisma = new PrismaClient();

async function scalar(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ value: bigint }[]>(sql);
  return Number(rows[0].value);
}

async function counts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of LAB3_TABLES) {
    result[table] = await scalar(`SELECT count(*)::bigint AS value FROM "${table}"`);
  }
  return result;
}

async function ticketStatuses(): Promise<Record<string, string>> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
    'SELECT "id", "status"::text AS status FROM "Ticket"'
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.status]));
}

async function tableExists(table: string): Promise<boolean> {
  return (await scalar(`SELECT count(*)::bigint AS value FROM information_schema.tables WHERE table_name = '${table}'`)) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  return (
    (await scalar(
      `SELECT count(*)::bigint AS value FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`
    )) > 0
  );
}

/** Checks shared by `after` and `after-rollback`: counts, statuses, foreign keys. */
async function compareWithSnapshot(failures: string[]) {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8')) as Snapshot;
  const now = await counts();

  for (const table of LAB3_TABLES) {
    if (now[table] !== snapshot.counts[table]) failures.push(`${table} count ${snapshot.counts[table]} → ${now[table]}`);
  }

  const statuses = await ticketStatuses();
  for (const [id, status] of Object.entries(snapshot.ticketStatuses)) {
    if (statuses[id] !== status) failures.push(`Ticket ${id} status ${status} → ${statuses[id] ?? 'missing'}`);
  }

  for (const [table, column, target] of FOREIGN_KEYS) {
    const dangling = await scalar(
      `SELECT count(*)::bigint AS value FROM "${table}" t LEFT JOIN "${target}" x ON x."id" = t."${column}" WHERE t."${column}" IS NOT NULL AND x."id" IS NULL`
    );
    if (dangling !== 0) failures.push(`${dangling} ${table}.${column} values no longer resolve to ${target}`);
  }

  return now;
}

function report(label: string, failures: string[], success: string) {
  if (failures.length > 0) {
    console.error(`${label} FAILED:`);
    for (const failure of failures) console.error(' -', failure);
    process.exitCode = 1;
  } else {
    console.log(`${label} PASSED: ${success}`);
  }
}

async function before(): Promise<void> {
  if (await tableExists('TicketAction')) {
    throw new Error('TicketAction already exists: run "before" on the Lab 3 schema, before migrate deploy.');
  }

  const snapshot: Snapshot = { counts: await counts(), ticketStatuses: await ticketStatuses() };
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2));
  console.log('Before migration (Lab 3 schema):', snapshot.counts);
}

async function after(): Promise<void> {
  const failures: string[] = [];
  const now = await compareWithSnapshot(failures);

  // BR-29: legacy tickets have version 0, no Actions and no stored history.
  const nonZeroVersion = await scalar('SELECT count(*)::bigint AS value FROM "Ticket" WHERE "version" <> 0');
  if (nonZeroVersion !== 0) failures.push(`${nonZeroVersion} tickets have version <> 0`);

  const actions = await scalar('SELECT count(*)::bigint AS value FROM "TicketAction"');
  const history = await scalar('SELECT count(*)::bigint AS value FROM "TicketStatusChange"');
  if (actions !== 0) failures.push(`${actions} Actions exist straight after the migration`);
  if (history !== 0) failures.push(`${history} history rows exist straight after the migration`);

  const checks = await scalar(
    `SELECT count(*)::bigint AS value FROM information_schema.table_constraints WHERE table_name = 'TicketAction' AND constraint_type = 'CHECK' AND constraint_name LIKE 'TicketAction_followUp_%'`
  );
  if (checks !== 2) failures.push(`Expected 2 follow-up CHECK constraints, found ${checks}`);

  console.log('After migration (Lab 4 schema):', { ...now, TicketAction: actions, TicketStatusChange: history });
  report('MIG-01', failures, 'Lab 1–3 counts, ticket statuses and foreign keys unchanged; every ticket version 0 with no Actions or history; both CHECK constraints present.');
}

async function afterRollback(): Promise<void> {
  const failures: string[] = [];
  const now = await compareWithSnapshot(failures);

  for (const table of ['TicketAction', 'TicketStatusChange']) {
    if (await tableExists(table)) failures.push(`${table} still exists after the rollback`);
  }
  if (await columnExists('Ticket', 'version')) failures.push('Ticket.version still exists after the rollback');

  const recorded = await scalar(
    `SELECT count(*)::bigint AS value FROM "_prisma_migrations" WHERE "migration_name" = '20261003000000_lab04_actions_taken'`
  );
  if (recorded !== 0) failures.push('The Lab 4 migration is still recorded in _prisma_migrations');

  console.log('After rollback (Lab 3 schema):', now);
  report('MIG-02', failures, 'Lab 4 tables, column and migration record removed; Lab 1–3 counts, statuses and foreign keys unchanged.');
}

const phases: Record<string, () => Promise<void>> = { before, after, 'after-rollback': afterRollback };
const phase = phases[process.argv[2] ?? ''];

(phase ? phase() : Promise.reject(new Error('Usage: verify-lab04-migration.ts <before|after|after-rollback>')))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
