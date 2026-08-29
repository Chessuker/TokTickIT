/**
 * Query-string parsing for `GET /api/tickets` (api-spec.md §3.5).
 *
 * Pure and database-free so the rules can be unit-tested on their own, and so
 * the route is left with nothing to decide: by the time it runs, every value is
 * either a validated primitive or a `400 VALIDATION_FAILED` naming the exact
 * parameter that was wrong.
 *
 * An invalid parameter is never silently dropped. A dropped filter would show
 * the requester a result set that does not match the controls on screen, which
 * reads as a data bug rather than as a mistake in the request.
 *
 * Note what is *not* here: `requesterId`. Ownership comes from the resolved
 * `X-Requester-Id` and is applied by the route on top of whatever this returns
 * (BR-04), so no query parameter can widen the scope.
 */

export const TICKET_STATUSES = ['New'] as const;
export type TicketStatusValue = (typeof TICKET_STATUSES)[number];

export const SORT_OPTIONS = [
  'createdAt:desc',
  'createdAt:asc',
  'ticketNumber:desc',
  'ticketNumber:asc',
  'priority:desc',
  'priority:asc'
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = 'createdAt:desc';
export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;
export const SEARCH_MAX = 150;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TicketListQuery {
  /** Trimmed search term, or `null` when absent or empty after trimming. */
  search: string | null;
  categoryId: string | null;
  status: TicketStatusValue | null;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export interface TicketListQueryValidation {
  fieldErrors: Record<string, string>;
  /** Populated only when `fieldErrors` is empty. */
  query: TicketListQuery | null;
}

/**
 * Express parses `?page=1&page=2` into an array. Taking the last value would
 * make the effective filter depend on parameter order, so a repeated parameter
 * is rejected as malformed instead.
 */
function asSingleString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return null;
}

export function parseTicketListQuery(raw: unknown): TicketListQueryValidation {
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

  // --- status ---
  let status: TicketStatusValue | null = null;
  const rawStatus = asSingleString(input.status);
  if (rawStatus === null) {
    fieldErrors.status = 'status must be a single value.';
  } else if (rawStatus !== undefined && rawStatus.trim() !== '') {
    const trimmed = rawStatus.trim();
    if (!(TICKET_STATUSES as readonly string[]).includes(trimmed)) {
      fieldErrors.status = `status must be one of ${TICKET_STATUSES.join(', ')}.`;
    } else {
      status = trimmed as TicketStatusValue;
    }
  }

  // --- sort ---
  let sort: SortOption = DEFAULT_SORT;
  const rawSort = asSingleString(input.sort);
  if (rawSort === null) {
    fieldErrors.sort = 'sort must be a single value.';
  } else if (rawSort !== undefined && rawSort.trim() !== '') {
    const trimmed = rawSort.trim();
    if (!(SORT_OPTIONS as readonly string[]).includes(trimmed)) {
      fieldErrors.sort = `sort must be one of ${SORT_OPTIONS.join(', ')}.`;
    } else {
      sort = trimmed as SortOption;
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
  let pageSize: number = DEFAULT_PAGE_SIZE;
  const rawPageSize = asSingleString(input.pageSize);
  if (rawPageSize === null) {
    fieldErrors.pageSize = 'pageSize must be a single value.';
  } else if (rawPageSize !== undefined && rawPageSize.trim() !== '') {
    const parsed = toInteger(rawPageSize.trim());
    if (parsed === null || !(PAGE_SIZES as readonly number[]).includes(parsed)) {
      fieldErrors.pageSize = `pageSize must be one of ${PAGE_SIZES.join(', ')}.`;
    } else {
      pageSize = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, query: null };
  }

  return { fieldErrors, query: { search, categoryId, status, sort, page, pageSize } };
}

/** Strict integer parse: `"3.5"`, `"3abc"` and `""` are all rejected. */
function toInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Prisma `orderBy` for a validated sort option, always tie-broken by `id`
 * ascending so pagination is stable and no row can appear on two pages.
 *
 * `priority` sorts on the enum, whose declaration order is Low → Medium → High,
 * so `priority:desc` yields High → Medium → Low rather than the alphabetical
 * order a string column would give.
 */
export function toOrderBy(sort: SortOption): Array<Record<string, 'asc' | 'desc'>> {
  const [field, direction] = sort.split(':') as [string, 'asc' | 'desc'];
  return [{ [field]: direction }, { id: 'asc' }];
}
