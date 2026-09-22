/**
 * Query-string parsing for `GET /api/staff/tickets` (api-spec.md §3.9, AD-10).
 *
 * Same discipline as `ticketListQuery.ts`, which it reuses for the pieces the
 * two lists share: pure, database-free, and every invalid parameter answered
 * with a `400` naming it rather than silently dropped. The differences are
 * what an IT Staff queue needs and a Requester list does not: a repeatable
 * `status`, an `itPriority` filter, an `owner` filter that understands `me`
 * and `unassigned`, sorts on `updatedAt` / `itPriority` / `status`, and the
 * queue's own page sizes.
 *
 * `owner=me` is resolved by the route from the session user; this module only
 * classifies the value, so it never needs to know who is asking.
 */
import { SEARCH_MAX, TICKET_STATUSES } from './ticketListQuery.js';
import type { TicketStatusValue } from './ticketListQuery.js';

export const IT_PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type ItPriorityValue = (typeof IT_PRIORITIES)[number];

export const QUEUE_SORT_FIELDS = ['updatedAt', 'createdAt', 'ticketNumber', 'itPriority', 'status'] as const;
export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];

export const QUEUE_SORT_OPTIONS = QUEUE_SORT_FIELDS.flatMap((field) => [
  `${field}:desc` as const,
  `${field}:asc` as const
]);
export type QueueSortOption = (typeof QUEUE_SORT_OPTIONS)[number];

export const QUEUE_DEFAULT_SORT: QueueSortOption = 'updatedAt:desc';
export const QUEUE_PAGE_SIZES = [5, 10, 25, 50] as const;
export const QUEUE_DEFAULT_PAGE_SIZE = 10;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How the `owner` parameter was classified; `id` is set only for `kind: 'user'`. */
export type OwnerFilter = { kind: 'me' } | { kind: 'unassigned' } | { kind: 'user'; id: string };

export interface QueueQuery {
  search: string | null;
  /** Empty when absent: no status clause at all. */
  statuses: TicketStatusValue[];
  itPriority: ItPriorityValue | null;
  owner: OwnerFilter | null;
  categoryId: string | null;
  sort: QueueSortOption;
  page: number;
  pageSize: number;
}

export interface QueueQueryValidation {
  fieldErrors: Record<string, string>;
  query: QueueQuery | null;
}

function asSingleString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return null;
}

/** `status` may be repeated, so a string and an array of strings are both fine. */
function asStringList(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value as string[];
  return null;
}

function toInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseQueueQuery(raw: unknown): QueueQueryValidation {
  const fieldErrors: Record<string, string> = {};
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  // --- search ---
  let search: string | null = null;
  const rawSearch = asSingleString(input.search);
  if (rawSearch === null) {
    fieldErrors.search = 'search must be a single text value.';
  } else if (rawSearch !== undefined) {
    const trimmed = rawSearch.trim();
    if (trimmed.length > SEARCH_MAX) {
      fieldErrors.search = `search must be at most ${SEARCH_MAX} characters.`;
    } else if (trimmed.length > 0) {
      search = trimmed;
    }
  }

  // --- status (repeatable, OR) ---
  const statuses: TicketStatusValue[] = [];
  const rawStatuses = asStringList(input.status);
  if (rawStatuses === null) {
    fieldErrors.status = 'status must be a text value.';
  } else if (rawStatuses !== undefined) {
    for (const value of rawStatuses) {
      const trimmed = value.trim();
      if (trimmed === '') continue;
      if (!(TICKET_STATUSES as readonly string[]).includes(trimmed)) {
        fieldErrors.status = `status must be one of ${TICKET_STATUSES.join(', ')}.`;
        break;
      }
      if (!statuses.includes(trimmed as TicketStatusValue)) statuses.push(trimmed as TicketStatusValue);
    }
  }

  // --- itPriority ---
  let itPriority: ItPriorityValue | null = null;
  const rawPriority = asSingleString(input.itPriority);
  if (rawPriority === null) {
    fieldErrors.itPriority = 'itPriority must be a single value.';
  } else if (rawPriority !== undefined && rawPriority.trim() !== '') {
    const trimmed = rawPriority.trim();
    if (!(IT_PRIORITIES as readonly string[]).includes(trimmed)) {
      fieldErrors.itPriority = `itPriority must be one of ${IT_PRIORITIES.join(', ')}.`;
    } else {
      itPriority = trimmed as ItPriorityValue;
    }
  }

  // --- owner ---
  let owner: OwnerFilter | null = null;
  const rawOwner = asSingleString(input.owner);
  if (rawOwner === null) {
    fieldErrors.owner = 'owner must be a single value.';
  } else if (rawOwner !== undefined && rawOwner.trim() !== '') {
    const trimmed = rawOwner.trim();
    if (trimmed === 'me') {
      owner = { kind: 'me' };
    } else if (trimmed === 'unassigned') {
      owner = { kind: 'unassigned' };
    } else if (UUID_PATTERN.test(trimmed)) {
      owner = { kind: 'user', id: trimmed };
    } else {
      fieldErrors.owner = 'owner must be "me", "unassigned" or an IT Staff id.';
    }
  }

  // --- category ---
  let categoryId: string | null = null;
  const rawCategory = asSingleString(input.category);
  if (rawCategory === null) {
    fieldErrors.category = 'category must be a single value.';
  } else if (rawCategory !== undefined && rawCategory.trim() !== '') {
    const trimmed = rawCategory.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      fieldErrors.category = 'category must be a valid category id.';
    } else {
      categoryId = trimmed;
    }
  }

  // --- sort ---
  let sort: QueueSortOption = QUEUE_DEFAULT_SORT;
  const rawSort = asSingleString(input.sort);
  if (rawSort === null) {
    fieldErrors.sort = 'sort must be a single value.';
  } else if (rawSort !== undefined && rawSort.trim() !== '') {
    const trimmed = rawSort.trim();
    if (!(QUEUE_SORT_OPTIONS as readonly string[]).includes(trimmed)) {
      fieldErrors.sort = `sort must be one of ${QUEUE_SORT_OPTIONS.join(', ')}.`;
    } else {
      sort = trimmed as QueueSortOption;
    }
  }

  // --- page ---
  let page = 1;
  const rawPage = asSingleString(input.page);
  if (rawPage === null) {
    fieldErrors.page = 'page must be a single value.';
  } else if (rawPage !== undefined && rawPage.trim() !== '') {
    const parsed = toInteger(rawPage.trim());
    if (parsed === null || parsed < 1) {
      fieldErrors.page = 'page must be an integer of 1 or more.';
    } else {
      page = parsed;
    }
  }

  // --- pageSize ---
  let pageSize: number = QUEUE_DEFAULT_PAGE_SIZE;
  const rawPageSize = asSingleString(input.pageSize);
  if (rawPageSize === null) {
    fieldErrors.pageSize = 'pageSize must be a single value.';
  } else if (rawPageSize !== undefined && rawPageSize.trim() !== '') {
    const parsed = toInteger(rawPageSize.trim());
    if (parsed === null || !(QUEUE_PAGE_SIZES as readonly number[]).includes(parsed)) {
      fieldErrors.pageSize = `pageSize must be one of ${QUEUE_PAGE_SIZES.join(', ')}.`;
    } else {
      pageSize = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, query: null };
  }

  return {
    fieldErrors,
    query: { search, statuses, itPriority, owner, categoryId, sort, page, pageSize }
  };
}

/**
 * Prisma `orderBy` for a validated queue sort, tie-broken by `id` ascending.
 *
 * `itPriority` and `status` are enums, and Postgres orders an enum column by
 * its declaration order, so no CASE expression is needed: `TicketPriority`
 * is declared Low → Medium → High (`desc` = High first) and `TicketStatus` is
 * declared in workflow order — New, Open, InProgress, WaitingForRequester,
 * Reopened, Resolved, Closed, Cancelled (api-spec.md §3.9).
 */
export function toQueueOrderBy(sort: QueueSortOption): Array<Record<string, 'asc' | 'desc'>> {
  const [field, direction] = sort.split(':') as [QueueSortField, 'asc' | 'desc'];
  return [{ [field]: direction }, { id: 'asc' }];
}
