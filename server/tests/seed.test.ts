import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { seed } from '../src/seed.js';
import {
  ADMINISTRATORS,
  CATEGORIES,
  IT_STAFF,
  RELATED_SYSTEMS,
  REQUESTERS,
  TICKETS,
  TICKET_COMMENTS,
  TICKET_INTERNAL_NOTES,
  USERS,
} from '../src/seedData.js';

type Row = Record<string, unknown>;

/**
 * Minimal in-memory stand-in for the Prisma client. It implements `upsert`
 * only, so a seed that reached for `create`, `createMany`, or `deleteMany`
 * would fail this suite instead of silently duplicating rows.
 */
function createFakeClient(uniqueFields: Record<string, string>) {
  const tables = new Map<string, Map<string, Row>>();
  const calls: string[] = [];

  const delegate = (model: string) => {
    const uniqueField = uniqueFields[model];
    const rows = new Map<string, Row>();
    tables.set(model, rows);

    return {
      upsert: async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
        calls.push(`${model}.upsert`);
        const key = String(where[uniqueField]);
        const existing = rows.get(key);
        // Like the real client, a created row gets an id and the row is returned,
        // which is what the seed relies on to wire tickets to users and categories.
        const row = existing ? { ...existing, ...update } : { id: `${model}-${rows.size + 1}`, ...create };
        rows.set(key, row);
        return row;
      },
    };
  };

  const client = {
    user: delegate('user'),
    category: delegate('category'),
    relatedSystem: delegate('relatedSystem'),
    ticket: delegate('ticket'),
    ticketComment: delegate('ticketComment'),
    ticketInternalNote: delegate('ticketInternalNote'),
  };

  return {
    client: client as unknown as typeof prisma,
    rows: (model: string) => [...(tables.get(model)?.values() ?? [])],
    count: (model: string) => tables.get(model)?.size ?? 0,
    calls,
  };
}

const UNIQUE_FIELDS = {
  user: 'email',
  category: 'name',
  relatedSystem: 'name',
  ticket: 'ticketNumber',
  ticketComment: 'id',
  ticketInternalNote: 'id',
};

/** A cheap, recognisable stand-in for bcrypt so the suite stays fast. */
const fakeHash = async (password: string) => `hashed(${password})`;

