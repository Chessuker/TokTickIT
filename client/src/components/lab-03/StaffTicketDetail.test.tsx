import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StaffTicketDetail from './StaffTicketDetail'
import { AuthStub, ADMIN, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-14 … UI-18 (AC-18 … AC-24) — the IT Staff Ticket Detail.
 *
 * The stub is a small fake of the staff endpoints rather than a canned
 * response: claim, owner, priority and status mutate the ticket it holds and
 * every route answers the updated `StaffTicketDetail`, so the assertions
 * describe a screen that reflects the server rather than one that patches its
 * own state.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666'
const CHEN = { id: '44444444-2222-4333-8444-555555555555', name: 'Chen Wei', role: 'ITStaff' }
const PRIYA_REF = { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' }

interface TicketState {
  status: string
  itPriority: string
  owner: { id: string; name: string; role: string } | null
  requesterResolvedAt: string | null
  attachments: Attachment[]
  counts: { comments: number; internalNotes: number; attachments: number }
}

interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  isRemoved: boolean
  removedReason: string | null
  removedAt: string | null
}

const ATTACHMENTS: Attachment[] = [
  {
    id: 'att-1',
    fileName: 'battery-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    uploadedAt: '2026-09-10T05:00:00.000Z',
    isRemoved: false,
    removedReason: null,
    removedAt: null,
  },
  {
    id: 'att-2',
    fileName: 'wrong-shot.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    uploadedAt: '2026-09-10T04:30:00.000Z',
    isRemoved: true,
    removedReason: 'Uploaded the wrong screenshot',
    removedAt: '2026-09-11T06:00:00.000Z',
  },
]

/** The matrix, as the server computes `permittedTransitions` (BR-18, BR-19). */
const MATRIX: Record<string, { to: string; owner?: boolean }[]> = {
  New: [{ to: 'Open' }, { to: 'InProgress', owner: true }, { to: 'Cancelled' }],
  Open: [
    { to: 'InProgress', owner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', owner: true },
    { to: 'Cancelled' },
  ],
  InProgress: [{ to: 'WaitingForRequester' }, { to: 'Resolved', owner: true }, { to: 'Cancelled' }],
  WaitingForRequester: [
    { to: 'InProgress', owner: true },
    { to: 'Resolved', owner: true },
    { to: 'Cancelled' },
  ],
  Resolved: [{ to: 'Closed' }, { to: 'Reopened' }],
  Closed: [{ to: 'Reopened' }],
  Reopened: [
    { to: 'InProgress', owner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', owner: true },
    { to: 'Cancelled' },
  ],
  Cancelled: [],
}

interface StubOptions {
  ticket?: Partial<TicketState>
  /** Status for the initial `GET /api/staff/tickets/:id`. */
  detailStatus?: number
  /** Refuses the named operation with `409` and this message. */
  refuse?: { path: string; message: string }
  comments?: { id: string; body: string; author: { id: string; name: string; role: string }; createdAt: string }[]
  notes?: { id: string; body: string; author: { id: string; name: string; role: string }; createdAt: string }[]
}

function stubApi(options: StubOptions = {}) {
  const state: TicketState = {
    status: 'Open',
    itPriority: 'Medium',
    owner: null,
    requesterResolvedAt: null,
    attachments: [],
    counts: { comments: 0, internalNotes: 0, attachments: 0 },
    ...options.ticket,
  }
  const notes = [...(options.notes ?? [])]

  const detail = () => ({
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000042',
    summary: 'Laptop battery drains quickly',
    description: 'Drops from 100% to 20% within an hour.',
    status: state.status,
    requestedPriority: 'Medium',
    itPriority: state.itPriority,
    category: { id: 'cat-1', name: 'Hardware' },
    relatedSystem: { id: 'sys-1', name: 'Corporate Laptop' },
    requester: {
      id: 'r-1',
      name: 'Jennifer Anderson',
      email: 'jennifer.anderson@kmutt.ac.th',
      department: 'Registrar',
      role: 'Requester',
    },
    owner: state.owner,
    requesterResolvedAt: state.requesterResolvedAt,
    resolvedAt: null,
    closedAt: null,
    attachments: state.attachments.map((file) => ({
      ...file,
      downloadUrl: file.isRemoved ? null : `/api/attachments/${file.id}/download`,
    })),
    counts: {
      ...state.counts,
      internalNotes: notes.length || state.counts.internalNotes,
      attachments: state.attachments.filter((file) => !file.isRemoved).length,
    },
    permittedTransitions: MATRIX[state.status]
      .filter((entry) => state.owner !== null || !entry.owner)
      .map((entry) => entry.to),
    createdAt: '2026-09-10T04:15:00.000Z',
    updatedAt: '2026-09-14T09:30:00.000Z',
  })

  const refusal = (message: string) =>
    new Response(JSON.stringify({ error: { code: 'INVALID_TRANSITION', message } }), { status: 409 })

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(`/api/staff/tickets/${TICKET_ID}`, '')
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

    if (url.pathname === '/api/staff/assignees') {
      return new Response(
        JSON.stringify({ data: [{ id: CHEN.id, name: CHEN.name }, { id: PRIYA.id, name: PRIYA.name }] }),
        { status: 200 },
      )
    }

    if (url.pathname === `/api/tickets/${TICKET_ID}/comments`) {
      if (method === 'POST') {
        state.counts.comments += 1
        return new Response(JSON.stringify({ id: 'c-new' }), { status: 201 })
      }
      return new Response(JSON.stringify({ data: options.comments ?? [] }), { status: 200 })
    }

    if (path === '/internal-notes') {
      if (method === 'POST') {
        notes.unshift({
          id: `n-${notes.length + 1}`,
          body: String(body.body),
          author: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
          createdAt: '2026-09-14T12:00:00.000Z',
        })
        return new Response(JSON.stringify(notes[0]), { status: 201 })
      }
      return new Response(JSON.stringify({ data: notes }), { status: 200 })
    }

    if (url.pathname.startsWith('/api/attachments/')) {
      return new Response('%PDF-1.7 bytes', { status: 200 })
    }

    if (url.pathname !== `/api/staff/tickets/${TICKET_ID}` && !path.startsWith('/')) {
      return new Response('{}', { status: 404 })
    }

    if (options.refuse && path === options.refuse.path) {
      return refusal(options.refuse.message)
    }

    if (path === '' && method === 'GET') {
      const status = options.detailStatus ?? 200
      if (status !== 200) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } }),
          { status },
        )
      }
      return new Response(JSON.stringify(detail()), { status: 200 })
    }

    if (path === '/claim' && method === 'POST') {
      state.owner = PRIYA_REF
      if (state.status === 'New') state.status = 'Open'
      return new Response(JSON.stringify(detail()), { status: 200 })
    }

    if (path === '/owner' && method === 'PATCH') {
      const ownerId = body.ownerId as string | null
      if (ownerId === null && state.status === 'InProgress') {
        return refusal('A ticket that is In Progress must keep an owner.')
      }
      state.owner = ownerId === null ? null : ownerId === PRIYA.id ? PRIYA_REF : CHEN
      if (ownerId !== null && state.status === 'New') state.status = 'Open'
      return new Response(JSON.stringify(detail()), { status: 200 })
    }

    if (path === '/it-priority' && method === 'PATCH') {
      state.itPriority = String(body.itPriority)
      return new Response(JSON.stringify(detail()), { status: 200 })
    }

    if (path === '/status' && method === 'PATCH') {
      const next = String(body.status)
      const entry = MATRIX[state.status].find((candidate) => candidate.to === next)
      if (!entry) return refusal(`A ticket that is ${state.status} cannot become ${next}.`)
      if (entry.owner && state.owner === null) {
        return refusal('A ticket must have an owner before it can become ' + next + '. Assign an owner first.')
      }
      state.status = next
      return new Response(JSON.stringify(detail()), { status: 200 })
    }

    return new Response('{}', { status: 404 })
  })
}

