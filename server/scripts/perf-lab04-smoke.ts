/**
 * PERF-01 (tests.md §2; AC-30): a smoke test, not a load test. Twenty
 * sequential requests each to both dashboards and to one Actions list, through
 * the real routes against the seeded PostgreSQL, measured end to end in this
 * process. Pass: p95 under 500 ms, and each dashboard body under 10 KB.
 *
 * Run against a migrated and seeded database:
 *   npx tsx scripts/perf-lab04-smoke.ts
 *
 * Read-only apart from two sessions it creates and deletes again.
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { app } from '../src/app.js';
import { SESSION_COOKIE, generateSessionToken, hashSessionToken, sessionExpiry } from '../src/session.js';

const prisma = new PrismaClient();
const RUNS = 20;
const P95_LIMIT_MS = 500;
const BODY_LIMIT_BYTES = 10 * 1024;

const tokens: string[] = [];

async function cookieFor(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  tokens.push(tokenHash);
  await prisma.session.create({ data: { tokenHash, userId: user.id, expiresAt: sessionExpiry() } });
  return `${SESSION_COOKIE}=${token}`;
}

/** The value below which 95 % of the samples fall (nearest-rank). */
function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

async function measure(label: string, path: string, cookie: string, checkSize: boolean) {
  const times: number[] = [];
  let bytes = 0;

  // One warm-up call, so the first sample is not paying for connection setup.
  await request(app).get(path).set('Cookie', cookie);

  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const res = await request(app).get(path).set('Cookie', cookie);
    times.push(performance.now() - started);
    if (res.status !== 200) throw new Error(`${path} answered ${res.status}`);
    bytes = Buffer.byteLength(res.text);
  }

  const value = p95(times);
  const fast = value < P95_LIMIT_MS;
  const small = !checkSize || bytes < BODY_LIMIT_BYTES;
  console.log(
    `  ${fast && small ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} p95 ${value.toFixed(1).padStart(6)} ms   ` +
      `median ${[...times].sort((a, b) => a - b)[RUNS / 2].toFixed(1).padStart(6)} ms   body ${(bytes / 1024).toFixed(1)} KB`
  );
  return fast && small;
}

async function main() {
  console.log(`PERF-01 — ${RUNS} sequential requests each (limit: p95 < ${P95_LIMIT_MS} ms, dashboard body < 10 KB)`);
  const jennifer = await cookieFor('jennifer.anderson@kmutt.ac.th');
  const priya = await cookieFor('priya.raman@kmutt.ac.th');

  try {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: 'TKT-2026-900007' }, select: { id: true } });
    const results = [
      await measure('GET /api/dashboard/requester', '/api/dashboard/requester', jennifer, true),
      await measure('GET /api/staff/dashboard', '/api/staff/dashboard', priya, true),
      await measure('GET …/TKT-2026-900007/actions', `/api/staff/tickets/${ticket.id}/actions`, priya, false)
    ];

    if (results.every(Boolean)) {
      console.log('PERF-01 PASSED');
    } else {
      console.error('PERF-01 FAILED');
      process.exitCode = 1;
    }
  } finally {
    await prisma.session.deleteMany({ where: { tokenHash: { in: tokens } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
