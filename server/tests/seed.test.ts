import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { seed } from '../src/seed.js';
import { ADMINISTRATORS, CATEGORIES, IT_STAFF, RELATED_SYSTEMS, REQUESTERS, USERS } from '../src/seedData.js';

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
        const row = existing ? { ...existing, ...update } : { ...create };
        rows.set(key, row);
        return row;
      },
    };
  };

  const client = {
    user: delegate('user'),
    category: delegate('category'),
    relatedSystem: delegate('relatedSystem'),
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
    };

    await expect(seed(fake.client, { hashPassword: fakeHash })).resolves.toBeUndefined();
    await expect(seed(fake.client, { hashPassword: fakeHash })).resolves.toBeUndefined();

    expect({
      user: fake.count('user'),
      category: fake.count('category'),
      relatedSystem: fake.count('relatedSystem'),
    }).toEqual(afterFirstRun);
  });

  it('writes only through upserts keyed on a unique column, touching the same keys each run', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    const firstRun = [...fake.calls];

    await seed(fake.client, { hashPassword: fakeHash });

    expect(fake.calls.every((call) => call.endsWith('.upsert'))).toBe(true);
    expect(firstRun).toHaveLength(CATEGORIES.length + RELATED_SYSTEMS.length + USERS.length);
    expect(fake.calls.slice(firstRun.length)).toEqual(firstRun);
  });

  it('leaves no duplicate unique keys behind after repeated runs', async () => {
    await seed(fake.client, { hashPassword: fakeHash });
    await seed(fake.client, { hashPassword: fakeHash });

    const emails = fake.rows('user').map((row) => row.email);
    const categoryNames = fake.rows('category').map((row) => row.name);
    const systemNames = fake.rows('relatedSystem').map((row) => row.name);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(categoryNames).size).toBe(categoryNames.length);
    expect(new Set(systemNames).size).toBe(systemNames.length);
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
});
