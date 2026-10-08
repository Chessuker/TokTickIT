/**
 * Database-level checks that a mocked client cannot prove (tests.md §2
 * "Integration against PostgreSQL"):
 *
 *   INT-03 (Issue #53) — the follow-up CHECK constraints (BR-06, BR-07, DB-03)
 *            reject a half-filled or inconsistently closed follow-up, whatever
 *            code writes the row.
 *   INT-02 (Issue #55) — two concurrent status changes on one version: added
 *            with the workflow changes.
 *
 * Run against a migrated and seeded database:
 *   npx tsx scripts/verify-lab04-concurrency.ts
 *
 * Every probe runs inside a transaction that is always rolled back, so the
 * script leaves no row behind.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Sentinel thrown to roll a probe's transaction back after it succeeded. */
class Rollback extends Error {}

interface Probe {
  label: string;
  /** Column values for the INSERT, on top of the valid baseline. */
  overrides: Record<string, unknown>;
  shouldPass: boolean;
}

async function insertInRolledBackTransaction(values: Record<string, unknown>): Promise<'inserted' | 'rejected'> {
  try {
    await prisma.$transaction(async (tx) => {
      const columns = Object.keys(values);
      const placeholders = columns.map((column, index) =>
        column === 'followUpStatus' ? `$${index + 1}::"FollowUpStatus"` : `$${index + 1}`
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "TicketAction" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
        ...columns.map((column) => values[column])
      );
      throw new Rollback();
    });
  } catch (error) {
    if (error instanceof Rollback) return 'inserted';
    const message = String((error as Error).message);
    if (message.includes('TicketAction_followUp_')) return 'rejected';
    throw error;
  }
  return 'inserted';
}

async function int03(): Promise<string[]> {
  const ticket = await prisma.ticket.findFirst({ select: { id: true } });
  const staff = await prisma.user.findFirst({ where: { role: 'ITStaff', isActive: true }, select: { id: true } });
  if (!ticket || !staff) throw new Error('Seed the database first: INT-03 needs a ticket and an IT Staff user.');

  const now = new Date();
  const baseline = {
    id: '',
    ticketId: ticket.id,
    actionAt: now,
    description: 'INT-03 probe',
    result: 'INT-03 probe',
    performedById: staff.id,
    followUpRequired: false,
    updatedAt: now
  };
  const openFollowUp = { followUpRequired: true, followUpNote: 'n', followUpAssigneeId: staff.id, followUpStatus: 'Open' };

  const probes: Probe[] = [
    { label: 'no follow-up', overrides: {}, shouldPass: true },
    { label: 'complete open follow-up', overrides: openFollowUp, shouldPass: true },
    {
      label: 'completed follow-up with closer and time',
      overrides: { ...openFollowUp, followUpStatus: 'Completed', followUpClosedAt: now, followUpClosedById: staff.id },
      shouldPass: true
    },
    { label: 'required but no note', overrides: { ...openFollowUp, followUpNote: null }, shouldPass: false },
    { label: 'required but no assignee', overrides: { ...openFollowUp, followUpAssigneeId: null }, shouldPass: false },
    { label: 'required but no status', overrides: { ...openFollowUp, followUpStatus: null }, shouldPass: false },
    { label: 'not required but has a note', overrides: { followUpNote: 'stray' }, shouldPass: false },
    { label: 'not required but has a status', overrides: { followUpStatus: 'Open' }, shouldPass: false },
    { label: 'Completed without closer or time', overrides: { ...openFollowUp, followUpStatus: 'Completed' }, shouldPass: false },
    { label: 'Open but stamped closed', overrides: { ...openFollowUp, followUpClosedAt: now, followUpClosedById: staff.id }, shouldPass: false },
    { label: 'closed time without closer', overrides: { ...openFollowUp, followUpStatus: 'Cancelled', followUpClosedAt: now }, shouldPass: false },
    { label: 'no follow-up but stamped closed', overrides: { followUpClosedAt: now, followUpClosedById: staff.id }, shouldPass: false }
  ];

  const failures: string[] = [];
  for (const probe of probes) {
    const outcome = await insertInRolledBackTransaction({ ...baseline, id: randomUUID(), ...probe.overrides });
    const expected = probe.shouldPass ? 'inserted' : 'rejected';
    console.log(`  ${outcome === expected ? 'ok  ' : 'FAIL'} ${probe.label}: ${outcome}`);
    if (outcome !== expected) failures.push(`${probe.label}: expected ${expected}, got ${outcome}`);
  }
  return failures;
}

async function main() {
  console.log('INT-03 — follow-up CHECK constraints');
  const failures = await int03();

  const leftovers = await prisma.ticketAction.count({ where: { description: 'INT-03 probe' } });
  if (leftovers !== 0) failures.push(`${leftovers} probe rows were left behind`);

  if (failures.length > 0) {
    console.error('INT-03 FAILED:');
    for (const failure of failures) console.error(' -', failure);
    process.exitCode = 1;
  } else {
    console.log('INT-03 PASSED: 3 consistent rows accepted, 9 inconsistent rows rejected by PostgreSQL; nothing left behind.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
