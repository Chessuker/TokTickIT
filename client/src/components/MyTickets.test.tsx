import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MyTickets from './MyTickets'
import { RequesterProvider } from '../context/RequesterProvider'
import { REQUESTER_STORAGE_KEY } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * UI-04 (AC-04, AC-10) and UI-09 (AC-15) — the My Tickets list.
 *
 * The fetch stub below is a small fake of `GET /api/tickets` rather than a
 * fixed response: it reads `search`, `category`, `status`, `sort`, `page` and
 * `pageSize` off the request URL and answers accordingly. That is what makes
 * the assertions worth anything — a component that rendered a cached array and
 * never re-queried would pass against a canned response, but fails here.
 */

const JENNIFER: Requester = {
  id: 'aaaaaaaa-1111-4222-8333-444455556666',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar',
}

const HARDWARE = { id: 'c1111111-1111-4222-8333-444455556666', name: 'Hardware' }
const NETWORK = { id: 'c2222222-1111-4222-8333-444455556666', name: 'Network' }

interface Row {
  id: string
  ticketNumber: string
  summary: string
  status: string
  priority: string
  category: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

function row(index: number, overrides: Partial<Row> = {}): Row {
  const number = String(index).padStart(6, '0')
  return {
    id: `t-${index}`,
    ticketNumber: `TKT-2026-${number}`,
    summary: `Ticket number ${index}`,
    status: 'New',
    priority: 'Medium',
    category: HARDWARE,
    createdAt: '2026-08-23T04:15:00.000Z',
    updatedAt: '2026-08-24T09:30:00.000Z',
    ...overrides,
  }
}

/** The three tickets used by most tests. */
const TICKETS: Row[] = [
  row(1, {
    summary: 'Laptop battery drains quickly',
    priority: 'High',
    category: HARDWARE,
  }),
  row(2, {
    summary: 'Cannot connect to the VPN',
    priority: 'Low',
    category: NETWORK,
  }),
  row(3, {
    summary: 'Printer jams on every job',
    priority: 'Medium',
    category: HARDWARE,
  }),
]

/**
 * Stands in for the API. `tickets` is the requester's whole set; the stub
 * applies the query parameters to it exactly as the server would, so the test
 * is asserting against a moving result set.
 */
function stubApi(tickets: Row[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = new URL(String(input), 'http://localhost')

    if (url.pathname === '/api/categories') {
      return new Response(JSON.stringify({ data: [HARDWARE, NETWORK] }), { status: 200 })
    }

    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const category = url.searchParams.get('category') ?? ''
    const status = url.searchParams.get('status') ?? ''
    const sort = url.searchParams.get('sort') ?? 'createdAt:desc'
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')

    let matched = tickets.filter((ticket) => {
      if (search && !`${ticket.ticketNumber} ${ticket.summary}`.toLowerCase().includes(search)) {
        return false
      }
      if (category && ticket.category.id !== category) return false
      if (status && ticket.status !== status) return false
      return true
    })

    if (sort === 'ticketNumber:asc') {
      matched = [...matched].sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber))
    }

    const totalItems = matched.length
    const start = (page - 1) * pageSize
    const data = matched.slice(start, start + pageSize)
    const totalPages = Math.ceil(totalItems / pageSize)

    return new Response(
      JSON.stringify({
        data: data.map((ticket) => ({ ...ticket, relatedSystem: null, attachmentCount: 0 })),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      }),
      { status: 200 },
    )
  })
}

function renderList(tickets: Row[]) {
  const fetchMock = stubApi(tickets)
  vi.stubGlobal('fetch', fetchMock)
  window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(JENNIFER))

  render(
    <MemoryRouter initialEntries={['/tickets']}>
      <RequesterProvider>
        <MyTickets />
      </RequesterProvider>
    </MemoryRouter>,
  )

  return fetchMock
}

