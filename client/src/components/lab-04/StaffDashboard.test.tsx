import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import StaffDashboard from './StaffDashboard'
import type { StaffDashboardData } from './StaffDashboard'
import { AuthStub, ADMIN, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-16 … UI-18 — IT Staff / Administrator dashboard (Lab 4 ui-spec.md §1.3,
 * §3.2; AC-19 … AC-21, AC-29).
 */

const ACTIVE = 'status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened'
const card = (count: number, href: string) => ({ count, href })

function payload(viewer: 'ITStaff' | 'Administrator' = 'ITStaff'): StaffDashboardData {
  const staff = viewer === 'ITStaff'
  return {
    generatedAt: '2026-10-03T07:10:00.000Z',
    viewer,
    metrics: {
      unassigned: card(4, `/staff/queue?owner=unassigned&${ACTIVE}`),
      mine: staff ? card(5, `/staff/queue?owner=me&${ACTIVE}`) : null,
      myFollowUps: staff ? { count: 3, ticketCount: 2, href: '/staff/queue?followUp=mine' } : null,
      requesterReportsResolved: card(0, `/staff/queue?requesterResolved=true&${ACTIVE}`),
      byStatus: {
        New: card(4, '/staff/queue?status=New'),
        Open: card(2, '/staff/queue?status=Open'),
        InProgress: card(3, '/staff/queue?status=InProgress'),
        WaitingForRequester: card(1, '/staff/queue?status=WaitingForRequester'),
        Reopened: card(2, '/staff/queue?status=Reopened'),
        Resolved: card(0, '/staff/queue?status=Resolved'),
      },
      byItPriority: {
        High: card(6, `/staff/queue?itPriority=High&${ACTIVE}`),
        Medium: card(5, `/staff/queue?itPriority=Medium&${ACTIVE}`),
        Low: card(1, `/staff/queue?itPriority=Low&${ACTIVE}`),
      },
    },
    lists: {
      urgent: [
        {
          id: 't-7',
          ticketNumber: 'TKT-2026-900007',
          summary: 'Outlook keeps asking for the password',
          status: 'InProgress',
          itPriority: 'High',
          updatedAt: '2026-10-01T03:00:00.000Z',
          resolvedAt: null,
        },
      ],
      recentlyUpdated: [],
      myRecentActions: staff
        ? [
            {
              id: 'a-1',
              ticketId: 't-7',
              ticketNumber: 'TKT-2026-900007',
              descriptionPreview: 'Re-created the Outlook profile and cleared…',
              actionAt: '2026-10-02T17:30:00.000Z',
              followUpStatus: 'Open',
            },
          ]
        : [],
    },
    users: staff
      ? null
      : { activeByRole: { Requester: 5, ITStaff: 3, Administrator: 1 }, inactive: 2, href: '/admin/users' },
  }
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search + location.hash}</p>
}

function renderDashboard(user: SessionUser, responses: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn()
  for (const answer of responses) fetchMock.mockImplementationOnce(answer)
  vi.stubGlobal('fetch', fetchMock)
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthStub user={user}>
        <Routes>
          <Route path="/dashboard" element={<StaffDashboard />} />
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

describe('cards (UI-16, AC-19, AC-29)', () => {
  it('IT Staff: primary, status and priority cards with accessible names', async () => {
    renderDashboard(PRIYA, [ok(payload())])

    expect(await screen.findByRole('heading', { name: 'Welcome back, Priya!' })).toBeInTheDocument()
    const primary = await screen.findByRole('region', { name: 'Ticket counts' })
    expect(within(primary).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Unassigned: 4 tickets',
      'My open tickets: 5 tickets',
      'My open follow-ups: 3 follow-ups across 2 tickets',
      'Requester reports resolved: 0 tickets',
    ])
    expect(within(primary).getByText('across 2 tickets')).toBeInTheDocument()

    const byStatus = screen.getByRole('region', { name: 'By status' })
    expect(within(byStatus).getAllByRole('link')).toHaveLength(6)
    const waiting = within(byStatus).getByRole('link', { name: 'Waiting for Requester: 1 ticket' })
    // The StatusBadge is the label, so colour and text match the Queue.
    expect(within(waiting).getByText('Waiting for Requester')).toHaveClass('zg-badge-status-waiting')

    const byPriority = screen.getByRole('region', { name: 'Active by IT Priority' })
    expect(within(byPriority).getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'IT High: 6 tickets',
      'IT Medium: 5 tickets',
      'IT Low: 1 ticket',
    ])
    expect(screen.queryByTestId('metric-users')).toBeNull()
  })

  it('Administrator: no "my" cards at all (not N/A), and a Users card', async () => {
    renderDashboard(ADMIN, [ok(payload('Administrator'))])

    const primary = await screen.findByRole('region', { name: 'Ticket counts' })
    await within(primary).findByTestId('metric-users')
    expect(within(primary).queryByText(/my open/i)).toBeNull()
    expect(screen.queryByText('N/A')).toBeNull()
    const users = screen.getByTestId('metric-users')
    expect(users).toHaveAttribute('href', '/admin/users')
    expect(users).toHaveAttribute(
      'aria-label',
      'Users: 5 active requesters, 3 active IT Staff, 1 active administrator, 2 inactive',
    )
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users')
    expect(screen.queryByRole('link', { name: 'My Queue' })).toBeNull()
  })
})

