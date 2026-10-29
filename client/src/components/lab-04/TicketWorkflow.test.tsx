import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StaffTicketDetail from '../lab-03/StaffTicketDetail'
import TicketHistory from './TicketHistory'
import { AuthStub, ADMIN, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-09 … UI-12 — the Lab 4 workflow on the Staff Ticket Detail (ui-spec.md
 * §3.4, §3.5; AC-12, AC-14, AC-16, AC-17).
 *
 * The stub is a fake of the staff endpoints that keeps the Lab 4 server rules:
 * it holds a version, computes the resolution gate from the Actions it holds,
 * leaves Resolved out of `permittedTransitions` while the gate is closed,
 * appends history rows, and refuses a stale `expectedVersion`. So a test can
 * record an Action and watch Resolved appear, the way it happens for real.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666'
const CREATED = '2026-09-30T03:20:00.000Z'
const PRIYA_REF = { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' }
const CHEN = { id: 's-2', name: 'Chen Wei', role: 'ITStaff' }

const MATRIX: Record<string, string[]> = {
  New: ['Open', 'InProgress', 'Cancelled'],
  Open: ['InProgress', 'WaitingForRequester', 'Resolved', 'Cancelled'],
  InProgress: ['WaitingForRequester', 'Resolved', 'Cancelled'],
  WaitingForRequester: ['InProgress', 'Resolved', 'Cancelled'],
  Resolved: ['Closed', 'Reopened'],
  Closed: ['Reopened'],
  Reopened: ['InProgress', 'WaitingForRequester', 'Resolved', 'Cancelled'],
  Cancelled: [],
}

interface FakeAction {
  id: string
  followUpStatus: string | null
  createdAt: string
}

interface State {
  status: string
  itPriority: string
  owner: { id: string; name: string; role: string } | null
  version: number
  actions: FakeAction[]
  reopenedAt: string | null
  requesterResolvedAt: string | null
  history: { id: string; fromStatus: string; toStatus: string; createdAt: string; changedBy: typeof PRIYA_REF }[]
}

function stubApi(initial: Partial<State> = {}) {
  const state: State = {
    status: 'InProgress',
    itPriority: 'Medium',
    owner: PRIYA_REF,
    version: 3,
    actions: [],
    reopenedAt: null,
    requesterResolvedAt: null,
    history: [],
    ...initial,
  }
  const writes: { path: string; body: Record<string, unknown> }[] = []
  /** Actions recorded through the panel, in the Action shape the list returns. */
  const listed: Record<string, unknown>[] = []
  /** Makes the next detail reads fail, as a `500` or at the network level. */
  const control: { failDetail: 'server' | 'network' | null } = { failDetail: null }

  const gate = () => {
    const unmet: string[] = []
    if (!state.owner) unmet.push('OWNER')
    if (!state.actions.some((action) => !state.reopenedAt || action.createdAt > state.reopenedAt)) {
      unmet.push('ACTION_SINCE_REOPEN')
    }
    if (state.actions.some((action) => action.followUpStatus === 'Open')) unmet.push('OPEN_FOLLOW_UPS')
    return { ok: unmet.length === 0, unmet, reopenedAt: state.reopenedAt }
  }

  const detail = () => ({
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000042',
    summary: 'Outlook keeps asking for the password',
    description: 'Since Monday.',
    status: state.status,
    requestedPriority: 'Medium',
    itPriority: state.itPriority,
    category: { id: 'cat-1', name: 'Email' },
    relatedSystem: null,
    requester: { id: 'r-1', name: 'Jennifer Anderson', email: 'j@kmutt.ac.th', department: 'Registrar', role: 'Requester' },
    owner: state.owner,
    requesterResolvedAt: state.requesterResolvedAt,
    resolvedAt: null,
    closedAt: null,
    attachments: [],
    counts: {
      comments: 0,
      internalNotes: 0,
      attachments: 0,
      actions: state.actions.length,
      openFollowUps: state.actions.filter((action) => action.followUpStatus === 'Open').length,
    },
    version: state.version,
    resolutionGate: gate(),
    permittedTransitions: MATRIX[state.status].filter((to) => to !== 'Resolved' || gate().ok),
    createdAt: CREATED,
    updatedAt: CREATED,
  })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const path = url.pathname.replace(`/api/staff/tickets/${TICKET_ID}`, '')

    if (url.pathname === '/api/staff/assignees') return json({ data: [{ id: PRIYA.id, name: PRIYA.name }, CHEN] })
    if (url.pathname === `/api/tickets/${TICKET_ID}/history`) {
      return json({ createdAt: CREATED, createdBy: { id: 'r-1', name: 'Jennifer Anderson', role: 'Requester' }, data: state.history })
    }

    if (path === '/actions') {
      if (method === 'POST') {
        const created = {
          id: `a-${state.actions.length + 1}`,
          followUpStatus: null,
          createdAt: '2026-10-07T03:00:00.000Z',
        }
        state.actions.push(created)
        const shaped = {
          ...created,
          ticketId: TICKET_ID,
          actionAt: String(body.actionAt),
          description: String(body.description),
          result: String(body.result),
          attachmentNotes: null,
          performedBy: PRIYA_REF,
          followUp: { required: false, note: null, assignee: null, status: null, closedAt: null, closedBy: null },
          version: 0,
          updatedBy: null,
          updatedAt: created.createdAt,
        }
        listed.unshift(shaped)
        return json(shaped, 201)
      }
      return json({ data: listed })
    }

    if (path === '' && method === 'GET') {
      if (control.failDetail === 'server') {
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, 500)
      }
      if (control.failDetail === 'network') throw new TypeError('Failed to fetch')
      return json(detail())
    }

    writes.push({ path, body })

    if (body.expectedVersion !== undefined && body.expectedVersion !== state.version) {
      return json(
        { error: { code: 'STALE_UPDATE', message: 'Someone else changed this ticket.', current: { version: state.version } } },
        409,
      )
    }

    const before = state.status
    if (path === '/it-priority') state.itPriority = String(body.itPriority)
    if (path === '/owner') state.owner = body.ownerId === CHEN.id ? CHEN : body.ownerId ? PRIYA_REF : null
    if (path === '/claim') state.owner = PRIYA_REF
    if (path === '/status') {
      const next = String(body.status)
      if (next === 'Resolved' && !gate().ok) {
        return json({ error: { code: 'RESOLUTION_BLOCKED', message: 'This ticket cannot be resolved yet.', unmet: gate().unmet } }, 409)
      }
      state.status = next
    }
    state.version += 1
    if (state.status !== before) {
      state.history.push({
        id: `h-${state.history.length + 1}`,
        fromStatus: before,
        toStatus: state.status,
        createdAt: '2026-10-07T04:00:00.000Z',
        changedBy: PRIYA_REF,
      })
    }
    return json(detail())
  })

  return { state, writes, fetchMock, control }
}