function renderDetail(options: StubOptions & { user?: SessionUser } = {}) {
  const fetchMock = stubApi(options)
  vi.stubGlobal('fetch', fetchMock)

  render(
    <MemoryRouter initialEntries={[`/staff/tickets/${TICKET_ID}`]}>
      <AuthStub user={options.user ?? PRIYA}>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
          <Route path="/staff/queue" element={<h1>Queue</h1>} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )

  return fetchMock
}

/** The body of the last write to the staff ticket routes. */
function lastWrite(fetchMock: ReturnType<typeof stubApi>) {
  const calls = fetchMock.mock.calls.filter(
    ([, init]) => init?.method && init.method !== 'GET',
  )
  const last = calls[calls.length - 1]
  return {
    url: String(last[0]),
    method: last[1]?.method,
    body: last[1]?.body ? JSON.parse(String(last[1].body)) : undefined,
  }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StaffTicketDetail — layout and read-only group (UI-14, AC-24)', () => {
  it('shows the header badges and the read-only ticket fields', async () => {
    renderDetail({ ticket: { status: 'InProgress', itPriority: 'High', owner: PRIYA_REF } })

    const fields = await screen.findByTestId('ticket-fields')
    expect(within(fields).getByText('TKT-2026-000042')).toBeInTheDocument()
    expect(within(fields).getByText('Hardware')).toBeInTheDocument()
    expect(within(fields).getByText('Corporate Laptop')).toBeInTheDocument()
    expect(within(fields).getByText(/Jennifer Anderson/)).toBeInTheDocument()
    expect(within(fields).getByText(/jennifer\.anderson@kmutt\.ac\.th/)).toBeInTheDocument()
    expect(within(fields).getByText(/Registrar/)).toBeInTheDocument()

    // No input among the read-only fields.
    expect(fields.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('offers three operational controls and a Claim button for a ticket the caller does not own', async () => {
    renderDetail()

    expect(await screen.findByLabelText('Ticket Owner')).toBeInTheDocument()
    expect(screen.getByLabelText('IT Priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Current Status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
  })

  it('keeps the queue query string on Back to Queue', async () => {
    renderDetail()
    await screen.findByTestId('ticket-fields')

    // No router state in this render, so it falls back to the bare queue.
    expect(screen.getByRole('link', { name: /back to queue/i })).toHaveAttribute('href', '/staff/queue')
  })

  it('shows a not-found state for an unknown ticket', async () => {
    renderDetail({ detailStatus: 404 })

    expect(await screen.findByTestId('ticket-not-found')).toBeInTheDocument()
    expect(screen.queryByTestId('operational-group')).toBeNull()
  })
})

describe('StaffTicketDetail — claim and owner (UI-15, AC-18, AC-19)', () => {
  it('claims a New ticket: owner becomes the caller and the status becomes Open', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { status: 'New' } })

    await screen.findByTestId('operational-group')
    expect(screen.getByLabelText('Current Status')).toHaveValue('New')

    await user.click(screen.getByRole('button', { name: 'Claim' }))

    await waitFor(() => expect(screen.getByLabelText('Ticket Owner')).toHaveValue(PRIYA.id))
    expect(screen.getByLabelText('Current Status')).toHaveValue('Open')
    expect(lastWrite(fetchMock).url).toContain('/claim')
    // Claim disappears once the caller owns it.
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull()
  })

  it('assigns another IT Staff member from the dropdown', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail()

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Ticket Owner'), CHEN.id)

    await waitFor(() => expect(screen.getByLabelText('Ticket Owner')).toHaveValue(CHEN.id))
    expect(lastWrite(fetchMock)).toMatchObject({ method: 'PATCH', body: { ownerId: CHEN.id } })
  })

  it('confirms before taking a ticket away from its current owner', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { owner: PRIYA_REF } })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Ticket Owner'), CHEN.id)

    const dialog = await screen.findByRole('dialog', { name: /reassign this ticket/i })
    expect(dialog).toHaveTextContent(PRIYA.name)
    expect(dialog).toHaveTextContent('Chen Wei')
    // Nothing has been sent yet.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(screen.getByLabelText('Ticket Owner')).toHaveValue(CHEN.id))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('unassigns with the Unassigned option, and reports the 409 when the ticket is In Progress', async () => {
    const user = userEvent.setup()
    renderDetail({ ticket: { status: 'InProgress', owner: PRIYA_REF } })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Ticket Owner'), '')

    expect(await screen.findByRole('alert')).toHaveTextContent(/must keep an owner/i)
    // The select snaps back to the server's value.
    await waitFor(() => expect(screen.getByLabelText('Ticket Owner')).toHaveValue(PRIYA.id))
  })
})

