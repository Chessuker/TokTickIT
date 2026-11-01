/**
 * Database-level checks that a mocked client cannot prove (tests.md §2
 * "Integration against PostgreSQL"):
 *
 *   INT-03 (Issue #53) — the follow-up CHECK constraints (BR-06, BR-07, DB-03)
 *            reject a half-filled or inconsistently closed follow-up, whatever
 *            code writes the row.
 *   INT-02 (Issue #55) — two status changes sent at the same moment through
 *            the real route, against the real database: exactly one applies,
 *            the other is refused, and exactly one history row is written
 *            (BR-18, BR-19, AC-17).
 *
 * Run against a migrated and seeded database:
 *   npx tsx scripts/verify-lab04-concurrency.ts
 *
 * INT-03 probes run inside a transaction that is always rolled back. INT-02
 * has to commit to prove anything, so it puts the ticket back afterwards
 * (status, version, updatedAt), removes the history rows and sessions it
 * created, and checks that nothing is left behind.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { app } from '../src/app.js';
import { SESSION_COOKIE, generateSessionToken, hashSessionToken, sessionExpiry } from '../src/session.js';

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

/** A live session for `userId`, as the login route would create it. */
async function sessionCookie(userId: string): Promise<{ cookie: string; tokenHash: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  await prisma.session.create({ data: { tokenHash, userId, expiresAt: sessionExpiry() } });
  return { cookie: `${SESSION_COOKIE}=${token}`, tokenHash };
}

async function int02(): Promise<string[]> {
  const ticket = await prisma.ticket.findFirst({
    where: { status: 'InProgress', ownerId: { not: null } },
    orderBy: { ticketNumber: 'asc' },
    select: { id: true, ticketNumber: true, status: true, version: true, updatedAt: true }
  });
  const staff = await prisma.user.findMany({
    where: { role: 'ITStaff', isActive: true },
    orderBy: { name: 'asc' },
    take: 2,
    select: { id: true, name: true }
  });
  if (!ticket || staff.length < 2) throw new Error('Seed the database first: INT-02 needs an owned In Progress ticket and two IT Staff.');

  const started = new Date();
  const sessions = await Promise.all(staff.map((user) => sessionCookie(user.id)));
  const failures: string[] = [];

  const race = async (label: string, body: Record<string, unknown>) => {
    const answers = await Promise.all(
      sessions.map(({ cookie }) =>
        request(app).patch(`/api/staff/tickets/${ticket.id}/status`).set('Cookie', cookie).send(body)
      )
    );
    const statuses = answers.map((answer) => answer.status).sort();
    const codes = answers.filter((answer) => answer.status !== 200).map((answer) => answer.body.error?.code);
    const rows = await prisma.ticketStatusChange.count({ where: { ticketId: ticket.id, createdAt: { gte: started } } });
    const ok = statuses[0] === 200 && statuses[1] === 409 && rows === 1;

    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: answers ${statuses.join(' + ')} (${codes.join(', ')}), history rows ${rows}`);
    if (!ok) failures.push(`${label}: expected 200 + 409 and 1 history row, got ${statuses.join(' + ')} and ${rows}`);
  };

  const restore = async () => {
    await prisma.ticketStatusChange.deleteMany({ where: { ticketId: ticket.id, createdAt: { gte: started } } });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: ticket.status, version: ticket.version, updatedAt: ticket.updatedAt }
    });
  };

  try {
    console.log(`  ticket ${ticket.ticketNumber} (version ${ticket.version}); ${staff[0].name} and ${staff[1].name} at once`);
    await race('same expectedVersion', { status: 'WaitingForRequester', expectedVersion: ticket.version });
    await restore();
    await race('no expectedVersion (Lab 3 client)', { status: 'WaitingForRequester' });
  } finally {
    await restore();
    await prisma.session.deleteMany({ where: { tokenHash: { in: sessions.map((session) => session.tokenHash) } } });
  }

  const after = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { status: true, version: true } });
  if (after?.status !== ticket.status || after?.version !== ticket.version) failures.push('the ticket was not put back');
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

  console.log('INT-02 — two simultaneous status changes');
  const raceFailures = await int02();
  if (raceFailures.length > 0) {
    console.error('INT-02 FAILED:');
    for (const failure of raceFailures) console.error(' -', failure);
    process.exitCode = 1;
  } else {
    console.log('INT-02 PASSED: each race applied exactly once with one history row; the ticket is back as it was.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
