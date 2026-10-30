/**
 * INT-01 (tests.md §2 "Integration against PostgreSQL"; AC-02, AC-19, AC-20,
 * BR-21): on the seeded database, call both dashboards through the real
 * routes as Jennifer, Ploy (no Tickets), Priya and the Administrator, and
 * compare every number with a hand-written SQL query that does not share any
 * code with the API. Then follow every card's `href` into its list and check
 * the list's total equals the card.
 *
 * Run against a migrated and seeded database:
 *   npx tsx scripts/verify-lab04-dashboards.ts
 *
 * Read-only apart from four sessions it creates and deletes again. The output
 * is the evidence for Answer Part 5.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { app } from '../src/app.js';
import { SESSION_COOKIE, generateSessionToken, hashSessionToken, sessionExpiry } from '../src/session.js';

const prisma = new PrismaClient();

const ACTIVE = `('New','Open','InProgress','WaitingForRequester','Reopened')`;

const LIST_VS_CARD: [string, string] = ['list', 'card'];

const failures: string[] = [];
const tokens: string[] = [];

async function sql(query: string, ...params: unknown[]): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(query, ...params);
  return Number(rows[0].n);
}

async function signedIn(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, name: true } });
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  tokens.push(tokenHash);
  await prisma.session.create({ data: { tokenHash, userId: user.id, expiresAt: sessionExpiry() } });
  return { ...user, cookie: `${SESSION_COOKIE}=${token}` };
}

function check(label: string, api: unknown, db: unknown, names: [string, string] = ['API', 'SQL']) {
  const ok = api === db;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${names[0]} ${String(api).padStart(3)}   ${names[1]} ${String(db).padStart(3)}`
  );
  if (!ok) failures.push(`${label}: ${names[0]} ${String(api)} ≠ ${names[1]} ${String(db)}`);
}

/** Follows a card into the list it opens and returns that list's total (AC-20). */
async function drillDownTotal(cookie: string, href: string): Promise<number> {
  const api = href.startsWith('/staff/queue') ? href.replace('/staff/queue', '/api/staff/tickets') : `/api${href}`;
  const res = await request(app).get(api).set('Cookie', cookie);
  if (res.status !== 200) throw new Error(`${api} answered ${res.status}`);
  return res.body.pagination.totalItems as number;
}

async function requester(email: string) {
  const user = await signedIn(email);
  console.log(`\nRequester dashboard — ${user.name}`);
  const res = await request(app).get('/api/dashboard/requester').set('Cookie', user.cookie);
  const m = res.body.metrics;

  const mine = `FROM "Ticket" WHERE "requesterId" = $1`;
  check('open (active)', m.open.count, await sql(`SELECT count(*) n ${mine} AND status IN ${ACTIVE}`, user.id));
  check('waitingForMe', m.waitingForMe.count, await sql(`SELECT count(*) n ${mine} AND status = 'WaitingForRequester'`, user.id));
  check('resolved', m.resolved.count, await sql(`SELECT count(*) n ${mine} AND status = 'Resolved'`, user.id));
  check('closed', m.closed.count, await sql(`SELECT count(*) n ${mine} AND status = 'Closed'`, user.id));
  check('totalTickets', res.body.totalTickets, await sql(`SELECT count(*) n ${mine}`, user.id));

  const others = Object.values(res.body.lists as Record<string, { id: string }[]>).flat().map((row) => row.id);
  const foreign = others.length === 0 ? 0 : await sql(
    `SELECT count(*) n FROM "Ticket" WHERE id = ANY($1::text[]) AND "requesterId" <> $2`, others, user.id
  );
  check('list rows owned by someone else', foreign, 0);

  for (const key of ['open', 'waitingForMe', 'resolved', 'closed']) {
    check(`drill-down ${key} → My Tickets total`, await drillDownTotal(user.cookie, m[key].href), m[key].count, LIST_VS_CARD);
  }
}