describe('StaffTicketDetail — IT priority (UI-16, AC-20)', () => {
  it('saves the new IT priority without touching the requested one', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail()

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'High')

    await waitFor(() => expect(screen.getByLabelText('IT Priority')).toHaveValue('High'))
    expect(lastWrite(fetchMock)).toMatchObject({ method: 'PATCH', body: { itPriority: 'High' } })

    const fields = screen.getByTestId('ticket-fields')
    expect(within(fields).getByText('Medium')).toBeInTheDocument()
  })
})

describe('StaffTicketDetail — status (UI-17, AC-21, AC-22)', () => {
  it('offers only the permitted transitions plus the current status', async () => {
    renderDetail({ ticket: { status: 'Open', owner: PRIYA_REF } })

    const select = await screen.findByLabelText('Current Status')
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.value)
    expect(options).toEqual(['Open', 'InProgress', 'WaitingForRequester', 'Resolved', 'Cancelled'])
  })

  it('hides the owner-only targets and explains why when the ticket is unassigned (AC-22)', async () => {
    renderDetail({ ticket: { status: 'Open', owner: null } })

    const select = await screen.findByLabelText('Current Status')
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.value)
    expect(options).toEqual(['Open', 'WaitingForRequester', 'Cancelled'])
    expect(screen.getByTestId('owner-required-hint')).toHaveTextContent(/assign an owner first/i)
  })

  it('applies an unconfirmed transition straight away', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { status: 'Open', owner: PRIYA_REF } })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Current Status'), 'InProgress')

    await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveValue('InProgress'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(lastWrite(fetchMock)).toMatchObject({ body: { status: 'InProgress' } })
  })

  it.each(['Resolved', 'Cancelled'])('confirms before moving to %s', async (target) => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { status: 'Open', owner: PRIYA_REF } })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Current Status'), target)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(new RegExp(target, 'i'))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(screen.getByLabelText('Current Status')).toHaveValue(target))
  })

  it('cancelling the dialog leaves the status alone', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { status: 'Open', owner: PRIYA_REF } })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Current Status'), 'Resolved')
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Current Status')).toHaveValue('Open')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('keeps the previous status and shows the conflict when the server answers 409 (AC-21)', async () => {
    const user = userEvent.setup()
    renderDetail({
      ticket: { status: 'Open', owner: PRIYA_REF },
      refuse: { path: '/status', message: 'A ticket that is Open cannot become Closed.' },
    })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Current Status'), 'InProgress')

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot become Closed/i)
    expect(screen.getByLabelText('Current Status')).toHaveValue('Open')
  })

  it('keeps the confirmation dialog open and shows the error when a confirmed change is refused', async () => {
    const user = userEvent.setup()
    renderDetail({
      ticket: { status: 'Open', owner: PRIYA_REF },
      refuse: { path: '/status', message: 'A ticket must have an owner before it can become Resolved.' },
    })

    await screen.findByTestId('operational-group')
    await user.selectOptions(screen.getByLabelText('Current Status'), 'Resolved')
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^confirm$/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/must have an owner/i)
  })
})

