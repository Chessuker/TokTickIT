import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_URL } from '../api'
import { useRequester } from '../context/requester'
import { useMediaQuery } from '../useMediaQuery'

/**
 * My Tickets list (ui-spec.md §3.3, api-spec.md §3.5 — FR-03, AC-04, AC-10, AC-15).
 *
 * Three rules shape this component:
 *
 * 1. Ownership is the server's job (BR-04). Nothing here filters by requester;
 *    the id travels in `X-Requester-Id` and the endpoint answers with that
 *    requester's tickets only. The component simply renders what it is given.
 * 2. Every control maps to a query parameter and the server does the work
 *    (AC-10). Searching, filtering, sorting and paging all re-fetch rather than
 *    slicing a cached array, so what is on screen always describes the whole
 *    result set, not just the page that happened to be loaded.
 * 3. Two different zero-result cases (AC-15). "You have no tickets" and "your
 *    search matched nothing" are distinct panels with distinct calls to action,
 *    decided from `totalItems` plus whether a filter is active.
 *
 * BR-13 is handled above this component: AppShell keys the routed subtree by
 * the requester id, so a requester switch unmounts and remounts this list with
 * empty state. The stale-response guard below covers the narrower race where a
 * request issued for the old requester lands after the switch.
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

/** Only `New` exists this sprint (X-04); the dropdown grows with the enum. */
const STATUSES = ['New'] as const

const SORT_CHOICES = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'ticketNumber:desc', label: 'Ticket No. (high to low)' },
  { value: 'ticketNumber:asc', label: 'Ticket No. (low to high)' },
  { value: 'priority:desc', label: 'Priority (High first)' },
  { value: 'priority:asc', label: 'Priority (Low first)' },
] as const

const PAGE_SIZES = [10, 20, 50] as const

const DEFAULT_FILTERS = {
  search: '',
  category: '',
  status: '',
  sort: 'createdAt:desc',
}

/** How long the search box waits after the last keystroke before re-fetching. */
const SEARCH_DEBOUNCE_MS = 300

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`zg-badge zg-badge-status-${status.toLowerCase()}`}>{status}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`zg-badge zg-badge-priority-${priority.toLowerCase()}`}>{priority}</span>
}

/**
 * IT Priority and Ticket Owner are triage fields owned by the IT side of the
 * workflow, which is not in the Lab 2 schema — the requester-facing sprint
 * stops at the requested priority. The columns are rendered now, as Issue #5
 * asks, with an explicit "not yet assigned" placeholder rather than a blank
 * cell, so "no value yet" cannot be misread as missing data.
 */
function NotAssigned({ label }: { label: string }) {
  return (
    <span className="zg-not-assigned" title={`${label} is assigned during IT triage`}>
      Unassigned
    </span>
  )
}

function MyTickets() {
  const { requester } = useRequester()
  const isMobile = useMediaQuery('(max-width: 767.98px)')

  // `searchInput` is what the user is typing; `filters.search` is what has been
  // sent to the server. Keeping them apart is what makes the debounce possible
  // without the input feeling laggy.
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])

  const [tickets, setTickets] = useState<TicketListItem[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Option[]>([])

  /** Bumped by the Retry control so a failed load can be repeated unchanged. */
  const [reloadToken, setReloadToken] = useState(0)

  const requesterId = requester?.id ?? ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }))
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchInput])

  // Any change to what is being asked for sends the reader back to page 1.
  // Staying on page 4 of a narrower result set is how a filter comes to look
  // like it matched nothing when it actually matched plenty.
  useEffect(() => {
    setPage(1)
  }, [filters.search, filters.category, filters.status, filters.sort, pageSize])

  useEffect(() => {
    let cancelled = false

    fetch(`${API_URL}/api/categories`)
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

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.category) params.set('category', filters.category)
    if (filters.status) params.set('status', filters.status)
    params.set('sort', filters.sort)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setLoading(true)
    setError(null)

    fetch(`${API_URL}/api/tickets?${params.toString()}`, {
      // Requester context travels in the header, never in the query string
      // (api-spec.md §1.1), so the server owns the ownership check.
      headers: { 'X-Requester-Id': requesterId },
    })
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
  }, [requesterId, filters.search, filters.category, filters.status, filters.sort, page, pageSize, reloadToken])

  const hasActiveFilters = Boolean(filters.search || filters.category || filters.status)

  const clearFilters = useCallback(() => {
    setSearchInput('')
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  const setFilter = (field: keyof typeof DEFAULT_FILTERS, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }))
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
            Tickets raised by {requester?.name ?? 'the selected requester'}.
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
            value={filters.category}
            onChange={(event) => setFilter('category', event.target.value)}
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
          <label className="zg-label" htmlFor="ticket-status">
            Status
          </label>
          <select
            id="ticket-status"
            className="zg-select"
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
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
            value={filters.sort}
            onChange={(event) => setFilter('sort', event.target.value)}
          >
            {SORT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>

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
            Showing {rangeStart}–{rangeEnd} of {totalItems} ticket{totalItems === 1 ? '' : 's'}
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
                        <dd>{formatDate(ticket.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Last Updated</dt>
                        <dd>{formatDate(ticket.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>IT Priority</dt>
                        <dd>
                          <NotAssigned label="IT Priority" />
                        </dd>
                      </div>
                      <div>
                        <dt>Ticket Owner</dt>
                        <dd>
                          <NotAssigned label="Ticket Owner" />
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
                  Tickets raised by the selected requester
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
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '15.5%' }} />
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
                      <td className="zg-cell-tight zg-cell-date">{formatDate(ticket.createdAt)}</td>
                      <td className="zg-cell-summary">{ticket.summary}</td>
                      <td>{ticket.category?.name ?? 'Uncategorised'}</td>
                      <td className="zg-cell-tight">
                        <PriorityBadge priority={ticket.priority} />
                      </td>
                      <td className="zg-cell-tight">
                        <NotAssigned label="IT Priority" />
                      </td>
                      <td className="zg-cell-tight">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="zg-cell-tight">
                        <NotAssigned label="Ticket Owner" />
                      </td>
                      <td className="zg-cell-tight zg-cell-date">{formatDate(ticket.updatedAt)}</td>
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
              onClick={() => setPage((current) => Math.max(1, current - 1))}
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
              onClick={() => setPage((current) => current + 1)}
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
                onChange={(event) => setPageSize(Number(event.target.value))}
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
