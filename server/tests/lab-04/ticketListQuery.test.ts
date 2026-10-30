import { describe, it, expect } from 'vitest';
import { parseTicketListQuery, ticketListWhere, toOrderBy } from '../../src/ticketListQuery.js';

/**
 * UNIT-06 — the Requester list parser's Lab 4 additions (api-spec.md §4.4,
 * AC-20): a repeatable `status`, and `updatedAt` sorting for the dashboard's
 * "View all".
 */

const ME = '6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2';

describe('status (repeatable, OR)', () => {
  it('a single value behaves exactly as in Lab 2', () => {
    const { query } = parseTicketListQuery({ status: 'Resolved' });
    expect(query?.statuses).toEqual(['Resolved']);
    expect(ticketListWhere(query!, ME)).toEqual({ requesterId: ME, status: 'Resolved' });
  });

  it('several values become one `in`, in the order given, without duplicates', () => {
    const { query } = parseTicketListQuery({ status: ['Open', 'New', 'Open', ' '] });
    expect(query?.statuses).toEqual(['Open', 'New']);
    expect(ticketListWhere(query!, ME)).toEqual({ requesterId: ME, status: { in: ['Open', 'New'] } });
  });

  it('absent or empty means no status clause', () => {
    expect(parseTicketListQuery({}).query?.statuses).toEqual([]);
    expect(ticketListWhere(parseTicketListQuery({ status: '' }).query!, ME)).toEqual({ requesterId: ME });
  });

  it('refuses an unknown value, even next to valid ones, naming `status`', () => {
    for (const status of ['Done', ['Open', 'Done']]) {
      const { query, fieldErrors } = parseTicketListQuery({ status });
      expect(query).toBeNull();
      expect(fieldErrors.status).toMatch(/must be one of/);
    }
    expect(parseTicketListQuery({ status: { evil: 1 } }).fieldErrors).toHaveProperty('status');
  });
});

describe('ownership stays the session user (BR-23)', () => {
  it('a requesterId parameter is not read, so it cannot widen the scope', () => {
    const { query } = parseTicketListQuery({ requesterId: 'someone-else', status: 'Open' });
    expect(ticketListWhere(query!, ME)).toEqual({ requesterId: ME, status: 'Open' });
  });
});

describe('sort=updatedAt', () => {
  it.each([
    ['updatedAt:desc', [{ updatedAt: 'desc' }, { id: 'asc' }]],
    ['updatedAt:asc', [{ updatedAt: 'asc' }, { id: 'asc' }]]
  ] as const)('%s', (sort, orderBy) => {
    const { query, fieldErrors } = parseTicketListQuery({ sort });
    expect(fieldErrors).toEqual({});
    expect(toOrderBy(query!.sort)).toEqual(orderBy);
  });

  it('keeps createdAt:desc as the default', () => {
    expect(parseTicketListQuery({}).query?.sort).toBe('createdAt:desc');
  });
});