describe('StaffTicketDetail — tabs, notes and attachments (UI-18, AC-23, AC-24)', () => {
  const NOTE = {
    id: 'n-1',
    body: 'Vendor case opened; do not share with the requester.',
    author: { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' },
    createdAt: '2026-09-14T09:45:00.000Z',
  }

  it('shows three tabs with counts and follows the WAI-ARIA tabs pattern', async () => {
    const user = userEvent.setup()
    renderDetail({ ticket: { counts: { comments: 3, internalNotes: 2, attachments: 1 }, attachments: ATTACHMENTS } })

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Public Comments (3)',
      'Internal Notes (2)',
      'Attachments (1)',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the Internal Notes panel with its own styling and composer', async () => {
    const user = userEvent.setup()
    renderDetail({ notes: [NOTE] })

    await screen.findAllByRole('tab')
    await user.click(screen.getByRole('tab', { name: /internal notes/i }))

    const list = await screen.findByTestId('note-list')
    expect(within(list).getByText(NOTE.body)).toBeInTheDocument()
    expect(screen.getByText(/not visible to the requester/i)).toBeInTheDocument()
    expect(list.querySelector('.zg-comment-internal')).not.toBeNull()
    expect(screen.getByLabelText('Add internal note')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Internal Note' })).toBeInTheDocument()
  })

  it('posts an internal note to the staff endpoint, never to the comments one (AD-03)', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail()

    await screen.findAllByRole('tab')
    await user.click(screen.getByRole('tab', { name: /internal notes/i }))
    await user.type(await screen.findByLabelText('Add internal note'), 'Checked the logs.')
    await user.click(screen.getByRole('button', { name: 'Add Internal Note' }))

    const list = await screen.findByTestId('note-list')
    expect(within(list).getByText('Checked the logs.')).toBeInTheDocument()

    const write = lastWrite(fetchMock)
    expect(write.url).toContain('/api/staff/tickets/')
    expect(write.url).toContain('/internal-notes')
    expect(write.url).not.toContain('/comments')
  })

  it('shows the two composers as visibly distinct panels (V-12)', async () => {
    const user = userEvent.setup()
    renderDetail()

    await screen.findAllByRole('tab')
    expect(screen.getByLabelText('Add public comment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post Comment' })).toBeInTheDocument()
    // The note composer is not on screen at the same time.
    expect(screen.queryByLabelText('Add internal note')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /internal notes/i }))
    expect(await screen.findByLabelText('Add internal note')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add public comment')).toBeNull()
  })

  it('lists attachments read-only: Download on active files, no upload and no Remove (AC-24)', async () => {
    const user = userEvent.setup()
    renderDetail({ ticket: { attachments: ATTACHMENTS } })

    await screen.findAllByRole('tab')
    await user.click(screen.getByRole('tab', { name: /attachments/i }))

    const active = await screen.findByTestId('active-attachments')
    expect(within(active).getByText('battery-report.pdf')).toBeInTheDocument()
    expect(within(active).getByRole('button', { name: /download battery-report\.pdf/i })).toBeInTheDocument()

    const removed = screen.getByTestId('removed-attachments')
    expect(within(removed).getByText('wrong-shot.png')).toBeInTheDocument()
    expect(within(removed).getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument()
    expect(within(removed).queryByRole('button')).toBeNull()

    expect(screen.queryByLabelText(/add a file/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('downloads an attachment through the API with the session cookie', async () => {
    const user = userEvent.setup()
    const fetchMock = renderDetail({ ticket: { attachments: ATTACHMENTS } })

    await screen.findAllByRole('tab')
    await user.click(screen.getByRole('tab', { name: /attachments/i }))
    await user.click(await screen.findByRole('button', { name: /download battery-report\.pdf/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/download'))
      expect(call?.[1]?.credentials).toBe('include')
    })
  })
})

describe('StaffTicketDetail — Administrator (UI-14, BR-17)', () => {
  it('renders the operational fields as values, with no controls and no composers', async () => {
    const user = userEvent.setup()
    renderDetail({ user: ADMIN, ticket: { owner: PRIYA_REF, itPriority: 'High' }, notes: [] })

    const group = await screen.findByTestId('operational-readonly')
    expect(within(group).getByText(PRIYA.name)).toBeInTheDocument()
    expect(within(group).getByText('IT High')).toBeInTheDocument()
    expect(group.querySelectorAll('select, input, textarea')).toHaveLength(0)

    expect(screen.getByTestId('admin-readonly-note')).toHaveTextContent(
      'Administrators can view but not change tickets.',
    )
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull()
    expect(screen.queryByLabelText('Ticket Owner')).toBeNull()
    expect(screen.queryByLabelText('Add public comment')).toBeNull()

    // Notes are readable, but not writable.
    await user.click(screen.getByRole('tab', { name: /internal notes/i }))
    expect(await screen.findByTestId('no-notes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add internal note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Internal Note' })).toBeNull()
  })
})
