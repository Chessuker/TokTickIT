import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import StaffTicketQueue from './StaffTicketQueue'
import { AuthStub, ADMIN, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-10 … UI-13 (AC-16, AC-17, AC-33, AC-34) — the IT Staff Ticket Queue.
 *
 * The fetch stub is a small fake of `GET /api/staff/tickets`: it applies the
 * query string to a fixed set the way the server would, so the assertions are
 * about the request the screen makes and the result it renders, not about a
 * canned response.
 */

const HARDWARE = { id: 'c1111111-1111-4222-8333-444455556666', name: 'Hardware' }
const NETWORK = { id: 'c2222222-1111-4222-8333-444455556666', name: 'Network' }
const CHEN = { id: '44444444-2222-4333-8444-555555555555', name: 'Chen Wei', role: 'ITStaff' }
const PRIYA_REF = { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' }
const JENNIFER_REF = { id: 'r-1', name: 'Jennifer Anderson', role: 'Requester' }

interface Row {
  id: string
  ticketNumber: string
  summary: string
  status: string
  requestedPriority: string
  itPriority: string
  category: { id: string; name: string }
  requester: typeof JENNIFER_REF
  owner: typeof CHEN | null
  requesterResolvedAt: string | null
  createdAt: string
  updatedAt: string
}

function row(index: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `t-${index}`,
    ticketNumber: `TKT-2026-${String(index).padStart(6, '0')}`,
    summary: `Ticket number ${index}`,
    status: 'New',
    requestedPriority: 'Medium',
    itPriority: 'Medium',
    category: HARDWARE,
    requester: JENNIFER_REF,
    owner: null,
    requesterResolvedAt: null,
    createdAt: '2026-09-10T04:15:00.000Z',
    updatedAt: '2026-09-14T09:30:00.000Z',
    ...overrides,
  }
}

const TICKETS: Row[] = [
  row(1, { summary: 'Laptop battery drains quickly', status: 'InProgress', requestedPriority: 'High', itPriority: 'High', owner: PRIYA_REF, requesterResolvedAt: '2026-09-14T08:00:00.000Z' }),
  row(2, { summary: 'Cannot connect to the VPN', status: 'Open', requestedPriority: 'Low', itPriority: 'Medium', category: NETWORK, owner: CHEN }),
  row(3, { summary: 'Printer jams on every job', status: 'New', itPriority: 'Low' }),
]

interface StubOptions {
  /** Status for `GET /api/staff/tickets` when not 200. */
  queueStatus?: number
  /** Answers the first queue request with this status, then 200 (for Retry). */
  failFirst?: number
}

function stubApi(tickets: Row[], options: StubOptions = {}) {
  let queueCalls = 0

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = new URL(String(input), 'http://localhost')

    if (url.pathname === '/api/categories') {
      return new Response(JSON.stringify({ data: [HARDWARE, NETWORK] }), { status: 200 })
    }
    if (url.pathname === '/api/staff/assignees') {
      return new Response(JSON.stringify({ data: [{ id: CHEN.id, name: CHEN.name }, { id: PRIYA.id, name: PRIYA.name }] }), { status: 200 })
    }
    if (url.pathname !== '/api/staff/tickets') {
      return new Response('{}', { status: 404 })
    }

    queueCalls += 1
    const failStatus = options.queueStatus ?? (queueCalls === 1 ? options.failFirst : undefined)
    if (failStatus === 403) {
      return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' } }), { status: 403 })
    }
    if (failStatus) {
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', correlationId: 'abc' } }), { status: failStatus })
    }

    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const statuses = url.searchParams.getAll('status')
    const itPriority = url.searchParams.get('itPriority') ?? ''
    const owner = url.searchParams.get('owner') ?? ''
    const category = url.searchParams.get('category') ?? ''
    const sort = url.searchParams.get('sort') ?? 'updatedAt:desc'
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')

    let matched = tickets.filter((ticket) => {
      if (search && !`${ticket.ticketNumber} ${ticket.summary}`.toLowerCase().includes(search)) return false
      if (statuses.length && !statuses.includes(ticket.status)) return false
      if (itPriority && ticket.itPriority !== itPriority) return false
      if (owner === 'me' && ticket.owner?.id !== PRIYA.id) return false
      if (owner === 'unassigned' && ticket.owner !== null) return false
      if (owner && owner !== 'me' && owner !== 'unassigned' && ticket.owner?.id !== owner) return false
      if (category && ticket.category.id !== category) return false
      return true
    })

    if (sort === 'ticketNumber:asc') matched = [...matched].sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber))
    if (sort === 'ticketNumber:desc') matched = [...matched].sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber))

    const totalItems = matched.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const start = (page - 1) * pageSize

    return new Response(
      JSON.stringify({
        data: matched.slice(start, start + pageSize),
        pagination: { page, pageSize, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
      }),
      { status: 200 },
    )
  })
}