describe('links (UI-17, AC-20)', () => {
  it('every card links to the API href', async () => {
    renderDashboard(PRIYA, [ok(payload())])
    expect(await screen.findByRole('link', { name: /^My open follow-ups/ })).toHaveAttribute('href', '/staff/queue?followUp=mine')
    expect(screen.getByRole('link', { name: 'IT High: 6 tickets' })).toHaveAttribute('href', `/staff/queue?itPriority=High&${ACTIVE}`)
    expect(screen.getByRole('link', { name: 'Reopened: 2 tickets' })).toHaveAttribute('href', '/staff/queue?status=Reopened')
  })

  it('"My recent actions" opens the ticket on its Actions Taken tab', async () => {
    const user = userEvent.setup()
    renderDashboard(PRIYA, [ok(payload())])
    const list = await screen.findByTestId('list-my-actions')
    const row = within(list).getByRole('link', { name: 'TKT-2026-900007: Re-created the Outlook profile and cleared…' })
    expect(row).toHaveAttribute('href', '/staff/tickets/t-7#actions')
    expect(within(row).getByText('Follow-up open')).toBeInTheDocument()
    expect(row).toHaveTextContent('3 Oct 2026, 00:30')

    await user.click(row)
    expect(screen.getByTestId('location')).toHaveTextContent('/staff/tickets/t-7#actions')
  })

  it('urgent rows open the staff detail; quick actions open the Queue views', async () => {
    renderDashboard(PRIYA, [ok(payload())])
    const urgent = await screen.findByTestId('list-urgent')
    expect(within(urgent).getByRole('link', { name: 'TKT-2026-900007: Outlook keeps asking for the password' })).toHaveAttribute(
      'href',
      '/staff/tickets/t-7',
    )
    expect(screen.getByRole('link', { name: 'Open Queue' })).toHaveAttribute('href', '/staff/queue')
    expect(screen.getByRole('link', { name: 'My Queue' })).toHaveAttribute('href', '/staff/queue?owner=me')
    expect(screen.getByRole('link', { name: 'Unassigned' })).toHaveAttribute('href', '/staff/queue?owner=unassigned')
  })
})

describe('states (UI-18, AC-21)', () => {
  it('all-zero: every card shows 0 and "None right now"; lists show their messages', async () => {
    const zero = payload()
    const zeroed = (record: Record<string, { count: number; href: string }>) =>
      Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { ...value, count: 0 }]))
    zero.metrics = {
      ...zero.metrics,
      unassigned: { ...zero.metrics.unassigned, count: 0 },
      mine: { ...zero.metrics.mine!, count: 0 },
      myFollowUps: { ...zero.metrics.myFollowUps!, count: 0, ticketCount: 0 },
      byStatus: zeroed(zero.metrics.byStatus) as StaffDashboardData['metrics']['byStatus'],
      byItPriority: zeroed(zero.metrics.byItPriority) as StaffDashboardData['metrics']['byItPriority'],
    }
    zero.lists = { urgent: [], recentlyUpdated: [], myRecentActions: [] }
    renderDashboard(PRIYA, [ok(zero)])

    await screen.findByRole('link', { name: 'Unassigned: 0 tickets' })
    expect(screen.getAllByText('None right now')).toHaveLength(13)
    expect(screen.getByTestId('list-urgent-empty')).toHaveTextContent('No urgent tickets.')
    expect(screen.getByTestId('list-recently-updated-empty')).toHaveTextContent('No recent updates.')
    expect(screen.getByTestId('list-my-actions-empty')).toHaveTextContent("You haven't recorded any actions yet.")
  })

  it('403 shows Access denied with the server message, no Retry, no cards', async () => {
    renderDashboard(PRIYA, [
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'You do not have permission.' } }), { status: 403 }),
        ),
    ])
    const denied = await screen.findByTestId('dashboard-forbidden')
    expect(denied).toHaveTextContent('Access denied')
    expect(denied).toHaveTextContent('You do not have permission.')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Ticket counts' })).toBeNull()
  })

  it('a 500 shows the safe failure with Retry, which loads the dashboard', async () => {
    const user = userEvent.setup()
    renderDashboard(PRIYA, [
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }), {
            status: 500,
          }),
        ),
      ok(payload()),
    ])
    const failure = await screen.findByTestId('dashboard-failure')
    expect(failure).toHaveTextContent('Something went wrong. Please try again.')
    await user.click(within(failure).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Unassigned: 4 tickets' })).toBeInTheDocument()
  })
})