function renderDetail(initial: Partial<State> = {}, user: SessionUser = PRIYA) {
  const stub = stubApi(initial)
  vi.stubGlobal('fetch', stub.fetchMock)
  render(
    <MemoryRouter initialEntries={[`/staff/tickets/${TICKET_ID}`]}>
      <AuthStub user={user}>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
  return stub
}

const statusOptions = () =>
  within(screen.getByLabelText('Current Status')).getAllByRole('option').map((option) => option.getAttribute('value'))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('status choices and the gate hint (UI-09, AC-12, AC-14)', () => {
  it('lists only the current status and permittedTransitions; Resolved is missing while the gate is closed', async () => {
    renderDetail({ actions: [{ id: 'a-1', followUpStatus: 'Open', createdAt: '2026-10-01T00:00:00.000Z' }] })
    await screen.findByLabelText('Current Status')

    expect(statusOptions()).toEqual(['InProgress', 'WaitingForRequester', 'Cancelled'])

    const hint = screen.getByTestId('resolution-gate-hint')
    expect(hint).toHaveTextContent('Resolve is unavailable until:')
    expect(within(hint).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1 open follow-up is completed or cancelled',
    ])
    expect(screen.getByLabelText('Current Status')).toHaveAttribute('aria-describedby', 'resolution-gate-hint')
  })

  it('words each unmet condition, says "since reopened" only after a reopen, and pluralises', async () => {
    renderDetail({
      status: 'Reopened',
      reopenedAt: '2026-10-05T00:00:00.000Z',
      actions: [
        { id: 'a-1', followUpStatus: 'Open', createdAt: '2026-10-01T00:00:00.000Z' },
        { id: 'a-2', followUpStatus: 'Open', createdAt: '2026-10-01T00:00:00.000Z' },
      ],
    })

    const hint = await screen.findByTestId('resolution-gate-hint')
    expect(within(hint).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'at least one action is recorded since the ticket was reopened',
      '2 open follow-ups are completed or cancelled',
    ])
  })

  it('each bullet takes the user to the place to fix it', async () => {
    const user = userEvent.setup()
    renderDetail({ owner: null, status: 'Open' })
    const hint = await screen.findByTestId('resolution-gate-hint')

    await user.click(within(hint).getByRole('button', { name: 'an owner is assigned' }))
    expect(screen.getByLabelText('Ticket Owner')).toHaveFocus()

    await user.click(screen.getByRole('tab', { name: /public comments/i }))
    await user.click(within(hint).getByRole('button', { name: 'at least one action is recorded' }))
    const actionsTab = screen.getByRole('tab', { name: /actions taken/i })
    expect(actionsTab).toHaveAttribute('aria-selected', 'true')
    expect(actionsTab).toHaveFocus()
  })

  it('offers Resolved and shows no hint once the gate is open', async () => {
    const done = [{ id: 'a-1', followUpStatus: null, createdAt: '2026-10-01T00:00:00.000Z' }]
    renderDetail({ actions: done })
    await screen.findByLabelText('Current Status')
    expect(statusOptions()).toContain('Resolved')
    expect(screen.queryByTestId('resolution-gate-hint')).toBeNull()
  })

  it.each([
    ['a Resolved ticket', { status: 'Resolved' }, PRIYA],
    ['an Administrator', {}, ADMIN],
  ] as [string, Partial<State>, SessionUser][])('shows no hint for %s', async (_label, initial, user) => {
    renderDetail(initial, user)
    await screen.findByTestId('operational-group')
    await screen.findByRole('heading', { level: 1, name: 'Outlook keeps asking for the password' })
    expect(screen.queryByTestId('resolution-gate-hint')).toBeNull()
  })

  it('recording an Action re-reads the ticket, so Resolved appears without a page reload', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderDetail()
    await screen.findByTestId('resolution-gate-hint')
    expect(statusOptions()).not.toContain('Resolved')

    await user.click(await screen.findByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Reset the sign-in broker')
    await user.type(screen.getByLabelText(/^Result/), 'Prompt gone')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    await waitFor(() => expect(statusOptions()).toContain('Resolved'))
    expect(screen.queryByTestId('resolution-gate-hint')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Actions Taken (1)' })).toBeInTheDocument()
    // Re-read in place: the detail was fetched again, the screen never went to its loading state.
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith(`/api/staff/tickets/${TICKET_ID}`))).toHaveLength(2)
    expect(screen.getByTestId('actions-taken')).toBeInTheDocument()
  })

  it('shows the requester indication on the operations card as advisory', async () => {
    renderDetail({ requesterResolvedAt: '2026-10-06T02:00:00.000Z' })
    expect(await screen.findByTestId('requester-resolved-note')).toHaveTextContent(
      'Requester reports resolved on 6 Oct 2026, 09:00 — review the actions before resolving.',
    )
  })
})