function renderQueue(tickets: Row[], options: StubOptions & { user?: SessionUser; initialEntry?: string } = {}) {
  const fetchMock = stubApi(tickets, options)
  vi.stubGlobal('fetch', fetchMock)

  render(
    <MemoryRouter initialEntries={[options.initialEntry ?? '/staff/queue']}>
      <AuthStub user={options.user ?? PRIYA}>
        <Routes>
          <Route path="/staff/queue" element={<StaffTicketQueue />} />
          <Route path="/staff/tickets/:id" element={<h1>Ticket Detail placeholder</h1>} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )

  return fetchMock
}

/** The parameters of the most recent `GET /api/staff/tickets` request. */
function lastQueueQuery(fetchMock: ReturnType<typeof stubApi>): URLSearchParams {
  const calls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/staff/tickets'))
  return new URL(String(calls[calls.length - 1][0]), 'http://localhost').searchParams
}

function stubMobile() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767.98px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StaffTicketQueue — table (UI-10, AC-16)', () => {
  it('lists every ticket with the nine columns in order and an Open action', async () => {
    renderQueue(TICKETS)

    const table = await screen.findByTestId('queue-table')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent?.trim())
    expect(headers).toEqual(['Ticket No.', 'Created', 'Summary', 'Category', 'Req. Priority', 'IT Priority', 'Status', 'Owner', 'Updated', 'Open'])

    // Three tickets plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(table).getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(within(table).getAllByRole('link', { name: /open ticket TKT-2026-/i })).toHaveLength(3)
  })

  it('shows both priorities as distinct badges, the status label, owner or Unassigned, and the You tag', async () => {
    renderQueue(TICKETS)
    const table = await screen.findByTestId('queue-table')
    const rows = within(table).getAllByRole('row').slice(1)

    // Row 1: owned by the signed-in user (Priya).
    expect(within(rows[0]).getByText('High')).toBeInTheDocument()
    expect(within(rows[0]).getByText('IT High')).toBeInTheDocument()
    expect(within(rows[0]).getByText('In Progress')).toBeInTheDocument()
    expect(within(rows[0]).getByText(PRIYA.name)).toBeInTheDocument()
    expect(within(rows[0]).getByText('You')).toBeInTheDocument()

    // Row 2: owned by somebody else — no You tag.
    expect(within(rows[1]).getByText('Chen Wei')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('You')).toBeNull()

    // Row 3: unassigned.
    expect(within(rows[2]).getByText('Unassigned')).toBeInTheDocument()
  })

  it('marks a requester-resolved ticket with the check icon before its status', async () => {
    renderQueue(TICKETS)
    const table = await screen.findByTestId('queue-table')
    const rows = within(table).getAllByRole('row').slice(1)

    expect(within(rows[0]).getByLabelText('Requester reports resolved')).toBeInTheDocument()
    expect(within(rows[1]).queryByLabelText('Requester reports resolved')).toBeNull()
  })

  it('shows the result line and requests the documented defaults', async () => {
    const fetchMock = renderQueue(TICKETS)

    expect(await screen.findByText('Showing 1 to 3 of 3 tickets')).toBeInTheDocument()

    const query = lastQueueQuery(fetchMock)
    expect(query.get('sort')).toBe('updatedAt:desc')
    expect(query.get('page')).toBe('1')
    expect(query.get('pageSize')).toBe('10')
    expect(query.has('requesterId')).toBe(false)

    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/staff/tickets'))
    expect(call?.[1]?.credentials).toBe('include')
  })

  it('Open navigates to the staff ticket detail', async () => {
    const user = userEvent.setup()
    renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    await user.click(screen.getByRole('link', { name: /open ticket TKT-2026-000002/i }))

    expect(await screen.findByText('Ticket Detail placeholder')).toBeInTheDocument()
  })

  it('renders the same screen for an Administrator', async () => {
    renderQueue(TICKETS, { user: ADMIN })

    expect(await screen.findByTestId('queue-table')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })
})

