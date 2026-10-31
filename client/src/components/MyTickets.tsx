import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../apiClient'
import { useAuth } from '../context/auth'
import { useMediaQuery } from '../useMediaQuery'
import { STATUS_PRESENTATION } from '../ticketStatus'
import { ItPriorityBadge, OwnerName, PriorityBadge, StatusBadge } from './Badges'
import { formatBangkokDate } from './lab-04/dates'

/**
 * My Tickets list (ui-spec.md §3.3, api-spec.md §3.5 — FR-03, AC-04, AC-10, AC-15).
 *
 * Three rules shape this component:
 *
 * 1. Ownership is the server's job (BR-04). Nothing here filters by requester;
 *    the session cookie identifies the caller and the endpoint answers with
 *    that requester's tickets only. The component simply renders what it is
 *    given.
 * 2. Every control maps to a query parameter and the server does the work
 *    (AC-10). Searching, filtering, sorting and paging all re-fetch rather than
 *    slicing a cached array, so what is on screen always describes the whole
 *    result set, not just the page that happened to be loaded.
 * 3. Two different zero-result cases (AC-15). "You have no tickets" and "your
 *    search matched nothing" are distinct panels with distinct calls to action,
 *    decided from `totalItems` plus whether a filter is active.
 *
 * Lab 4 (ui-spec.md §3.7): the filters, sort and page live in the URL, as the
 * Queue's already do, so a dashboard card can open this list pre-filtered and
 * its total equals the card (AC-20). Status is a set of chips, because a card
 * such as "My open tickets" means five statuses at once.
 *
 * Identity changes are handled above this component: AppShell keys the routed
 * subtree by the user id, so a different sign-in unmounts and remounts this
 * list with empty state. The stale-response guard below covers the narrower
 * race where a request issued for the old filters lands after they change.
 */

interface Option {
  id: string
  name: string
}

export interface TicketListItem {
  id: string
  ticketNumber: string
  summary: string
  status: string
  priority: string
  itPriority: string
  owner: { id: string; name: string; role: string } | null
  requesterResolvedAt: string | null
  category: Option | null
  relatedSystem: Option | null
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

/** The eight statuses in workflow order, with the badge's spelling. */
const STATUS_OPTIONS = Object.entries(STATUS_PRESENTATION).map(([value, { label }]) => ({ value, label }))

const SORT_CHOICES = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'ticketNumber:desc', label: 'Ticket No. (high to low)' },
  { value: 'ticketNumber:asc', label: 'Ticket No. (low to high)' },
  { value: 'priority:desc', label: 'Priority (High first)' },
  { value: 'priority:asc', label: 'Priority (Low first)' },
] as const

const SORT_VALUES: readonly string[] = [...SORT_CHOICES.map((choice) => choice.value), 'updatedAt:asc']
const DEFAULT_SORT = 'createdAt:desc'
const PAGE_SIZES = [10, 20, 50] as const

/** What the URL asks for, with the defaults filled in. */
interface ListParams {
  search: string
  category: string
  statuses: string[]
  sort: string
  page: number
  pageSize: number
}

function readParams(params: URLSearchParams): ListParams {
  const page = Number(params.get('page') ?? '1')
  const pageSize = Number(params.get('pageSize') ?? String(PAGE_SIZES[0]))
  const sort = params.get('sort') ?? DEFAULT_SORT
  return {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    statuses: params.getAll('status').filter((status) => status in STATUS_PRESENTATION),
    sort: SORT_VALUES.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : PAGE_SIZES[0],
  }
}

/** Only what differs from the defaults is written to the URL. */
function toSearchParams(next: ListParams): URLSearchParams {
  const params = new URLSearchParams()
  if (next.search) params.set('search', next.search)
  if (next.category) params.set('category', next.category)
  for (const status of next.statuses) params.append('status', status)
  if (next.sort !== DEFAULT_SORT) params.set('sort', next.sort)
  if (next.page !== 1) params.set('page', String(next.page))
  if (next.pageSize !== PAGE_SIZES[0]) params.set('pageSize', String(next.pageSize))
  return params
}

