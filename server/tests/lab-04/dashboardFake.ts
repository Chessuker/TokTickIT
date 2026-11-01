import { vi } from 'vitest';

/**
 * An in-memory stand-in for the four Prisma delegates the dashboards and the
 * two lists read: it *evaluates* each `where`, `orderBy`, `take` and `skip`
 * against a fixture instead of returning canned numbers. That is what lets the
 * dashboard suites assert "the count equals the fixture" and "the list the
 * card opens has the card's total" (AC-19, AC-20) without a database; INT-01
 * repeats the comparison against PostgreSQL.
 *
 * It understands exactly the operators the dashboard and list filters use:
 * equality, `null`, `{ in }`, `{ not: null }`, `{ contains, mode }`, `AND`,
 * `OR`, the `actions: { some }` relation filter on a Ticket, and the
 * `ticket: {…}` relation filter on an Action. Anything else throws, so a
 * filter the fake cannot judge fails loudly instead of matching everything.
 */

export interface FakeTicket {
  id: string;
  ticketNumber: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  itPriority: string;
  requesterId: string;
  ownerId: string | null;
  categoryId: string | null;
  requesterResolvedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAction {
  id: string;
  ticketId: string;
  performedById: string;
  followUpAssigneeId: string | null;
  followUpStatus: string | null;
  description: string;
  actionAt: Date;
  createdAt: Date;
}

export interface FakeUser {
  id: string;
  role: string;
  isActive: boolean;
}

export interface Fixture {
  tickets: FakeTicket[];
  actions: FakeAction[];
  users: FakeUser[];
}

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

export function matches(row: Row, where: Where | undefined, fixture: Fixture): boolean {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(condition as Where[]).every((part) => matches(row, part, fixture))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(condition as Where[]).some((part) => matches(row, part, fixture))) return false;
      continue;
    }
    if (key === 'actions') {
      const some = (condition as { some: Where }).some;
      const held = fixture.actions.filter((action) => action.ticketId === row.id);
      if (!held.some((action) => matches(action as unknown as Row, some, fixture))) return false;
      continue;
    }
    if (key === 'ticket') {
      const ticket = fixture.tickets.find((candidate) => candidate.id === row.ticketId);
      if (!ticket || !matches(ticket as unknown as Row, condition as Where, fixture)) return false;
      continue;
    }

    const value = row[key];
    if (condition === null) {
      if (value !== null) return false;
      continue;
    }
    if (typeof condition === 'object' && !(condition instanceof Date)) {
      const operators = condition as Record<string, unknown>;
      for (const [operator, operand] of Object.entries(operators)) {
        if (operator === 'in') {
          if (!(operand as unknown[]).includes(value)) return false;
        } else if (operator === 'not' && operand === null) {
          if (value === null || value === undefined) return false;
        } else if (operator === 'contains') {
          const insensitive = operators.mode === 'insensitive';
          const haystack = String(value ?? '');
          const needle = String(operand);
          if (!(insensitive ? haystack.toLowerCase().includes(needle.toLowerCase()) : haystack.includes(needle))) {
            return false;
          }
        } else if (operator !== 'mode') {
          throw new Error(`dashboardFake: unsupported operator ${key}.${operator}`);
        }
      }
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}

type OrderBy = Record<string, 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls?: 'first' | 'last' }>;

function sortRows<T extends Row>(rows: T[], orderBy: OrderBy[] | undefined): T[] {
  if (!orderBy) return rows;
  return [...rows].sort((a, b) => {
    for (const entry of orderBy) {
      const [field, spec] = Object.entries(entry)[0];
      const direction = typeof spec === 'string' ? spec : spec.sort;
      const nulls = typeof spec === 'string' ? undefined : spec.nulls;
      const left = a[field] as Date | string | number | null;
      const right = b[field] as Date | string | number | null;
      if (left === right) continue;
      if (left === null || right === null) {
        const nullFirst = nulls === 'first' || (nulls === undefined && direction === 'desc');
        return (left === null) === nullFirst ? -1 : 1;
      }
      const order = left < right ? -1 : 1;
      return direction === 'asc' ? order : -order;
    }
    return 0;
  });
}

