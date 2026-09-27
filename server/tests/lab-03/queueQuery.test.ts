import { describe, it, expect } from 'vitest';
import {
  QUEUE_DEFAULT_PAGE_SIZE,
  QUEUE_DEFAULT_SORT,
  QUEUE_PAGE_SIZES,
  QUEUE_SORT_OPTIONS,
  parseQueueQuery,
  toQueueOrderBy
} from '../../src/queueQuery.js';
import { TICKET_STATUSES } from '../../src/ticketListQuery.js';

/**
 * UNIT-04 — AC-17, AD-10: the queue query parser on its own, with no route
 * and no database. Every branch answers either a fully typed query or a
 * `fieldErrors` entry naming the parameter.
 */

const STAFF_ID = '22222222-2222-4333-8444-555555555555';
const CATEGORY_ID = 'a1b2c3d4-1111-4222-8333-444455556666';

describe('parseQueueQuery — defaults (AD-10)', () => {
  it('answers the documented defaults for an empty query', () => {
    const { fieldErrors, query } = parseQueueQuery({});

    expect(fieldErrors).toEqual({});
    expect(query).toEqual({
      search: null,
      statuses: [],
      itPriority: null,
      owner: null,
      categoryId: null,
      sort: QUEUE_DEFAULT_SORT,
      page: 1,
      pageSize: QUEUE_DEFAULT_PAGE_SIZE
    });
    expect(QUEUE_DEFAULT_SORT).toBe('updatedAt:desc');
    expect(QUEUE_DEFAULT_PAGE_SIZE).toBe(10);
    expect([...QUEUE_PAGE_SIZES]).toEqual([5, 10, 25, 50]);
  });

  it('treats a non-object as an empty query', () => {
    expect(parseQueueQuery(undefined).query?.page).toBe(1);
    expect(parseQueueQuery('nope').query?.pageSize).toBe(10);
  });
});

describe('parseQueueQuery — search', () => {
  it('trims and keeps a term; an all-whitespace term is absent', () => {
    expect(parseQueueQuery({ search: '  TKT-2026 ' }).query?.search).toBe('TKT-2026');
    expect(parseQueueQuery({ search: '   ' }).query?.search).toBeNull();
  });

  it('rejects a term over 150 characters and a repeated parameter', () => {
    expect(parseQueueQuery({ search: 'x'.repeat(151) }).fieldErrors.search).toMatch(/150/);
    expect(parseQueueQuery({ search: ['a', 'b'] }).fieldErrors.search).toMatch(/single/);
  });
});

describe('parseQueueQuery — status (repeatable, OR)', () => {
  it('accepts one value, a repeated value and every workflow status', () => {
    expect(parseQueueQuery({ status: 'Open' }).query?.statuses).toEqual(['Open']);
    expect(parseQueueQuery({ status: ['Open', 'InProgress'] }).query?.statuses).toEqual(['Open', 'InProgress']);
    expect(parseQueueQuery({ status: [...TICKET_STATUSES] }).query?.statuses).toEqual([...TICKET_STATUSES]);
  });

  it('drops duplicates and blank entries', () => {
    expect(parseQueueQuery({ status: ['Open', 'Open', ''] }).query?.statuses).toEqual(['Open']);
  });

  it('rejects an unknown value even when others are valid', () => {
    const { fieldErrors, query } = parseQueueQuery({ status: ['Open', 'Done'] });
    expect(query).toBeNull();
    expect(fieldErrors.status).toMatch(/must be one of/);
  });
});

describe('parseQueueQuery — itPriority', () => {
  it.each(['Low', 'Medium', 'High'])('accepts %s', (value) => {
    expect(parseQueueQuery({ itPriority: value }).query?.itPriority).toBe(value);
  });

  it('rejects anything else', () => {
    expect(parseQueueQuery({ itPriority: 'Urgent' }).fieldErrors.itPriority).toMatch(/Low, Medium, High/);
    expect(parseQueueQuery({ itPriority: ['Low', 'High'] }).fieldErrors.itPriority).toMatch(/single/);
  });
});