/** How long the search box waits after the last keystroke before re-fetching. */
const SEARCH_DEBOUNCE_MS = 300

function MyTickets() {
  const { user } = useAuth()
  const isMobile = useMediaQuery('(max-width: 767.98px)')

  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => readParams(searchParams), [searchParams])
  const { page, pageSize } = params

  // `searchInput` is what the user is typing; `params.search` is what has been
  // sent to the server. Keeping them apart is what makes the debounce possible
  // without the input feeling laggy.
  const [searchInput, setSearchInput] = useState(params.search)

  const [tickets, setTickets] = useState<TicketListItem[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Option[]>([])

  /** Bumped by the Retry control so a failed load can be repeated unchanged. */
  const [reloadToken, setReloadToken] = useState(0)

  /**
   * Every change goes through the URL. Any change to what is being asked for
   * sends the reader back to page 1: staying on page 4 of a narrower result
   * set is how a filter comes to look like it matched nothing when it
   * actually matched plenty. Functional form, so two quick chip clicks both
   * build on the latest URL.
   */
  const update = useCallback(
    (patch: Partial<ListParams>) => {
      setSearchParams(
        (current) => {
          const next = { ...readParams(current), ...patch }
          if (!('page' in patch)) next.page = 1
          return toSearchParams(next)
        },
        { replace: !('page' in patch) },
      )
    },
    [setSearchParams],
  )

  const setPage = (next: number) => update({ page: next })

  useEffect(() => {
    if (searchInput === params.search) return
    const timer = window.setTimeout(() => update({ search: searchInput }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput, params.search, update])

  useEffect(() => {
    let cancelled = false

    apiFetch('/api/categories')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setCategories(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        // The category filter degrades to "All categories" rather than taking
        // the whole screen down with it; the ticket list is the point here.
        if (!cancelled) setCategories([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Guards against an out-of-order response: only the newest request may write
  // to state, so a slow answer for page 1 cannot overwrite a fast one for page 2.
  const requestIdRef = useRef(0)

  const queryString = searchParams.toString()

  useEffect(() => {
    // The API wants every value spelled out; the URL omits the defaults.
    const query = toSearchParams(readParams(new URLSearchParams(queryString)))
    query.set('sort', params.sort)
    query.set('page', String(page))
    query.set('pageSize', String(pageSize))

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setLoading(true)
    setError(null)

    // The caller is the session cookie, never a query parameter (Lab 3
    // api-spec.md §1.1), so the server owns the ownership check.
    apiFetch(`/api/tickets?${query.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (requestIdRef.current !== requestId) return

        if (!res.ok) {
          setTickets([])
          setPagination(null)
          setError(body?.error?.message ?? 'The ticket list could not be loaded.')
          return
        }

        setTickets(Array.isArray(body?.data) ? body.data : [])
        setPagination(body?.pagination ?? null)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setTickets([])
        setPagination(null)
        setError('Could not reach the server. Please check your connection and try again.')
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false)
      })
  }, [queryString, params.sort, page, pageSize, reloadToken])

  const hasActiveFilters = Boolean(params.search || params.category || params.statuses.length)

  const clearFilters = useCallback(() => {
    setSearchInput('')
    update({ search: '', category: '', statuses: [] })
  }, [update])

  const toggleStatus = (status: string) => {
    const statuses = params.statuses.includes(status)
      ? params.statuses.filter((value) => value !== status)
      : [...params.statuses, status]
    update({ statuses })
  }

  const totalItems = pagination?.totalItems ?? 0
  const totalPages = pagination?.totalPages ?? 0

  /**
   * A window of at most five page numbers around the current page, so a
   * requester with fifty pages does not get fifty buttons.
   */
  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return []
    const span = 5
    let start = Math.max(1, page - Math.floor(span / 2))
    const end = Math.min(totalPages, start + span - 1)
    start = Math.max(1, end - span + 1)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [page, totalPages])

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalItems)

  return (
    <section>
      <div className="zg-page-head">
        <div>
          <h1 className="zg-title">My Tickets</h1>
          <p className="zg-subtitle mb-0">
            Tickets raised by {user?.name ?? 'you'}.
          </p>
        </div>
        <Link className="zg-btn zg-btn-primary" to="/tickets/new">
          Create Ticket
        </Link>
      </div>

      <div className="zg-filter-bar" role="search">
        <div className="zg-filter zg-filter-search">
          <label className="zg-label" htmlFor="ticket-search">
            Search
          </label>
          <input
            id="ticket-search"
            type="search"
            className="zg-input"
            placeholder="Ticket number or summary"
            value={searchInput}
            maxLength={150}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="zg-filter">
          <label className="zg-label" htmlFor="ticket-category">
            Category
          </label>
          <select
            id="ticket-category"
            className="zg-select"
            value={params.category}
            onChange={(event) => update({ category: event.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="zg-filter">
          <label className="zg-label" htmlFor="ticket-sort">
            Sort by
          </label>
          <select
            id="ticket-sort"
            className="zg-select"
            value={params.sort}
            onChange={(event) => update({ sort: event.target.value })}
          >
            {SORT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
            {/* Reachable only from a link; shown so the select never lies about the order. */}
            {params.sort === 'updatedAt:asc' && <option value="updatedAt:asc">Least recently updated</option>}
          </select>
        </div>

        {/* Lab 4: several statuses at once, set from a dashboard link or by hand. */}
        <fieldset className="zg-filter zg-filter-wide">
          <legend className="zg-label">Status</legend>
          <div className="zg-chip-group" data-testid="status-chips">
            {STATUS_OPTIONS.map((status) => {
              const selected = params.statuses.includes(status.value)
              return (
                <button
                  key={status.value}
                  type="button"
                  className={selected ? 'zg-chip zg-chip-toggle is-selected' : 'zg-chip zg-chip-toggle'}
                  aria-pressed={selected}
                  onClick={() => toggleStatus(status.value)}
                >
                  {status.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="zg-filter zg-filter-action">
          <button
            type="button"
            className="zg-btn zg-btn-secondary"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="zg-callout zg-callout-error mb-3" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            {error}{' '}
            <button
              type="button"
              className="zg-link-button"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="zg-loading" role="status">
          <span className="zg-spinner" aria-hidden="true" />
          Loading tickets...
        </div>
      )}

      {!loading && !error && totalItems === 0 && !hasActiveFilters && (
        <div className="zg-card zg-state zg-state-empty" data-testid="empty-state">
          <span className="zg-state-icon" aria-hidden="true">
            🌱
          </span>
          <h2 className="zg-state-title">Welcome — you have no tickets yet</h2>
          <p className="zg-state-text">
            When you raise a request for the IT team it appears here, with its ticket number and
            current status.
          </p>
          <Link className="zg-btn zg-btn-primary" to="/tickets/new">
            Create your first ticket
          </Link>
        </div>
      )}

      {!loading && !error && totalItems === 0 && hasActiveFilters && (
        <div className="zg-state zg-state-no-results" data-testid="no-results-state" role="status">
          <span className="zg-state-icon" aria-hidden="true">
            🔍
          </span>
          <h2 className="zg-state-title">No tickets match your search</h2>
          <p className="zg-state-text">
            Nothing matches the current search and filters. Try a different term, or clear the
            filters to see all of your tickets again.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {!loading && !error && totalItems > 0 && (
        <>
          <p className="zg-result-count" role="status">
            Showing {rangeStart} to {rangeEnd} of {totalItems} ticket{totalItems === 1 ? '' : 's'}
          </p>

          {isMobile ? (
            <ul className="zg-ticket-cards">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link className="zg-ticket-card" to={`/tickets/${ticket.id}`}>
                    <div className="zg-ticket-card-top">
                      <span className="zg-ticket-number">{ticket.ticketNumber}</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="zg-ticket-card-summary">{ticket.summary}</p>
                    <div className="zg-ticket-card-badges">
                      <PriorityBadge priority={ticket.priority} />
                      <span className="zg-chip">{ticket.category?.name ?? 'Uncategorised'}</span>
                    </div>
                    <dl className="zg-ticket-card-meta">
                      <div>
                        <dt>Created</dt>
                        <dd>{formatBangkokDate(ticket.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Last Updated</dt>
                        <dd>{formatBangkokDate(ticket.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>IT Priority</dt>
                        <dd>
                          <ItPriorityBadge priority={ticket.itPriority ?? ticket.priority} />
                        </dd>
                      </div>
                      <div>
                        <dt>Ticket Owner</dt>
                        <dd>
                          <OwnerName owner={ticket.owner ?? null} />
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="zg-table-wrap">
              <table className="zg-table">
                <caption className="visually-hidden">
                  Tickets raised by you
                </caption>
                {/*
                 * Explicit widths with `table-layout: fixed` (see the
                 * stylesheet). Ten columns do not fit the page container under
                 * auto layout: the browser hands the widest cell whatever it
                 * asks for and pushes the last columns out of view. Fixed
                 * layout makes the budget explicit and keeps every column —
                 * including the Detail action — on screen at desktop width.
                 */}
                <colgroup>
                  <col style={{ width: '13.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '14.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Ticket No.</th>
                    <th scope="col">Created Date</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Category</th>
                    <th scope="col">Requested Priority</th>
                    <th scope="col">IT Priority</th>
                    <th scope="col">Current Status</th>
                    <th scope="col">Ticket Owner</th>
                    <th scope="col">Last Updated</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="zg-cell-tight">
                        <span className="zg-ticket-number">{ticket.ticketNumber}</span>
                      </td>
                      <td className="zg-cell-tight zg-cell-date">{formatBangkokDate(ticket.createdAt)}</td>
                      <td className="zg-cell-summary">{ticket.summary}</td>
                      <td>{ticket.category?.name ?? 'Uncategorised'}</td>
                      <td className="zg-cell-tight">
                        <PriorityBadge priority={ticket.priority} />
                      </td>
                      <td className="zg-cell-tight">
                        <ItPriorityBadge priority={ticket.itPriority ?? ticket.priority} />
                      </td>
                      <td className="zg-cell-tight">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="zg-cell-tight">
                        <OwnerName owner={ticket.owner ?? null} />
                      </td>
                      <td className="zg-cell-tight zg-cell-date">{formatBangkokDate(ticket.updatedAt)}</td>
                      <td className="zg-cell-tight">
                        <Link
                          className="zg-btn zg-btn-secondary zg-btn-sm"
                          to={`/tickets/${ticket.id}`}
                          aria-label={`Open ticket ${ticket.ticketNumber}`}
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="zg-pagination" aria-label="Ticket list pages">
            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={!pagination?.hasPreviousPage}
            >
              Previous
            </button>

            <ul className="zg-page-numbers">
              {pageNumbers.map((number) => (
                <li key={number}>
                  <button
                    type="button"
                    className={number === page ? 'zg-page-number is-current' : 'zg-page-number'}
                    aria-current={number === page ? 'page' : undefined}
                    aria-label={`Page ${number}`}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm"
              onClick={() => setPage(page + 1)}
              disabled={!pagination?.hasNextPage}
            >
              Next
            </button>

            <span className="zg-page-status">Page {page} of {Math.max(1, totalPages)}</span>

            <div className="zg-page-size">
              <label className="zg-label" htmlFor="ticket-page-size">
                Per page
              </label>
              <select
                id="ticket-page-size"
                className="zg-select"
                value={pageSize}
                onChange={(event) => update({ pageSize: Number(event.target.value) })}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </nav>
        </>
      )}
    </section>
  )
}

export default MyTickets