/** The parameters of the most recent `GET /api/tickets` request. */
function lastTicketQuery(fetchMock: ReturnType<typeof stubApi>): URLSearchParams {
  const ticketCalls = fetchMock.mock.calls.filter((call) =>
    String(call[0]).includes('/api/tickets'),
  )
  return new URL(String(ticketCalls[ticketCalls.length - 1][0]), 'http://localhost').searchParams
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MyTickets — list rendering (UI-04, AC-04)', () => {
  it('renders one table row per ticket with the ticket number and summary', async () => {
    renderList(TICKETS)

    expect(await screen.findByText('TKT-2026-000001')).toBeInTheDocument()

    const table = screen.getByRole('table')
    // Three tickets plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(table).getByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(within(table).getByText('Cannot connect to the VPN')).toBeInTheDocument()
    expect(within(table).getByText('Printer jams on every job')).toBeInTheDocument()
  })

  it('renders every column the screen specifies', async () => {
    renderList(TICKETS)
    await screen.findByRole('table')

    for (const heading of [
      'Ticket No.',
      'Created Date',
      'Summary',
      'Category',
      'Requested Priority',
      'IT Priority',
      'Current Status',
      'Ticket Owner',
      'Last Updated',
    ]) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument()
    }
  })

  it('shows a status badge and a priority badge on each row', async () => {
    renderList(TICKETS)
    // Scoped to the table: the Status filter also offers a "New" option, and
    // this test is about the badges on the rows.
    const table = await screen.findByRole('table')

    expect(within(table).getAllByText('New')).toHaveLength(3)
    expect(within(table).getByText('High')).toBeInTheDocument()
    expect(within(table).getByText('Medium')).toBeInTheDocument()
    expect(within(table).getByText('Low')).toBeInTheDocument()
  })

  it('links each row to its ticket detail', async () => {
    renderList(TICKETS)
    await screen.findByRole('table')

    expect(screen.getByRole('link', { name: 'Open ticket TKT-2026-000001' })).toHaveAttribute(
      'href',
      '/tickets/t-1',
    )
  })

  it('sends the requester id as a header rather than as a query parameter (BR-04)', async () => {
    const fetchMock = renderList(TICKETS)
    await screen.findByRole('table')

    const ticketCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/tickets'))!
    expect((ticketCall[1] as RequestInit).headers).toMatchObject({
      'X-Requester-Id': JENNIFER.id,
    })
    expect(String(ticketCall[0])).not.toContain(JENNIFER.id)
  })

  it('renders a stacked card list instead of a table on a mobile viewport', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767.98px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    renderList(TICKETS)

    expect(await screen.findByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /TKT-2026-/ })).toHaveLength(3)
  })
})