async function staff(email: string) {
  const user = await signedIn(email);
  console.log(`\nStaff dashboard — ${user.name}`);
  const res = await request(app).get('/api/staff/dashboard').set('Cookie', user.cookie);
  const { metrics: m, users, viewer } = res.body;

  check('unassigned', m.unassigned.count, await sql(`SELECT count(*) n FROM "Ticket" WHERE "ownerId" IS NULL AND status IN ${ACTIVE}`));
  check(
    'requesterReportsResolved',
    m.requesterReportsResolved.count,
    await sql(`SELECT count(*) n FROM "Ticket" WHERE "requesterResolvedAt" IS NOT NULL AND status IN ${ACTIVE}`)
  );
  for (const [status, card] of Object.entries(m.byStatus as Record<string, { count: number }>)) {
    check(`byStatus.${status}`, card.count, await sql(`SELECT count(*) n FROM "Ticket" WHERE status = $1::"TicketStatus"`, status));
  }
  for (const [priority, card] of Object.entries(m.byItPriority as Record<string, { count: number }>)) {
    check(
      `byItPriority.${priority}`,
      card.count,
      await sql(`SELECT count(*) n FROM "Ticket" WHERE "itPriority" = $1::"TicketPriority" AND status IN ${ACTIVE}`, priority)
    );
  }

  if (viewer === 'ITStaff') {
    check('mine', m.mine.count, await sql(`SELECT count(*) n FROM "Ticket" WHERE "ownerId" = $1 AND status IN ${ACTIVE}`, user.id));
    const openFollowUps = `FROM "TicketAction" a JOIN "Ticket" t ON t.id = a."ticketId"
      WHERE a."followUpAssigneeId" = $1 AND a."followUpStatus" = 'Open' AND t.status IN ${ACTIVE}`;
    check('myFollowUps (follow-ups)', m.myFollowUps.count, await sql(`SELECT count(*) n ${openFollowUps}`, user.id));
    check('myFollowUps.ticketCount', m.myFollowUps.ticketCount, await sql(`SELECT count(DISTINCT t.id) n ${openFollowUps}`, user.id));
    check('myRecentActions length', res.body.lists.myRecentActions.length, Math.min(5,
      await sql(`SELECT count(*) n FROM "TicketAction" WHERE "performedById" = $1`, user.id)));
  } else {
    check('mine is null', m.mine, null);
    check('myFollowUps is null', m.myFollowUps, null);
    for (const role of ['Requester', 'ITStaff', 'Administrator']) {
      check(`users.active.${role}`, users.activeByRole[role], await sql(
        `SELECT count(*) n FROM "User" WHERE role = $1::"Role" AND "isActive"`, role));
    }
    check('users.inactive', users.inactive, await sql(`SELECT count(*) n FROM "User" WHERE NOT "isActive"`));
  }

  const cards: [string, { count: number; href: string }][] = [
    ['unassigned', m.unassigned],
    ['requesterReportsResolved', m.requesterReportsResolved],
    ...Object.entries(m.byStatus as Record<string, { count: number; href: string }>).map(
      ([key, card]) => [`byStatus.${key}`, card] as [string, { count: number; href: string }]
    ),
    ...Object.entries(m.byItPriority as Record<string, { count: number; href: string }>).map(
      ([key, card]) => [`byItPriority.${key}`, card] as [string, { count: number; href: string }]
    )
  ];
  if (m.mine) cards.push(['mine', m.mine]);
  for (const [key, card] of cards) {
    check(`drill-down ${key} → Queue total`, await drillDownTotal(user.cookie, card.href), card.count, LIST_VS_CARD);
  }
  if (m.myFollowUps) {
    check('drill-down myFollowUps → Queue total', await drillDownTotal(user.cookie, m.myFollowUps.href), m.myFollowUps.ticketCount, LIST_VS_CARD);
  }
}

async function main() {
  console.log('INT-01 — dashboard numbers against raw SQL on the seeded database');
  try {
    await requester('jennifer.anderson@kmutt.ac.th');
    await requester('ploy.charoen@kmutt.ac.th');
    await staff('priya.raman@kmutt.ac.th');
    await staff('admin@toktickit.xyz');
  } finally {
    await prisma.session.deleteMany({ where: { tokenHash: { in: tokens } } });
  }

  if (failures.length > 0) {
    console.error(`\nINT-01 FAILED (${failures.length}):`);
    for (const failure of failures) console.error(' -', failure);
    process.exitCode = 1;
  } else {
    console.log('\nINT-01 PASSED: every dashboard number equals its SQL query, and every drill-down list total equals its card.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
