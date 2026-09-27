import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../apiClient'
import { useAuth } from '../../context/auth'
import { useMediaQuery } from '../../useMediaQuery'
import { ItPriorityBadge, OwnerName, PriorityBadge, StatusBadge } from '../Badges'
import { Forbidden } from './RequireAuth'

/**
 * IT Staff Ticket Queue (ui-spec.md §3.4, api-spec.md §3.9 — FR-08, AD-10,
 * AC-16, AC-17, AC-33, AC-34).
 *
 * Three rules shape this screen:
 *
 * 1. The URL is the state. Search, filters, sort, page and page size live in
 *    the query string, so a reload, the browser's Back button and the detail
 *    screen's "Back to Queue" (ui-spec.md §3.5) all land on the same list the
 *    user left. Nothing is kept in component state that the server needs to
 *    know about.
 * 2. The server does the work (AC-17). Every control maps to a query
 *    parameter and re-fetches; the list on screen is never a client-side
 *    slice of a bigger array, so the result line always describes the whole
 *    result set.
 * 3. One layout at a time (AC-33). The table and the cards carry the same
 *    rows; rendering both and hiding one would double every ticket for
 *    assistive technology, so the media query decides which one exists.
 *
 * Administrators get the same screen; the difference (no mutations) lives on
 * the detail screen and in the API, not here.
 */

interface UserRef {
  id: string
  name: string
  role: string
}

export interface StaffTicketListItem {
  id: string
  ticketNumber: string
  summary: string
  status: string
  requestedPriority: string
  itPriority: string
  category: { id: string; name: string } | null
  requester: UserRef
  owner: UserRef | null
  requesterResolvedAt: string | null
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

interface Option {
  id: string
  name: string
}

/** The eight statuses in workflow order (api-spec.md §3.9), with their labels. */
const STATUS_OPTIONS = [
  { value: 'New', label: 'New' },
  { value: 'Open', label: 'Open' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'WaitingForRequester', label: 'Waiting for Requester' },
  { value: 'Reopened', label: 'Reopened' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Closed', label: 'Closed' },
  { value: 'Cancelled', label: 'Cancelled' },
] as const

const IT_PRIORITIES = ['Low', 'Medium', 'High'] as const

const SORT_CHOICES = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'updatedAt:asc', label: 'Least recently updated' },
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'ticketNumber:desc', label: 'Ticket No. (high to low)' },
  { value: 'ticketNumber:asc', label: 'Ticket No. (low to high)' },
  { value: 'itPriority:desc', label: 'IT Priority (High first)' },
  { value: 'itPriority:asc', label: 'IT Priority (Low first)' },
  { value: 'status:asc', label: 'Status (workflow order)' },
  { value: 'status:desc', label: 'Status (reverse)' },
] as const

const SORT_VALUES = SORT_CHOICES.map((choice) => choice.value) as readonly string[]

const PAGE_SIZES = [5, 10, 25, 50] as const
const DEFAULT_SORT = 'updatedAt:desc'
const DEFAULT_PAGE_SIZE = 10

/** How long the search box waits after the last keystroke before re-fetching. */
const SEARCH_DEBOUNCE_MS = 300

/** Columns whose header sorts the list, and the sort field each one drives. */
const SORTABLE: Record<string, string> = {
  ticketNumber: 'ticketNumber',
  createdAt: 'createdAt',
  itPriority: 'itPriority',
  status: 'status',
  updatedAt: 'updatedAt',
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

/** What the URL currently asks for, with the defaults filled in. */
interface QueueParams {
  search: string
  statuses: string[]
  itPriority: string
  owner: string
  category: string
  sort: string
  page: number
  pageSize: number
}

function readParams(params: URLSearchParams): QueueParams {
  const page = Number(params.get('page') ?? '1')
  const pageSize = Number(params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE))
  const sort = params.get('sort') ?? DEFAULT_SORT
  return {
    search: params.get('search') ?? '',
    statuses: params.getAll('status').filter(Boolean),
    itPriority: params.get('itPriority') ?? '',
    owner: params.get('owner') ?? '',
    category: params.get('category') ?? '',
    sort: SORT_VALUES.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  }
}

