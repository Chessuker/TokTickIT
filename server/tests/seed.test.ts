import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { seed } from '../src/seed.js';
import { ADMIN_USER, CATEGORIES, RELATED_SYSTEMS, REQUESTERS } from '../src/seedData.js';

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
    requesterUser: delegate('requesterUser'),
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
  requesterUser: 'email',
};

describe('seed', () => {
  let fake: ReturnType<typeof createFakeClient>;

  beforeEach(() => {
    fake = createFakeClient(UNIQUE_FIELDS);
  });

  /** UNIT-02 — AC-13, BR-12: the seed is idempotent. */
  it('creates every seeded row on a first run', async () => {
    await seed(fake.client);

    expect(fake.count('user')).toBe(1);
    expect(fake.count('category')).toBe(CATEGORIES.length);
    expect(fake.count('relatedSystem')).toBe(RELATED_SYSTEMS.length);
    expect(fake.count('requesterUser')).toBe(REQUESTERS.length);
  });

  it('adds no rows when run a second and third time', async () => {
    await seed(fake.client);
    const afterFirstRun = {
      user: fake.count('user'),
      category: fake.count('category'),
      relatedSystem: fake.count('relatedSystem'),
      requesterUser: fake.count('requesterUser'),
    };

    await expect(seed(fake.client)).resolves.toBeUndefined();
    await expect(seed(fake.client)).resolves.toBeUndefined();

    expect({
      user: fake.count('user'),
      category: fake.count('category'),
      relatedSystem: fake.count('relatedSystem'),
      requesterUser: fake.count('requesterUser'),
    }).toEqual(afterFirstRun);
  });

  it('writes only through upserts keyed on a unique column', async () => {
    await seed(fake.client);

    expect(fake.calls.every((call) => call.endsWith('.upsert'))).toBe(true);
    expect(fake.calls).toHaveLength(
      1 + CATEGORIES.length + RELATED_SYSTEMS.length + REQUESTERS.length
    );
  });

  it('leaves no duplicate unique keys behind after repeated runs', async () => {
    await seed(fake.client);
    await seed(fake.client);

    const emails = fake.rows('requesterUser').map((row) => row.email);
    const categoryNames = fake.rows('category').map((row) => row.name);
    const systemNames = fake.rows('relatedSystem').map((row) => row.name);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(categoryNames).size).toBe(categoryNames.length);
    expect(new Set(systemNames).size).toBe(systemNames.length);
  });

  /** UNIT-03 — FR-08: the seed contains the data the lab sheet requires. */
  it('seeds the four required categories', async () => {
    await seed(fake.client);

    expect(fake.rows('category').map((row) => row.name).sort()).toEqual(
      ['Account and Access', 'Hardware', 'Network', 'Software']
    );
  });

  it('seeds at least six related systems', async () => {
    await seed(fake.client);

    expect(fake.count('relatedSystem')).toBeGreaterThanOrEqual(6);
  });

  it('seeds at least four active and at least one inactive requester', async () => {
    await seed(fake.client);

    const requesters = fake.rows('requesterUser');
    expect(requesters.filter((row) => row.isActive === true).length).toBeGreaterThanOrEqual(4);
    expect(requesters.filter((row) => row.isActive === false).length).toBeGreaterThanOrEqual(1);
  });

  it('gives every requester a unique email and a name', async () => {
    await seed(fake.client);

    for (const row of fake.rows('requesterUser')) {
      expect(row.name).toBeTruthy();
      expect(String(row.email)).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
  });

  it('keeps the admin user from Lab 1 without wiping the user table', async () => {
    await seed(fake.client);

    expect(fake.rows('user')).toEqual([expect.objectContaining({ email: ADMIN_USER.email })]);
  });
});