function pick(row: Row, select: Record<string, unknown> | undefined, fixture: Fixture): Row {
  if (!select) return row;
  const out: Row = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) out[key] = row[key];
    else if (key === 'ticket') {
      const ticket = fixture.tickets.find((candidate) => candidate.id === row.ticketId);
      out.ticket = pick(ticket as unknown as Row, (value as { select: Record<string, unknown> }).select, fixture);
    } else {
      // Relations the dashboards do not use (category, owner …) are left out.
      out[key] = null;
    }
  }
  return out;
}

interface FindArgs {
  where?: Where;
  orderBy?: OrderBy[];
  take?: number;
  skip?: number;
  select?: Record<string, unknown>;
}

function delegate<T extends Row>(rows: () => T[], fixture: Fixture) {
  return {
    count: (args: { where?: Where } = {}) =>
      Promise.resolve(rows().filter((row) => matches(row, args.where, fixture)).length),
    findMany: (args: FindArgs = {}) => {
      const found = sortRows(rows().filter((row) => matches(row, args.where, fixture)), args.orderBy);
      const start = args.skip ?? 0;
      const page = found.slice(start, args.take === undefined ? undefined : start + args.take);
      return Promise.resolve(page.map((row) => pick(row, args.select, fixture)));
    }
  };
}

/**
 * Points the mocked `prisma` delegates at `fixture`. `$transaction` with an
 * array resolves the promises in order, as Prisma's batch form does.
 */
export function useFixture(prisma: Record<string, unknown>, fixture: Fixture) {
  const tickets = delegate(() => fixture.tickets as unknown as Row[], fixture);
  const actions = delegate(() => fixture.actions as unknown as Row[], fixture);
  const users = delegate(() => fixture.users as unknown as Row[], fixture);

  const ticket = prisma.ticket as Record<string, ReturnType<typeof vi.fn>>;
  const ticketAction = prisma.ticketAction as Record<string, ReturnType<typeof vi.fn>>;
  const user = prisma.user as Record<string, ReturnType<typeof vi.fn>>;

  ticket.count.mockImplementation(tickets.count);
  ticket.findMany.mockImplementation(tickets.findMany);
  ticketAction.count.mockImplementation(actions.count);
  ticketAction.findMany.mockImplementation(actions.findMany);
  user.count.mockImplementation(users.count);
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation((operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : (operations as (tx: unknown) => unknown)(prisma)
  );
}

let sequence = 0;
const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 9, day, hour));

/** A Ticket with sensible defaults; `day` orders `updatedAt` / `createdAt`. */
export function ticket(overrides: Partial<FakeTicket> & { requesterId: string }, day = 1): FakeTicket {
  sequence += 1;
  const n = String(sequence).padStart(6, '0');
  return {
    id: `00000000-0000-4000-8000-${n.padStart(12, '0')}`,
    ticketNumber: `TKT-2026-${n}`,
    summary: `Ticket ${n}`,
    description: `A long private description of ticket ${n} that must never reach a dashboard.`,
    status: 'Open',
    priority: 'Medium',
    itPriority: 'Medium',
    ownerId: null,
    categoryId: null,
    requesterResolvedAt: null,
    resolvedAt: null,
    createdAt: at(day),
    updatedAt: at(day, 1),
    ...overrides
  };
}

export function action(overrides: Partial<FakeAction> & { ticketId: string; performedById: string }, day = 1): FakeAction {
  sequence += 1;
  return {
    id: `a0000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    followUpAssigneeId: null,
    followUpStatus: null,
    description: 'Checked the switch port.',
    actionAt: at(day),
    createdAt: at(day, 2),
    ...overrides
  };
}

export { at };