/** The query string sent to the API: only what differs from the defaults is written to the URL. */
function toSearchParams(next: QueueParams): URLSearchParams {
  const params = new URLSearchParams()
  if (next.search) params.set('search', next.search)
  for (const status of next.statuses) params.append('status', status)
  if (next.itPriority) params.set('itPriority', next.itPriority)
  if (next.owner) params.set('owner', next.owner)
  if (next.category) params.set('category', next.category)
  if (next.sort !== DEFAULT_SORT) params.set('sort', next.sort)
  if (next.page !== 1) params.set('page', String(next.page))
  if (next.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(next.pageSize))
  return params
}

function StaffTicketQueue() {
  const { user } = useAuth()
  const location = useLocation()
  const isMobile = useMediaQuery('(max-width: 767.98px)')
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => readParams(searchParams), [searchParams])
  const queryString = searchParams.toString()

  // What the user is typing, as opposed to what has been sent (in the URL).
  const [searchInput, setSearchInput] = useState(params.search)
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(params.statuses.length || params.itPriority || params.owner || params.category),
  )

  const [tickets, setTickets] = useState<StaffTicketListItem[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const [categories, setCategories] = useState<Option[]>([])
  const [assignees, setAssignees] = useState<Option[]>([])

  /**
   * Every change goes through here. A change to anything but the page itself
   * sends the reader back to page 1: staying on page 4 of a narrower result
   * set is how a filter comes to look like it matched nothing.
   */
  /**
   * The search this screen last wrote to the URL itself. The URL → input sync
   * below compares against it, so the screen's own writes never echo back
   * into the input — only a change from outside (Back, Forward, a shared link)
   * does.
   */
  const ownSearchRef = useRef(params.search)

  const update = useCallback(
    (patch: Partial<QueueParams>) => {
      if (patch.search !== undefined) ownSearchRef.current = patch.search
      // Functional form: two changes in the same tick (a fast double click on
      // two chips) both build on the latest URL rather than on a stale render.
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

  // Debounced search: the input updates immediately, the URL (and the fetch)
  // follow after a pause.
  useEffect(() => {
    if (searchInput === params.search) return
    const timer = window.setTimeout(() => update({ search: searchInput.trim() }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // `update` changes with params; re-arming the timer on that is intended.
  }, [searchInput, params.search, update])

  // Back/forward or a shared link changed the URL under the input: follow it.
  // The screen's own writes are skipped. Without that, the URL change from
  // "Clear filters" could land after the user had already typed a new term,
  // and this sync would wipe what they typed.
  useEffect(() => {
    if (params.search === ownSearchRef.current) return
    ownSearchRef.current = params.search
    setSearchInput(params.search)
  }, [params.search])

  useEffect(() => {
    let cancelled = false

    apiFetch('/api/categories')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setCategories(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })

    apiFetch('/api/staff/assignees')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setAssignees(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        // The owner filter degrades to Anyone / Me / Unassigned.
        if (!cancelled) setAssignees([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Only the newest request may write to state, so a slow answer for page 1
  // cannot overwrite a fast one for page 2.
  const requestIdRef = useRef(0)

  useEffect(() => {
    const query = new URLSearchParams(queryString)
    // The API wants every value spelled out; the URL omits the defaults.
    if (!query.has('sort')) query.set('sort', params.sort)
    if (!query.has('page')) query.set('page', String(params.page))
    if (!query.has('pageSize')) query.set('pageSize', String(params.pageSize))

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setLoading(true)
    setError(null)

    apiFetch(`/api/staff/tickets?${query.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (requestIdRef.current !== requestId) return

        if (res.status === 403) {
          setForbidden(true)
          return
        }

        if (!res.ok) {
          setTickets([])
          setPagination(null)
          const apiError = body?.error as { message?: string; fields?: Record<string, string> } | undefined
          const fieldMessage = apiError?.fields ? Object.values(apiError.fields)[0] : undefined
          setError(fieldMessage ?? apiError?.message ?? 'The ticket queue could not be loaded.')
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
  }, [queryString, params.sort, params.page, params.pageSize, reloadToken])

  const hasActiveFilters = Boolean(
    params.search || params.statuses.length || params.itPriority || params.owner || params.category,
  )

  const clearFilters = () => {
    setSearchInput('')
    update({ search: '', statuses: [], itPriority: '', owner: '', category: '' })
  }

  const toggleStatus = (status: string) => {
    const statuses = params.statuses.includes(status)
      ? params.statuses.filter((value) => value !== status)
      : [...params.statuses, status]
    update({ statuses })
  }

  const [sortField, sortDirection] = params.sort.split(':') as [string, 'asc' | 'desc']

  /** Clicking a sortable header: same column flips direction, a new column starts descending. */
  const sortBy = (field: string) => {
    const direction = sortField === field && sortDirection === 'desc' ? 'asc' : 'desc'
    update({ sort: `${field}:${direction}` })
  }

  const ariaSort = (field: string): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none'
    return sortDirection === 'asc' ? 'ascending' : 'descending'
  }

  const totalItems = pagination?.totalItems ?? 0
  const totalPages = pagination?.totalPages ?? 0

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return []
    const span = 5
    let start = Math.max(1, params.page - Math.floor(span / 2))
    const end = Math.min(totalPages, start + span - 1)
    start = Math.max(1, end - span + 1)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [params.page, totalPages])

  const rangeStart = totalItems === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const rangeEnd = Math.min(params.page * params.pageSize, totalItems)

  /** Where "Open" goes, remembering the query string so the detail can come back to it. */
  const detailLink = (ticket: StaffTicketListItem) => ({
    pathname: `/staff/tickets/${ticket.id}`,
  })
  const detailState = { queueSearch: location.search }

  if (forbidden && user) {
    return <Forbidden role={user.role} />
  }

  // A plain render function rather than a nested component: a component
  // defined inside the render would be a new type every render and remount
  // its button, dropping keyboard focus after each sort.
  const sortableHeader = (field: string, label: string) => (
    <th scope="col" aria-sort={ariaSort(field)}>
      <button type="button" className="zg-sort-button" onClick={() => sortBy(SORTABLE[field])}>
        {label}
        <i
          className={
            sortField === field
              ? sortDirection === 'asc'
                ? 'bi bi-sort-up zg-sort-icon is-active'
                : 'bi bi-sort-down zg-sort-icon is-active'
              : 'bi bi-arrow-down-up zg-sort-icon'
          }
          aria-hidden="true"
        />
      </button>
    </th>
  )

  return (
    <section>
      <div className="zg-page-head">
        <div>
          <h1 className="zg-title">Ticket Queue</h1>
          <p className="zg-subtitle mb-0">Every ticket in the system, across all requesters.</p>
        </div>
      </div>

      <div className="zg-queue-toolbar" role="search">
        <div className="zg-filter zg-filter-search">
          <label className="zg-label" htmlFor="queue-search">
            Search
          </label>
          <input
            id="queue-search"
            type="search"
            className="zg-input"
            placeholder="Search by ticket number or summary…"
            value={searchInput}
            maxLength={150}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="zg-filter">
          <label className="zg-label" htmlFor="queue-sort">
            Sort by
          </label>
          <select
            id="queue-sort"
            className="zg-select"
            value={params.sort}
            onChange={(event) => update({ sort: event.target.value })}
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
            className={filtersOpen ? 'zg-btn zg-btn-secondary is-active' : 'zg-btn zg-btn-secondary'}
            aria-expanded={filtersOpen}
            aria-controls="queue-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <i className="bi bi-funnel" aria-hidden="true" /> Filters
            {hasActiveFilters && <span className="zg-filter-dot" aria-label="filters active" />}
          </button>
          <button
            type="button"
            className="zg-btn zg-btn-secondary"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="zg-queue-filters" id="queue-filters">
          <fieldset className="zg-filter zg-filter-wide">
            <legend className="zg-label">Status</legend>
            <div className="zg-chip-group">
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

          <div className="zg-filter">
            <label className="zg-label" htmlFor="queue-it-priority">
              IT Priority
            </label>
            <select
              id="queue-it-priority"
              className="zg-select"
              value={params.itPriority}
              onChange={(event) => update({ itPriority: event.target.value })}
            >
              <option value="">Any priority</option>
              {IT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          <div className="zg-filter">
            <label className="zg-label" htmlFor="queue-owner">
              Owner
            </label>
            <select
              id="queue-owner"
              className="zg-select"
              value={params.owner}
              onChange={(event) => update({ owner: event.target.value })}
            >
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </div>

          <div className="zg-filter">
            <label className="zg-label" htmlFor="queue-category">
              Category
            </label>
            <select
              id="queue-category"
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
        </div>
      )}

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
        <div className="zg-card zg-skeleton-list" role="status" aria-label="Loading tickets" data-testid="queue-loading">
          <span className="visually-hidden">Loading tickets…</span>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="zg-skeleton-row" aria-hidden="true">
              <span className="zg-skeleton zg-skeleton-short" />
              <span className="zg-skeleton zg-skeleton-long" />
              <span className="zg-skeleton zg-skeleton-badge" />
              <span className="zg-skeleton zg-skeleton-badge" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && totalItems === 0 && !hasActiveFilters && (
        <div className="zg-card zg-state zg-state-empty" data-testid="empty-state">
          <span className="zg-state-icon" aria-hidden="true">
            <i className="bi bi-inbox" />
          </span>
          <h2 className="zg-state-title">No tickets in the system yet.</h2>
          <p className="zg-state-text">When a requester raises a ticket it appears here.</p>
        </div>
      )}

      {!loading && !error && totalItems === 0 && hasActiveFilters && (
        <div className="zg-state zg-state-no-results" data-testid="no-results-state" role="status">
          <span className="zg-state-icon" aria-hidden="true">
            <i className="bi bi-search" />
          </span>
          <h2 className="zg-state-title">No tickets match these filters</h2>
          <p className="zg-state-text">
            Nothing matches the current search and filters. Try a different term, or clear the
            filters to see the whole queue.
          </p>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {!loading && !error && totalItems > 0 && (
        <>
          <p className="zg-result-count" role="status">
            Showing {rangeStart} to {rangeEnd} of {totalItems} ticket{totalItems === 1 ? '' : 's'}
          </p>

          {isMobile ? (
            <ul className="zg-ticket-cards" data-testid="queue-cards">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link className="zg-ticket-card" to={detailLink(ticket)} state={detailState}>
                    <div className="zg-ticket-card-top">
                      <span className="zg-ticket-number">{ticket.ticketNumber}</span>
                      <span className="zg-status-cell">
                        {ticket.requesterResolvedAt && (
                          <i
                            className="bi bi-check-circle-fill zg-resolved-icon"
                            title="Requester reports resolved"
                            aria-label="Requester reports resolved"
                          />
                        )}
                        <StatusBadge status={ticket.status} />
                      </span>
                    </div>
                    <p className="zg-ticket-card-summary">{ticket.summary}</p>
                    <div className="zg-ticket-card-badges">
                      <ItPriorityBadge priority={ticket.itPriority} />
                      <span className="zg-owner-cell">
                        <OwnerName owner={ticket.owner} />
                        {ticket.owner && ticket.owner.id === user?.id && <span className="zg-you-tag">You</span>}
                      </span>
                    </div>
                    <dl className="zg-ticket-card-meta">
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDate(ticket.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatDate(ticket.updatedAt)}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="zg-table-wrap">
              <table className="zg-table zg-queue-table" data-testid="queue-table">
                <caption className="visually-hidden">Ticket queue</caption>
                {/*
                 * Fixed layout, so the widths are a budget that sums to 100 %
                 * of the 1066 px container (see the stylesheet). Status is the
                 * one badge column allowed to wrap: "Waiting for Requester"
                 * plus the resolved icon does not fit on one line at this
                 * width, and clipping a status is worse than a second line.
                 */}
                <colgroup>
                  <col style={{ width: '11.5%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '8.5%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {sortableHeader('ticketNumber', 'Ticket No.')}
                    {sortableHeader('createdAt', 'Created')}
                    <th scope="col">Summary</th>
                    <th scope="col">Category</th>
                    <th scope="col">Req. Priority</th>
                    {sortableHeader('itPriority', 'IT Priority')}
                    {sortableHeader('status', 'Status')}
                    <th scope="col">Owner</th>
                    {sortableHeader('updatedAt', 'Updated')}
                    <th scope="col">
                      <span className="visually-hidden">Open</span>
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
                      <td className="zg-cell-summary" title={ticket.summary}>
                        <span className="zg-clamp-2" tabIndex={0}>
                          {ticket.summary}
                        </span>
                      </td>
                      <td>{ticket.category?.name ?? 'Uncategorised'}</td>
                      <td className="zg-cell-tight">
                        <PriorityBadge priority={ticket.requestedPriority} />
                      </td>
                      <td className="zg-cell-tight">
                        <ItPriorityBadge priority={ticket.itPriority} />
                      </td>
                      <td>
                        <span className="zg-status-cell">
                          {ticket.requesterResolvedAt && (
                            <i
                              className="bi bi-check-circle-fill zg-resolved-icon"
                              title="Requester reports resolved"
                              aria-label="Requester reports resolved"
                            />
                          )}
                          <StatusBadge status={ticket.status} />
                        </span>
                      </td>
                      <td>
                        <span className="zg-owner-cell">
                          <OwnerName owner={ticket.owner} />
                          {ticket.owner && ticket.owner.id === user?.id && <span className="zg-you-tag">You</span>}
                        </span>
                      </td>
                      <td className="zg-cell-tight zg-cell-date">{formatDate(ticket.updatedAt)}</td>
                      <td className="zg-cell-tight">
                        <Link
                          className="zg-btn zg-btn-secondary zg-btn-sm"
                          to={detailLink(ticket)}
                          state={detailState}
                          aria-label={`Open ticket ${ticket.ticketNumber}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="zg-pagination" aria-label="Ticket queue pages">
            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm"
              onClick={() => update({ page: Math.max(1, params.page - 1) })}
              disabled={!pagination?.hasPreviousPage}
            >
              Previous
            </button>

            <ul className="zg-page-numbers">
              {pageNumbers.map((number) => (
                <li key={number}>
                  <button
                    type="button"
                    className={number === params.page ? 'zg-page-number is-current' : 'zg-page-number'}
                    aria-current={number === params.page ? 'page' : undefined}
                    aria-label={`Page ${number}`}
                    onClick={() => update({ page: number })}
                  >
                    {number}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm"
              onClick={() => update({ page: params.page + 1 })}
              disabled={!pagination?.hasNextPage}
            >
              Next
            </button>

            <span className="zg-page-status">
              Page {params.page} of {Math.max(1, totalPages)}
            </span>

            <div className="zg-page-size">
              <label className="zg-label" htmlFor="queue-page-size">
                Per page
              </label>
              <select
                id="queue-page-size"
                className="zg-select"
                value={params.pageSize}
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

export default StaffTicketQueue