describe('after a change (UI-10, AC-14, AC-16, BR-16)', () => {
  const done = [{ id: 'a-1', followUpStatus: null, createdAt: '2026-10-01T00:00:00.000Z' }]

  it('refreshes the header badge, the status choices and the History tab in place', async () => {
    const user = userEvent.setup()
    renderDetail({ actions: done })

    await user.click(await screen.findByRole('tab', { name: 'History' }))
    expect(await screen.findByTestId('history-created')).toHaveTextContent('Created by Jennifer Anderson')
    expect(screen.queryAllByTestId('history-row')).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('Current Status'), 'Resolved')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const headline = document.querySelector('.zg-detail-headline') as HTMLElement
    expect(within(headline).getByText('Resolved')).toBeInTheDocument()
    expect(statusOptions()).toEqual(['Resolved', 'Closed', 'Reopened'])

    const row = await screen.findByTestId('history-row')
    expect(row).toHaveTextContent('In Progress')
    expect(row).toHaveTextContent('Resolved')
    expect(row).toHaveTextContent('Priya Raman')
  })

  it('the Cancel dialog says how many open follow-ups it will cancel', async () => {
    const user = userEvent.setup()
    renderDetail({
      actions: [
        { id: 'a-1', followUpStatus: 'Open', createdAt: '2026-10-01T00:00:00.000Z' },
        { id: 'a-2', followUpStatus: 'Open', createdAt: '2026-10-01T00:00:00.000Z' },
      ],
    })

    await user.selectOptions(await screen.findByLabelText('Current Status'), 'Cancelled')
    expect(screen.getByRole('dialog')).toHaveTextContent('2 open follow-ups will be cancelled.')
  })

  it('re-reads the Actions list after a status change, so cancelled follow-ups show as cancelled', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderDetail({ actions: done })
    const listReads = () => fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/actions') && !init?.method).length
    await screen.findByTestId('no-actions')
    const before = listReads()

    await user.selectOptions(screen.getByLabelText('Current Status'), 'Cancelled')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(listReads()).toBe(before + 1))
  })

  it('the Cancel dialog says nothing about follow-ups when there are none', async () => {
    const user = userEvent.setup()
    renderDetail({ actions: done })

    await user.selectOptions(await screen.findByLabelText('Current Status'), 'Cancelled')
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/follow-up/)
  })
})