describe('parseQueueQuery — owner', () => {
  it('classifies me, unassigned and an IT Staff id', () => {
    expect(parseQueueQuery({ owner: 'me' }).query?.owner).toEqual({ kind: 'me' });
    expect(parseQueueQuery({ owner: 'unassigned' }).query?.owner).toEqual({ kind: 'unassigned' });
    expect(parseQueueQuery({ owner: STAFF_ID }).query?.owner).toEqual({ kind: 'user', id: STAFF_ID });
  });

  it('rejects any other text', () => {
    expect(parseQueueQuery({ owner: 'priya' }).fieldErrors.owner).toMatch(/me.*unassigned.*IT Staff id/);
    expect(parseQueueQuery({ owner: 'ME' }).query).toBeNull();
  });
});

describe('parseQueueQuery — category', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(parseQueueQuery({ category: CATEGORY_ID }).query?.categoryId).toBe(CATEGORY_ID);
    expect(parseQueueQuery({ category: 'hardware' }).fieldErrors.category).toMatch(/valid category id/);
  });
});

describe('parseQueueQuery — sort', () => {
  it('accepts every documented option', () => {
    expect(QUEUE_SORT_OPTIONS).toHaveLength(10);
    for (const option of QUEUE_SORT_OPTIONS) {
      expect(parseQueueQuery({ sort: option }).query?.sort).toBe(option);
    }
  });

  it('rejects a Requester-list sort key and a bad direction', () => {
    expect(parseQueueQuery({ sort: 'priority:desc' }).fieldErrors.sort).toMatch(/must be one of/);
    expect(parseQueueQuery({ sort: 'updatedAt:down' }).fieldErrors.sort).toMatch(/must be one of/);
  });
});

describe('parseQueueQuery — page and pageSize', () => {
  it('accepts positive integers and the four page sizes', () => {
    expect(parseQueueQuery({ page: '3' }).query?.page).toBe(3);
    for (const size of QUEUE_PAGE_SIZES) {
      expect(parseQueueQuery({ pageSize: String(size) }).query?.pageSize).toBe(size);
    }
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejects page=%s', (value) => {
    expect(parseQueueQuery({ page: value }).fieldErrors.page).toMatch(/1 or more/);
  });

  it.each(['20', '3', '0', 'ten'])('rejects pageSize=%s', (value) => {
    expect(parseQueueQuery({ pageSize: value }).fieldErrors.pageSize).toMatch(/5, 10, 25, 50/);
  });
});

describe('parseQueueQuery — reports every bad parameter at once', () => {
  it('names each invalid parameter and returns no query', () => {
    const { fieldErrors, query } = parseQueueQuery({
      status: 'Nope',
      itPriority: 'Nope',
      owner: 'nope',
      sort: 'nope',
      page: '0',
      pageSize: '7'
    });

    expect(query).toBeNull();
    expect(Object.keys(fieldErrors).sort()).toEqual(['itPriority', 'owner', 'page', 'pageSize', 'sort', 'status']);
  });
});

describe('toQueueOrderBy', () => {
  it('orders by the field and tie-breaks on id ascending', () => {
    expect(toQueueOrderBy('updatedAt:desc')).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
    expect(toQueueOrderBy('ticketNumber:asc')).toEqual([{ ticketNumber: 'asc' }, { id: 'asc' }]);
  });

  it('sorts itPriority and status on the enum column (declaration order = workflow order)', () => {
    expect(toQueueOrderBy('itPriority:desc')).toEqual([{ itPriority: 'desc' }, { id: 'asc' }]);
    expect(toQueueOrderBy('status:asc')).toEqual([{ status: 'asc' }, { id: 'asc' }]);
    // The order the schema declares, which is what api-spec.md §3.9 promises.
    expect([...TICKET_STATUSES]).toEqual([
      'New',
      'Open',
      'InProgress',
      'WaitingForRequester',
      'Reopened',
      'Resolved',
      'Closed',
      'Cancelled'
    ]);
  });
});