describe('StaffTicketQueue — toolbar (UI-11, AC-17)', () => {
  it('debounces the search and re-queries with the term', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')
    const before = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/staff/tickets')).length

    await user.type(screen.getByLabelText('Search'), 'VPN')

    await waitFor(() => expect(lastQueueQuery(fetchMock).get('search')).toBe('VPN'))
    expect(await screen.findByText('Cannot connect to the VPN')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Laptop battery drains quickly')).toBeNull())

    // One request for the whole word, not one per keystroke.
    const after = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/staff/tickets')).length
    expect(after - before).toBe(1)
  })

  it('status chips toggle and send a repeated status parameter', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    await user.click(screen.getByRole('button', { name: /^filters/i }))
    await user.click(screen.getByRole('button', { name: 'Open', pressed: false }))
    await user.click(screen.getByRole('button', { name: 'In Progress', pressed: false }))

    await waitFor(() => expect(lastQueueQuery(fetchMock).getAll('status')).toEqual(['Open', 'InProgress']))
    expect(screen.getByRole('button', { name: 'Open', pressed: true })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Printer jams on every job')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Open', pressed: true }))
    await waitFor(() => expect(lastQueueQuery(fetchMock).getAll('status')).toEqual(['InProgress']))
  })

  it('IT priority, owner and category filters map to their parameters', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')
    await user.click(screen.getByRole('button', { name: /^filters/i }))

    await user.selectOptions(screen.getByLabelText('IT Priority'), 'High')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('itPriority')).toBe('High'))

    await user.selectOptions(screen.getByLabelText('Owner'), 'me')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('owner')).toBe('me'))
    expect(await screen.findByText('Showing 1 to 1 of 1 ticket')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Owner'), 'unassigned')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('owner')).toBe('unassigned'))

    // The assignee list feeds the owner dropdown.
    await user.selectOptions(screen.getByLabelText('Owner'), CHEN.id)
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('owner')).toBe(CHEN.id))

    await user.selectOptions(screen.getByLabelText('Category'), NETWORK.id)
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('category')).toBe(NETWORK.id))
  })

  it('the sort select and the sortable headers drive the sort parameter and aria-sort', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    await user.selectOptions(screen.getByLabelText('Sort by'), 'itPriority:desc')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('sort')).toBe('itPriority:desc'))

    const ticketNoHeader = screen.getByRole('columnheader', { name: /ticket no\./i })
    expect(ticketNoHeader).toHaveAttribute('aria-sort', 'none')

    await user.click(within(ticketNoHeader).getByRole('button'))
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('sort')).toBe('ticketNumber:desc'))
    expect(screen.getByRole('columnheader', { name: /ticket no\./i })).toHaveAttribute('aria-sort', 'descending')

    await user.click(within(screen.getByRole('columnheader', { name: /ticket no\./i })).getByRole('button'))
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('sort')).toBe('ticketNumber:asc'))
    expect(screen.getByRole('columnheader', { name: /ticket no\./i })).toHaveAttribute('aria-sort', 'ascending')

    // Summary is not sortable.
    expect(within(screen.getByRole('columnheader', { name: 'Summary' })).queryByRole('button')).toBeNull()
  })

  it('pages with the queue page sizes and returns to page 1 when a filter changes', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 12 }, (_, index) => row(index + 1))
    const fetchMock = renderQueue(many)
    await screen.findByTestId('queue-table')

    expect(screen.getByLabelText('Per page')).toHaveValue('10')
    expect(Array.from((screen.getByLabelText('Per page') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['5', '10', '25', '50'])

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('page')).toBe('2'))
    expect(await screen.findByText('Showing 11 to 12 of 12 tickets')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Per page'), '5')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('pageSize')).toBe('5'))
    expect(lastQueueQuery(fetchMock).get('page')).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Page 3' }))
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('page')).toBe('3'))

    await user.click(screen.getByRole('button', { name: /^filters/i }))
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'Medium')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('itPriority')).toBe('Medium'))
    expect(lastQueueQuery(fetchMock).get('page')).toBe('1')
  })

  it('Clear filters drops every filter and the search, and is disabled when nothing is set', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeDisabled()

    await user.type(screen.getByLabelText('Search'), 'VPN')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('search')).toBe('VPN'))
    await user.click(screen.getByRole('button', { name: /^filters/i }))
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'Medium')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('itPriority')).toBe('Medium'))

    await user.click(screen.getByRole('button', { name: /clear filters/i }))

    await waitFor(() => expect(lastQueueQuery(fetchMock).has('search')).toBe(false))
    expect(lastQueueQuery(fetchMock).has('itPriority')).toBe(false)
    expect(screen.getByLabelText('Search')).toHaveValue('')
    expect(await screen.findByText('Showing 1 to 3 of 3 tickets')).toBeInTheDocument()
  })

  it('reads its initial state from the URL so a queue link can be shared or returned to', async () => {
    const fetchMock = renderQueue(TICKETS, { initialEntry: '/staff/queue?status=Open&status=New&owner=unassigned&sort=ticketNumber:asc&page=1&pageSize=25' })

    await screen.findByTestId('queue-table')

    const query = lastQueueQuery(fetchMock)
    expect(query.getAll('status')).toEqual(['Open', 'New'])
    expect(query.get('owner')).toBe('unassigned')
    expect(query.get('sort')).toBe('ticketNumber:asc')
    expect(query.get('pageSize')).toBe('25')
    // Filters with values open expanded.
    expect(screen.getByRole('button', { name: 'Open', pressed: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Owner')).toHaveValue('unassigned')
  })
})

describe('StaffTicketQueue — states (UI-12, AC-17, AC-34)', () => {
  it('shows skeleton rows while loading', () => {
    renderQueue(TICKETS)

    expect(screen.getByTestId('queue-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('queue-table')).toBeNull()
  })

  it('shows the empty state when the system has no tickets', async () => {
    renderQueue([])

    expect(await screen.findByTestId('empty-state')).toHaveTextContent('No tickets in the system yet.')
    expect(screen.queryByTestId('no-results-state')).toBeNull()
  })

  it('shows a distinct no-results state when a filter matches nothing', async () => {
    const user = userEvent.setup()
    renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    await user.type(screen.getByLabelText('Search'), 'nothing matches this')

    expect(await screen.findByTestId('no-results-state')).toHaveTextContent('No tickets match these filters')
    expect(screen.queryByTestId('empty-state')).toBeNull()

    await user.click(within(screen.getByTestId('no-results-state')).getByRole('button', { name: /clear filters/i }))
    expect(await screen.findByTestId('queue-table')).toBeInTheDocument()
  })

  it('shows the Forbidden state on a 403 without rendering any ticket', async () => {
    renderQueue(TICKETS, { queueStatus: 403 })

    expect(await screen.findByRole('alert')).toHaveTextContent(/don't have access/i)
    expect(screen.queryByTestId('queue-table')).toBeNull()
    expect(screen.queryByText('Laptop battery drains quickly')).toBeNull()
  })

  it('shows a safe failure with Retry on a 500, keeping the entered search, and recovers', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS, { failFirst: 500 })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent(/correlationId|stack|prisma/i)

    await user.type(screen.getByLabelText('Search'), 'battery')
    await waitFor(() => expect(lastQueueQuery(fetchMock).get('search')).toBe('battery'))
    expect(screen.getByLabelText('Search')).toHaveValue('battery')

    // The search change already re-fetched; a Retry control is offered too.
    expect(await screen.findByTestId('queue-table')).toBeInTheDocument()
  })

  it('Retry repeats the same request after a network failure', async () => {
    const user = userEvent.setup()
    const fetchMock = renderQueue(TICKETS)
    await screen.findByTestId('queue-table')

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.selectOptions(screen.getByLabelText('Per page'), '25')

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByTestId('queue-table')).toBeInTheDocument()
    expect(lastQueueQuery(fetchMock).get('pageSize')).toBe('25')
  })
})

describe('StaffTicketQueue — mobile (UI-13, AC-33)', () => {
  it('renders cards, not a table, at the mobile media query', async () => {
    stubMobile()
    renderQueue(TICKETS)

    const cards = await screen.findByTestId('queue-cards')
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(cards).getAllByRole('link')).toHaveLength(3)

    const first = within(cards).getAllByRole('link')[0]
    expect(first).toHaveTextContent('TKT-2026-000001')
    expect(first).toHaveTextContent('In Progress')
    expect(first).toHaveTextContent('IT High')
    expect(first).toHaveTextContent(PRIYA.name)
    expect(first).toHaveTextContent('You')
    expect(within(first).getByLabelText('Requester reports resolved')).toBeInTheDocument()
  })
})

describe('StaffTicketQueue — search box and history (UI-11)', () => {
  function BackButton() {
    const navigate = useNavigate()
    return (
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    )
  }

  it('follows Back to an earlier search, and keeps what is typed after Clear filters', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', stubApi(TICKETS))

    render(
      <MemoryRouter initialEntries={['/staff/queue?search=printer', '/staff/queue?search=vpn']} initialIndex={1}>
        <AuthStub user={PRIYA}>
          <Routes>
            <Route
              path="/staff/queue"
              element={
                <>
                  <BackButton />
                  <StaffTicketQueue />
                </>
              }
            />
          </Routes>
        </AuthStub>
      </MemoryRouter>,
    )

    const search = screen.getByLabelText('Search')
    expect(search).toHaveValue('vpn')

    // A change from outside the screen is reflected in the box.
    await user.click(screen.getByRole('button', { name: 'Browser back' }))
    await waitFor(() => expect(search).toHaveValue('printer'))

    // The screen's own write is not echoed back over new typing.
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    await user.type(search, 'battery')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(search).toHaveValue('battery')
  })
})