describe('seed', () => {
  let fake: ReturnType<typeof createFakeClient>;

  beforeEach(() => {
    fake = createFakeClient(UNIQUE_FIELDS);
  });

  /** UNIT-07 — AC-32, BR-29: the seed is idempotent and writes only through upserts. */
  it('creates every seeded row on a first run', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    expect(fake.count('category')).toBe(CATEGORIES.length);
    expect(fake.count('relatedSystem')).toBe(RELATED_SYSTEMS.length);
    expect(fake.count('user')).toBe(USERS.length);
    expect(fake.count('ticket')).toBe(TICKETS.length);
    expect(TICKETS).toHaveLength(24);
    expect(fake.count('ticketComment')).toBe(TICKET_COMMENTS.length);
    expect(fake.count('ticketInternalNote')).toBe(TICKET_INTERNAL_NOTES.length);
  });

  it('seeds 5 requesters, 4 IT Staff and 1 Administrator', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    const users = fake.rows('user');
    expect(users.filter((row) => row.role === 'Requester')).toHaveLength(5);
    expect(users.filter((row) => row.role === 'ITStaff')).toHaveLength(4);
    expect(users.filter((row) => row.role === 'Administrator')).toHaveLength(1);
    expect(REQUESTERS).toHaveLength(5);
    expect(IT_STAFF).toHaveLength(4);
    expect(ADMINISTRATORS).toHaveLength(1);
  });

  it('adds no rows when run a second and third time', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    const afterFirstRun = {
      user: fake.count('user'),
      category: fake.count('category'),
      relatedSystem: fake.count('relatedSystem'),
      ticket: fake.count('ticket'),
      ticketComment: fake.count('ticketComment'),
      ticketInternalNote: fake.count('ticketInternalNote'),
    };

    await expect(seed(fake.client, { hashPassword: fakeHash })).resolves.toBeUndefined();
    await expect(seed(fake.client, { hashPassword: fakeHash })).resolves.toBeUndefined();

    expect({
      user: fake.count('user'),
      category: fake.count('category'),
      relatedSystem: fake.count('relatedSystem'),
      ticket: fake.count('ticket'),
      ticketComment: fake.count('ticketComment'),
      ticketInternalNote: fake.count('ticketInternalNote'),
    }).toEqual(afterFirstRun);
  });

  it('writes only through upserts keyed on a unique column, touching the same keys each run', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    const firstRun = [...fake.calls];

    await seed(fake.client, { hashPassword: fakeHash });

    expect(fake.calls.every((call) => call.endsWith('.upsert'))).toBe(true);
    expect(firstRun).toHaveLength(
      CATEGORIES.length +
        RELATED_SYSTEMS.length +
        USERS.length +
        TICKETS.length +
        TICKET_COMMENTS.length +
        TICKET_INTERNAL_NOTES.length,
    );
    expect(fake.calls.slice(firstRun.length)).toEqual(firstRun);
  });

  it('leaves no duplicate unique keys behind after repeated runs', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    await seed(fake.client, { hashPassword: fakeHash });

    const emails = fake.rows('user').map((row) => row.email);
    const categoryNames = fake.rows('category').map((row) => row.name);
    const systemNames = fake.rows('relatedSystem').map((row) => row.name);
    const ticketNumbers = fake.rows('ticket').map((row) => row.ticketNumber);
    const threadIds = [...fake.rows('ticketComment'), ...fake.rows('ticketInternalNote')].map((row) => row.id);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(categoryNames).size).toBe(categoryNames.length);
    expect(new Set(systemNames).size).toBe(systemNames.length);
    expect(new Set(ticketNumbers).size).toBe(ticketNumbers.length);
    expect(new Set(threadIds).size).toBe(threadIds.length);
  });

  /** FR-14, BR-09: credentials are hashed before they are written, never stored as typed. */
  it('stores a hash for every user and never the plain password', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    for (const row of fake.rows('user')) {
      const source = USERS.find((user) => user.email === row.email);
      expect(source).toBeDefined();
      expect(row.passwordHash).toBe(`hashed(${source?.password})`);
      expect(row).not.toHaveProperty('password');
    }
  });

  it('writes the hash on re-runs too, so a migrated row with an empty hash becomes usable (AD-13)', async () => {
    // Simulate the migration's output: the Lab 2 requester exists with no hash.
    await fake.client.user.upsert({
      where: { email: 'sarah.johnson@kmutt.ac.th' },
      update: {},
      create: { email: 'sarah.johnson@kmutt.ac.th', name: 'Sarah Johnson', role: 'Requester', passwordHash: '', mustChangePassword: true },
    } as never);

    await seed(fake.client, { hashPassword: fakeHash });

    const sarah = fake.rows('user').find((row) => row.email === 'sarah.johnson@kmutt.ac.th');
    expect(sarah?.passwordHash).toBe('hashed(Welcome123!)');
    expect(sarah?.mustChangePassword).toBe(true);
    expect(fake.count('user')).toBe(USERS.length);
  });

  /** Lab 3 specification.md §7 seed plan. */
  it('seeds the accounts the E2E suite relies on', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    const byEmail = Object.fromEntries(fake.rows('user').map((row) => [row.email, row]));

    // Jennifer can log straight in; Sarah is forced through Change Password.
    expect(byEmail['jennifer.anderson@kmutt.ac.th']).toMatchObject({ role: 'Requester', isActive: true, mustChangePassword: false });
    expect(byEmail['sarah.johnson@kmutt.ac.th']).toMatchObject({ role: 'Requester', isActive: true, mustChangePassword: true });
    // Alex is the inactive Requester, Robert the inactive IT Staff.
    expect(byEmail['alex.smith@kmutt.ac.th']).toMatchObject({ role: 'Requester', isActive: false });
    expect(byEmail['robert.wilson@kmutt.ac.th']).toMatchObject({ role: 'ITStaff', isActive: false });
    // The Lab 1 admin email survives as the Administrator.
    expect(byEmail['admin@toktickit.xyz']).toMatchObject({ role: 'Administrator', isActive: true, mustChangePassword: false });
  });

  it('uses bcrypt by default, producing a hash that verifies the seeded password', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    await seed(fake.client);

    const admin = fake.rows('user').find((row) => row.email === 'admin@toktickit.xyz');
    expect(String(admin?.passwordHash)).toMatch(/^\$2[aby]\$10\$/);
    expect(bcrypt.compareSync('Admin1!pass', String(admin?.passwordHash))).toBe(true);
  }, 20_000);

  /** UNIT-03 (Lab 2) — FR-08: the seed contains the data the lab sheet requires. */
  it('seeds the four required categories', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    expect(fake.rows('category').map((row) => row.name).sort()).toEqual(
      ['Account and Access', 'Hardware', 'Network', 'Software']
    );
  });

  it('seeds at least six related systems', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    expect(fake.count('relatedSystem')).toBeGreaterThanOrEqual(6);
  });

  it('seeds at least four active and at least one inactive requester', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    const requesters = fake.rows('user').filter((row) => row.role === 'Requester');
    expect(requesters.filter((row) => row.isActive === true).length).toBeGreaterThanOrEqual(4);
    expect(requesters.filter((row) => row.isActive === false).length).toBeGreaterThanOrEqual(1);
  });

  it('gives every user a unique, lower-cased email and a name', async () => {
    await seed(fake.client, { hashPassword: fakeHash });

    for (const row of fake.rows('user')) {
      expect(row.name).toBeTruthy();
      expect(String(row.email)).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(String(row.email)).toBe(String(row.email).toLowerCase());
    }
  });

  /** Lab 3 specification.md §7 "Tickets" — the queue's seed (Issue #39). */
  describe('tickets', () => {
    const STATUSES = ['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened', 'Resolved', 'Closed', 'Cancelled'];

    it('numbers every ticket in the reserved TKT-2026-9000xx range', () => {
      for (const ticket of TICKETS) {
        expect(ticket.ticketNumber).toMatch(/^TKT-2026-9000\d{2}$/);
      }
    });

    it('covers every status at least twice and every priority', () => {
      for (const status of STATUSES) {
        expect(TICKETS.filter((ticket) => ticket.status === status).length).toBeGreaterThanOrEqual(2);
      }
      for (const priority of ['Low', 'Medium', 'High']) {
        expect(TICKETS.some((ticket) => ticket.priority === priority)).toBe(true);
        expect(TICKETS.some((ticket) => ticket.itPriority === priority)).toBe(true);
      }
    });

    it('spreads the tickets over the four active requesters, about a third unassigned, the rest over active IT Staff', () => {
      const activeRequesters = REQUESTERS.filter((user) => user.isActive).map((user) => user.email);
      const activeStaff = IT_STAFF.filter((user) => user.isActive).map((user) => user.email);

      for (const ticket of TICKETS) {
        expect(activeRequesters).toContain(ticket.requesterEmail);
        if (ticket.ownerEmail !== null) expect(activeStaff).toContain(ticket.ownerEmail);
      }
      expect(new Set(TICKETS.map((ticket) => ticket.requesterEmail)).size).toBe(4);

      const unassigned = TICKETS.filter((ticket) => ticket.ownerEmail === null).length;
      expect(unassigned).toBeGreaterThanOrEqual(6);
      expect(unassigned).toBeLessThanOrEqual(10);
      for (const staff of activeStaff) {
        expect(TICKETS.some((ticket) => ticket.ownerEmail === staff)).toBe(true);
      }
    });

    it('writes the ids of the seeded users, categories and systems, never the names', async () => {
      await seed(fake.client, { hashPassword: fakeHash });

      const users = Object.fromEntries(fake.rows('user').map((row) => [row.email, row.id]));
      const categories = Object.fromEntries(fake.rows('category').map((row) => [row.name, row.id]));
      const rows = fake.rows('ticket');

      for (const [index, ticket] of TICKETS.entries()) {
        const row = rows[index];
        expect(row.ticketNumber).toBe(ticket.ticketNumber);
        expect(row.requesterId).toBe(users[ticket.requesterEmail]);
        expect(row.ownerId).toBe(ticket.ownerEmail ? users[ticket.ownerEmail] : null);
        expect(row.categoryId).toBe(categories[ticket.category]);
        expect(row).not.toHaveProperty('requesterEmail');
      }
    });

    it('stamps resolvedAt on Resolved and Closed tickets and closedAt on Closed ones (BR-20)', async () => {
      await seed(fake.client, { hashPassword: fakeHash });

      for (const row of fake.rows('ticket')) {
        const status = row.status as string;
        expect(row.resolvedAt instanceof Date).toBe(status === 'Resolved' || status === 'Closed');
        expect(row.closedAt instanceof Date).toBe(status === 'Closed');
        expect(row.createdAt).toBeInstanceOf(Date);
        expect(row.updatedAt).toBeInstanceOf(Date);
      }
    });
  });

  /** Lab 3 specification.md §7 "Public Comments" / "Internal Notes" (Issue #40). */
  describe('comments and internal notes', () => {
    it('puts about two comments on every non-New ticket and none on a New one', () => {
      const worked = TICKETS.filter((ticket) => ticket.status !== 'New');
      expect(TICKET_COMMENTS).toHaveLength(worked.length * 2);

      for (const ticket of TICKETS) {
        const thread = TICKET_COMMENTS.filter((comment) => comment.ticketNumber === ticket.ticketNumber);
        expect(thread).toHaveLength(ticket.status === 'New' ? 0 : 2);
      }
    });

    it('alternates requester and staff authors on each comment thread', () => {
      const staffEmails = IT_STAFF.map((user) => user.email);

      for (const ticket of TICKETS.filter((entry) => entry.status !== 'New')) {
        const thread = TICKET_COMMENTS.filter((comment) => comment.ticketNumber === ticket.ticketNumber);
        expect(thread[0].authorEmail).toBe(ticket.requesterEmail);
        expect(staffEmails).toContain(thread[1].authorEmail);
        if (ticket.ownerEmail) expect(thread[1].authorEmail).toBe(ticket.ownerEmail);
      }
    });

    it('puts one or two internal notes on worked tickets only, authored by IT Staff', () => {
      const workedStatuses = ['InProgress', 'WaitingForRequester', 'Resolved'];
      const staffEmails = IT_STAFF.map((user) => user.email);

      for (const ticket of TICKETS) {
        const notes = TICKET_INTERNAL_NOTES.filter((note) => note.ticketNumber === ticket.ticketNumber);
        if (!workedStatuses.includes(ticket.status)) {
          expect(notes).toHaveLength(0);
          continue;
        }
        expect(notes.length).toBeGreaterThanOrEqual(1);
        expect(notes.length).toBeLessThanOrEqual(2);
        for (const note of notes) expect(staffEmails).toContain(note.authorEmail);
      }
    });

    it('gives every entry a stable id, a body within BR-22 and a time after its ticket', () => {
      const ticketsByNumber = Object.fromEntries(TICKETS.map((ticket) => [ticket.ticketNumber, ticket]));

      for (const entry of [...TICKET_COMMENTS, ...TICKET_INTERNAL_NOTES]) {
        expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[cn][0-9]{11}$/);
        expect(entry.body.trim().length).toBeGreaterThan(0);
        expect(entry.body.length).toBeLessThanOrEqual(2000);
        expect(new Date(entry.createdAt).getTime()).toBeGreaterThan(
          new Date(ticketsByNumber[entry.ticketNumber].createdAt).getTime(),
        );
      }
    });

    it('writes ticket and author ids, keyed on the seeded id', async () => {
      await seed(fake.client, { hashPassword: fakeHash });

      const tickets = Object.fromEntries(fake.rows('ticket').map((row) => [row.ticketNumber, row.id]));
      const users = Object.fromEntries(fake.rows('user').map((row) => [row.email, row.id]));

      for (const [index, comment] of TICKET_COMMENTS.entries()) {
        const row = fake.rows('ticketComment')[index];
        expect(row.id).toBe(comment.id);
        expect(row.ticketId).toBe(tickets[comment.ticketNumber]);
        expect(row.authorId).toBe(users[comment.authorEmail]);
        expect(row.createdAt).toBeInstanceOf(Date);
        expect(row).not.toHaveProperty('authorEmail');
      }
      for (const [index, note] of TICKET_INTERNAL_NOTES.entries()) {
        const row = fake.rows('ticketInternalNote')[index];
        expect(row.id).toBe(note.id);
        expect(row.ticketId).toBe(tickets[note.ticketNumber]);
        expect(row.authorId).toBe(users[note.authorEmail]);
      }
    });

    it('never puts a note body into the comment table (AD-03)', async () => {
      await seed(fake.client, { hashPassword: fakeHash });

      const commentBodies = fake.rows('ticketComment').map((row) => row.body);
      for (const note of TICKET_INTERNAL_NOTES) {
        expect(commentBodies).not.toContain(note.body);
      }
    });
  });
});