describe('stale updates (UI-11, AC-17, BR-19)', () => {
  it.each([
    ['IT Priority', 'High', '/it-priority'],
    ['Current Status', 'WaitingForRequester', '/status'],
    ['Ticket Owner', CHEN.id, '/owner'],
  ])('%s sends expectedVersion; on 409 keeps the choice, explains, and Reload brings the latest', async (label, value, path) => {
    const user = userEvent.setup()
    const { state, writes } = renderDetail()
    const select = await screen.findByLabelText(label)

    // Someone else changes the ticket while this screen is open.
    state.version = 4
    state.itPriority = 'Low'

    await user.selectOptions(select, value)
    if (label === 'Ticket Owner') {
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    }

    expect(writes[0]).toMatchObject({ path, body: { expectedVersion: 3 } })
    const callout = await screen.findByTestId('stale-callout')
    expect(callout).toHaveTextContent('Someone else changed this ticket after you opened it.')
    expect(callout).toHaveTextContent('Your change was not saved.')
    expect(screen.queryByRole('dialog')).toBeNull()
    // Not reverted silently: the select still shows what the user chose, marked.
    expect(screen.getByLabelText(label)).toHaveValue(value)
    expect(screen.getByLabelText(label)).toHaveClass('is-stale')
    const reload = within(callout).getByRole('button', { name: 'Reload' })
    expect(reload).toHaveFocus()

    await user.click(reload)

    await waitFor(() => expect(screen.queryByTestId('stale-callout')).toBeNull())
    expect(screen.getByLabelText('IT Priority')).toHaveValue('Low')
    expect(screen.getByLabelText(label)).not.toHaveClass('is-stale')

    // The user can now apply their change on top of the latest version.
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'High')
    expect(writes.at(-1)).toMatchObject({ path: '/it-priority', body: { itPriority: 'High', expectedVersion: 4 } })
    await waitFor(() => expect(screen.getByLabelText('IT Priority')).toHaveValue('High'))
  })

  it('a stale Resolve closes the confirmation and shows the same callout', async () => {
    const user = userEvent.setup()
    const { state } = renderDetail({ actions: [{ id: 'a-1', followUpStatus: null, createdAt: '2026-10-01T00:00:00.000Z' }] })
    await screen.findByLabelText('Current Status')
    state.version = 9

    await user.selectOptions(screen.getByLabelText('Current Status'), 'Resolved')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByTestId('stale-callout')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.status).toBe('InProgress')
  })

  it('a late RESOLUTION_BLOCKED reports under the status and re-reads the gate', async () => {
    const user = userEvent.setup()
    const { state } = renderDetail({ actions: [{ id: 'a-1', followUpStatus: null, createdAt: '2026-10-01T00:00:00.000Z' }] })
    await screen.findByLabelText('Current Status')
    // A colleague opens a follow-up while this screen still offers Resolved.
    state.actions[0].followUpStatus = 'Open'

    await user.selectOptions(screen.getByLabelText('Current Status'), 'Resolved')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('cannot be resolved yet')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('resolution-gate-hint')).toHaveTextContent('1 open follow-up is completed or cancelled')
    expect(statusOptions()).not.toContain('Resolved')
  })
})

describe('stale Reload that fails (UI-11, Issue #55 review)', () => {
  it.each([
    ['a 500', 'server', 'Reload failed: Something went wrong. Please try again.'],
    ['a network error', 'network', 'Reload failed: Could not reach the server.'],
  ] as const)('after %s keeps the callout and the choice, says so, and clears only on a successful retry', async (_label, failure, message) => {
    const user = userEvent.setup()
    const { state, control } = renderDetail()
    await screen.findByLabelText('IT Priority')
    state.version = 4
    state.itPriority = 'Low'

    await user.selectOptions(screen.getByLabelText('IT Priority'), 'High')
    const callout = await screen.findByTestId('stale-callout')

    // The re-read fails: nothing about the conflict is cleared.
    control.failDetail = failure
    await user.click(within(callout).getByRole('button', { name: 'Reload' }))

    expect(await within(callout).findByTestId('stale-reload-error')).toHaveTextContent(message)
    expect(screen.getByTestId('stale-callout')).toHaveTextContent('Someone else changed this ticket after you opened it.')
    expect(screen.getByLabelText('IT Priority')).toHaveValue('High')
    expect(screen.getByLabelText('IT Priority')).toHaveClass('is-stale')
    const reload = within(callout).getByRole('button', { name: 'Reload' })
    expect(reload).toBeEnabled()
    expect(reload).toHaveFocus()

    // A second failure still clears nothing.
    await user.click(reload)
    expect(await within(callout).findByTestId('stale-reload-error')).toHaveTextContent(message)
    expect(screen.getByTestId('stale-callout')).toBeInTheDocument()

    // The server is back: the retry succeeds and only now the stale state ends.
    control.failDetail = null
    await user.click(within(callout).getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(screen.queryByTestId('stale-callout')).toBeNull())
    expect(screen.queryByTestId('stale-reload-error')).toBeNull()
    expect(screen.getByLabelText('IT Priority')).toHaveValue('Low')
    expect(screen.getByLabelText('IT Priority')).not.toHaveClass('is-stale')
  })
})