describe('MyTickets — search, filter and pagination (UI-04, AC-10)', () => {
  it('re-queries with the search term and narrows the visible rows', async () => {
    const user = userEvent.setup()
    const fetchMock = renderList(TICKETS)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Search'), 'VPN')

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('search')).toBe('VPN'))
    expect(await screen.findByText('Cannot connect to the VPN')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Laptop battery drains quickly')).not.toBeInTheDocument(),
    )
  })

  it('finds a ticket by its ticket number', async () => {
    const user = userEvent.setup()
    renderList(TICKETS)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Search'), 'TKT-2026-000003')

    expect(await screen.findByText('Printer jams on every job')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Cannot connect to the VPN')).not.toBeInTheDocument(),
    )
  })

  it('filters by category through the dropdown', async () => {
    const user = userEvent.setup()
    const fetchMock = renderList(TICKETS)
    await screen.findByRole('table')

    await user.selectOptions(await screen.findByLabelText('Category'), NETWORK.id)

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('category')).toBe(NETWORK.id))
    expect(await screen.findByText('Cannot connect to the VPN')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Printer jams on every job')).not.toBeInTheDocument(),
    )
  })

  it('filters by status through the dropdown', async () => {
    const user = userEvent.setup()
    const fetchMock = renderList(TICKETS)
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Status'), 'New')

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('status')).toBe('New'))
  })

  it('sends the chosen sort option', async () => {
    const user = userEvent.setup()
    const fetchMock = renderList(TICKETS)
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Sort by'), 'ticketNumber:asc')

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('sort')).toBe('ticketNumber:asc'))
  })

  it('restores the full list when the filters are cleared', async () => {
    const user = userEvent.setup()
    renderList(TICKETS)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Search'), 'VPN')
    await waitFor(() =>
      expect(screen.queryByText('Laptop battery drains quickly')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))

    expect(await screen.findByText('Laptop battery drains quickly')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })

  it('pages through the list with Previous and Next', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, index) => row(index + 1))
    const fetchMock = renderList(many)

    await screen.findByRole('table')
    expect(screen.getByText('Showing 1–10 of 25 tickets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('page')).toBe('2'))
    expect(await screen.findByText('Showing 11–20 of 25 tickets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('page')).toBe('1'))
  })

  it('jumps to a page by its number', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, index) => row(index + 1))
    const fetchMock = renderList(many)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Page 3' }))

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('page')).toBe('3'))
    expect(await screen.findByText('Showing 21–25 of 25 tickets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('returns to page 1 when a filter changes, so a narrower set is not skipped past', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 25 }, (_, index) => row(index + 1))
    const fetchMock = renderList(many)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Page 3' }))
    await waitFor(() => expect(lastTicketQuery(fetchMock).get('page')).toBe('3'))

    await user.type(screen.getByLabelText('Search'), 'Ticket number 1')

    await waitFor(() => expect(lastTicketQuery(fetchMock).get('page')).toBe('1'))
  })
})

describe('MyTickets — empty vs. no-results (UI-09, AC-15)', () => {
  it('shows the empty state, and only the empty state, when the requester has no tickets', async () => {
    renderList([])

    const empty = await screen.findByTestId('empty-state')
    expect(within(empty).getByText('Welcome — you have no tickets yet')).toBeInTheDocument()
    expect(within(empty).getByRole('link', { name: 'Create your first ticket' })).toHaveAttribute(
      'href',
      '/tickets/new',
    )

    expect(screen.queryByTestId('no-results-state')).not.toBeInTheDocument()
    // The empty state offers no filter reset: there is nothing to reset.
    expect(within(empty).queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument()
  })

  it('shows the no-results state, and only that, when a search matches nothing', async () => {
    const user = userEvent.setup()
    renderList(TICKETS)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Search'), 'zzzz-no-such-ticket')

    const noResults = await screen.findByTestId('no-results-state')
    expect(within(noResults).getByText('No tickets match your search')).toBeInTheDocument()
    expect(within(noResults).getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument()

    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('distinguishes the two states by message and by call to action', async () => {
    const user = userEvent.setup()
    renderList([])

    const empty = await screen.findByTestId('empty-state')
    const emptyText = empty.textContent ?? ''

    await user.type(screen.getByLabelText('Search'), 'zzzz')

    const noResults = await screen.findByTestId('no-results-state')
    expect(noResults.textContent).not.toBe(emptyText)
    expect(noResults.className).not.toBe(empty.className)
  })

  it('leaves the no-results state via Clear Filters', async () => {
    const user = userEvent.setup()
    renderList(TICKETS)
    await screen.findByRole('table')

    await user.type(screen.getByLabelText('Search'), 'zzzz-no-such-ticket')
    const noResults = await screen.findByTestId('no-results-state')

    await user.click(within(noResults).getByRole('button', { name: 'Clear Filters' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByTestId('no-results-state')).not.toBeInTheDocument()
  })
})

describe('MyTickets — failure handling', () => {
  it('shows an error callout with a retry instead of a misleading empty state', async () => {
    window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(JENNIFER))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <MyTickets />
        </RequesterProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
