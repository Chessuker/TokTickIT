import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RequesterDashboard from './RequesterDashboard'
import type { RequesterDashboardData } from './RequesterDashboard'
import type { DashboardTicket } from './dashboardData'
import { AuthStub, JENNIFER } from '../../test/auth'

/**
 * UI-13 … UI-15 — Requester dashboard (Lab 4 ui-spec.md §1.3, §1.4, §3.1;
 * AC-02, AC-20, AC-21, AC-23, AC-29).
 */

const ACTIVE = 'status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened'

function row(n: number, overrides: Partial<DashboardTicket> = {}): DashboardTicket {
  return {
    id: `t-${n}`,
    ticketNumber: `TKT-2026-90000${n}`,
    summary: `Ticket summary ${n}`,
    status: 'Open',
    itPriority: 'Medium',
    updatedAt: '2026-10-02T17:30:00.000Z',
    resolvedAt: null,
    ...overrides,
  }
}

function payload(overrides: Partial<RequesterDashboardData> = {}): RequesterDashboardData {
  return {
    generatedAt: '2026-10-03T07:10:00.000Z',
    metrics: {
      open: { count: 3, href: `/tickets?${ACTIVE}` },
      waitingForMe: { count: 1, href: '/tickets?status=WaitingForRequester' },
      resolved: { count: 0, href: '/tickets?status=Resolved' },
      closed: { count: 2, href: '/tickets?status=Closed' },
    },
    lists: {
      needsAttention: [row(1, { status: 'WaitingForRequester' })],
      recentlyUpdated: [1, 2, 3, 4, 5].map((n) => row(n)),
      recentlyResolved: [],
    },
    totalTickets: 6,
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderDashboard(responses: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn()
  for (const answer of responses) fetchMock.mockImplementationOnce(answer)
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthStub user={JENNIFER}>
        <Routes>
          <Route path="/dashboard" element={<RequesterDashboard />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
  return fetchMock
}

const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('metric cards (UI-13, AC-02, AC-20, AC-29)', () => {
  it('shows the four cards in order, with values from the API', async () => {
    renderDashboard([ok(payload())])

    expect(await screen.findByRole('heading', { name: 'Welcome, Jennifer!' })).toBeInTheDocument()
    const group = await screen.findByRole('region', { name: 'Ticket counts' })
    await waitFor(() => expect(within(group).getAllByRole('link')).toHaveLength(4))
    expect(within(group).getAllByRole('link').map((card) => card.getAttribute('aria-label'))).toEqual([
      'My open tickets: 3 tickets',
      'Waiting for you: 1 ticket',
      'Resolved: 0 tickets',
      'Closed: 2 tickets',
    ])
  })

  it('links each card to the href the API gave, not one built here', async () => {
    renderDashboard([ok(payload())])
    const card = await screen.findByRole('link', { name: 'My open tickets: 3 tickets' })
    expect(card).toHaveAttribute('href', `/tickets?${ACTIVE}`)
    expect(screen.getByRole('link', { name: 'Waiting for you: 1 ticket' })).toHaveAttribute(
      'href',
      '/tickets?status=WaitingForRequester',
    )
  })

  it('opens the list when a card is followed', async () => {
    const user = userEvent.setup()
    renderDashboard([ok(payload())])
    await user.click(await screen.findByRole('link', { name: 'Closed: 2 tickets' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/tickets?status=Closed')
  })

  it('shows "None right now" on a zero and "Reply needed" when something waits', async () => {
    renderDashboard([ok(payload())])
    expect(await screen.findByRole('link', { name: 'Resolved: 0 tickets' })).toHaveTextContent('None right now')
    const waiting = screen.getByTestId('metric-waiting')
    expect(waiting).toHaveTextContent('Reply needed')
    expect(waiting).toHaveClass('needs-attention')
    expect(screen.getByTestId('metric-closed')).not.toHaveTextContent('None right now')
  })

  it('drops the "Reply needed" cue when nothing is waiting', async () => {
    renderDashboard([ok(payload({ metrics: { ...payload().metrics, waitingForMe: { count: 0, href: '/tickets?status=WaitingForRequester' } } }))])
    const waiting = await screen.findByRole('link', { name: 'Waiting for you: 0 tickets' })
    expect(waiting).not.toHaveTextContent('Reply needed')
    expect(waiting).not.toHaveClass('needs-attention')
  })
})

describe('lists (UI-14, AC-23)', () => {
  it('renders each row as one link to the ticket, with a Bangkok time', async () => {
    renderDashboard([ok(payload())])
    const list = await screen.findByTestId('list-needs-attention')
    const link = within(list).getByRole('link', { name: 'TKT-2026-900001: Ticket summary 1' })
    expect(link).toHaveAttribute('href', '/tickets/t-1')
    expect(link).toHaveTextContent('3 Oct 2026, 00:30')
    expect(within(link).getByText('Waiting for Requester')).toBeInTheDocument()
    expect(within(link).getByText('3 Oct 2026, 00:30')).toHaveAttribute('title')
  })

  it('shows at most five rows, with "View all" on Recently updated', async () => {
    renderDashboard([ok(payload())])
    const list = await screen.findByTestId('list-recently-updated')
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/tickets?sort=updatedAt:desc')
  })

  it('shows each list its own empty message', async () => {
    renderDashboard([
      ok(payload({ lists: { needsAttention: [], recentlyUpdated: [], recentlyResolved: [] } })),
    ])
    expect(await screen.findByTestId('list-needs-attention-empty')).toHaveTextContent('Nothing needs your reply.')
    expect(screen.getByTestId('list-recently-updated-empty')).toHaveTextContent('No recent updates.')
    expect(screen.getByTestId('list-recently-resolved-empty')).toHaveTextContent('Nothing resolved yet.')
  })
})

describe('states (UI-15, AC-21)', () => {
  it('shows skeletons while loading, with the labels and quick actions already there', async () => {
    let answer: (value: Response) => void = () => undefined
    renderDashboard([() => new Promise<Response>((resolve) => (answer = resolve))])

    expect(screen.getByTestId('metric-open')).toHaveClass('is-loading')
    expect(screen.getByTestId('metric-open')).toHaveTextContent('My open tickets')
    expect(screen.getByRole('link', { name: /create ticket/i })).toHaveAttribute('href', '/tickets/new')
    expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled()

    answer(new Response(JSON.stringify(payload()), { status: 200 }))
    expect(await screen.findByRole('link', { name: 'My open tickets: 3 tickets' })).toBeInTheDocument()
  })

  it('shows one empty panel with Create Ticket when the Requester has no tickets at all', async () => {
    const zero = { count: 0, href: '/tickets' }
    renderDashboard([
      ok(payload({
        metrics: { open: zero, waitingForMe: zero, resolved: zero, closed: zero },
        lists: { needsAttention: [], recentlyUpdated: [], recentlyResolved: [] },
        totalTickets: 0,
      })),
    ])
    const empty = await screen.findByTestId('dashboard-empty')
    expect(empty).toHaveTextContent("You haven't raised any tickets yet.")
    expect(within(empty).getByRole('link', { name: 'Create Ticket' })).toHaveAttribute('href', '/tickets/new')
    expect(screen.queryByRole('region', { name: 'Ticket counts' })).toBeNull()
  })

  it('replaces cards and lists with a safe failure and Retry, keeping quick actions; Retry loads', async () => {
    const user = userEvent.setup()
    renderDashboard([() => Promise.reject(new TypeError('Failed to fetch')), ok(payload())])

    const failure = await screen.findByTestId('dashboard-failure')
    expect(failure).toHaveTextContent('Could not reach the server')
    expect(screen.queryByRole('region', { name: 'Ticket counts' })).toBeNull()
    expect(screen.getByRole('link', { name: /view my tickets/i })).toBeInTheDocument()

    await user.click(within(failure).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'My open tickets: 3 tickets' })).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-failure')).toBeNull()
  })

  it('Refresh keeps the old numbers on screen until the new ones arrive', async () => {
    const user = userEvent.setup()
    let answer: (value: Response) => void = () => undefined
    const fetchMock = renderDashboard([ok(payload()), () => new Promise<Response>((resolve) => (answer = resolve))])
    await screen.findByRole('link', { name: 'My open tickets: 3 tickets' })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'My open tickets: 3 tickets' })).toBeInTheDocument()

    answer(new Response(JSON.stringify(payload({ metrics: { ...payload().metrics, open: { count: 4, href: `/tickets?${ACTIVE}` } } })), { status: 200 }))
    expect(await screen.findByRole('link', { name: 'My open tickets: 4 tickets' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/dashboard/requester')
    // No id, no parameter: the server knows who is asking (BR-23).
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('?')
  })
})