describe('History (UI-12, AC-16, BR-18)', () => {
  function stubHistory(body: unknown, status = 200) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const ORIGIN = { createdAt: CREATED, createdBy: { id: 'r-1', name: 'Jennifer Anderson', role: 'Requester' } }
  const ROWS = [
    { id: 'h-1', fromStatus: 'New', toStatus: 'Open', createdAt: '2026-10-01T01:00:00.000Z', changedBy: PRIYA_REF },
    { id: 'h-2', fromStatus: 'Open', toStatus: 'InProgress', createdAt: '2026-10-02T17:30:00.000Z', changedBy: CHEN },
  ]

  it('draws the Created row, then each change oldest first, in Bangkok time, with no controls', async () => {
    stubHistory({ ...ORIGIN, data: ROWS })
    render(<TicketHistory ticketId={TICKET_ID} ticketStatus="InProgress" />)

    const created = await screen.findByTestId('history-created')
    expect(created).toHaveTextContent('Created by Jennifer Anderson')
    expect(created).toHaveTextContent('Requester')
    // en-GB writes September as "Sep" or "Sept" depending on the ICU version.
    expect(created).toHaveTextContent(/30 Sept? 2026, 10:20/)

    const rows = screen.getAllByTestId('history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('New')
    expect(rows[0]).toHaveTextContent('Open')
    expect(rows[0]).toHaveTextContent('Priya Raman')
    expect(rows[1]).toHaveTextContent('Chen Wei')
    expect(rows[1]).toHaveTextContent('3 Oct 2026, 00:30')
    expect(within(rows[1]).getByText('to')).toHaveClass('visually-hidden')

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByTestId('history-legacy')).toBeNull()
  })

  it('says history starts with Lab 4 on an older ticket with no rows, but not on a New one', async () => {
    stubHistory({ ...ORIGIN, data: [] })
    const { unmount } = render(<TicketHistory ticketId={TICKET_ID} ticketStatus="Closed" />)
    expect(await screen.findByTestId('history-legacy')).toHaveTextContent('Status history is recorded from Lab 4 onward.')
    unmount()

    render(<TicketHistory ticketId={TICKET_ID} ticketStatus="New" />)
    await screen.findByTestId('history-created')
    expect(screen.queryByTestId('history-legacy')).toBeNull()
  })

  it('offers Retry on a failure and loads on retry', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<TicketHistory ticketId={TICKET_ID} ticketStatus="Open" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading history...')
    expect(await screen.findByTestId('history-error')).toHaveTextContent('Could not reach the server')

    fetchMock.mockImplementation((async () => new Response(JSON.stringify({ ...ORIGIN, data: ROWS }))) as never)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findAllByTestId('history-row')).toHaveLength(2)
  })

  it('shows a 403 as a refusal, without Retry', async () => {
    stubHistory({ error: { code: 'FORBIDDEN', message: 'This ticket belongs to another requester.' } }, 403)
    render(<TicketHistory ticketId={TICKET_ID} ticketStatus="Open" />)

    expect(await screen.findByTestId('history-error')).toHaveTextContent('This ticket belongs to another requester.')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it("the Requester's variant is collapsed and loads nothing until opened", async () => {
    const user = userEvent.setup()
    const fetchMock = stubHistory({ ...ORIGIN, data: ROWS })
    render(<TicketHistory ticketId={TICKET_ID} ticketStatus="InProgress" collapsible />)

    const toggle = screen.getByRole('button', { name: /status history/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findAllByTestId('history-row')).toHaveLength(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/tickets/${TICKET_ID}/history`)
  })
})
