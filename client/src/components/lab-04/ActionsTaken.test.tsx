import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActionsTaken from './ActionsTaken'
import type { Action, ActionsTakenProps } from './ActionsTaken'
import { minActionInput, toBangkokInput } from './dates'
import { AuthStub, ADMIN, JENNIFER, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-01 … UI-08 — Actions Taken (Lab 4 ui-spec.md §3.3, §3.6; AC-03, AC-04,
 * AC-06, AC-07, AC-09 … AC-11, AC-27).
 *
 * The stub is a small fake of the Actions endpoints, not a canned response:
 * creates append, edits bump the version, follow-ups close, and the list is
 * re-read from it — so the assertions describe a screen that reflects the
 * server rather than one that patches its own state.
 */

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666'
const CREATED = '2026-09-30T03:20:45.000Z'
const CHEN = { id: 's-2', name: 'Chen Wei', role: 'ITStaff' }
const ROBERT = { id: 's-9', name: 'Robert Wilson', role: 'ITStaff' }
const PRIYA_REF = { id: PRIYA.id, name: PRIYA.name, role: 'ITStaff' }

function action(overrides: Partial<Action> & { id: string }): Action {
  return {
    ticketId: TICKET_ID,
    actionAt: '2026-10-01T02:00:00.000Z',
    description: 'Re-created the Outlook profile.',
    result: 'Prompt stopped for two hours.',
    attachmentNotes: null,
    performedBy: PRIYA_REF,
    followUp: { required: false, note: null, assignee: null, status: null, closedAt: null, closedBy: null },
    version: 0,
    updatedBy: null,
    createdAt: '2026-10-01T02:05:00.000Z',
    updatedAt: '2026-10-01T02:05:00.000Z',
    ...overrides,
  }
}

const WITH_OPEN_FOLLOW_UP = action({
  id: 'a-2',
  actionAt: '2026-10-02T03:00:00.000Z',
  performedBy: CHEN,
  description: 'Updated Office and reset the sign-in broker.',
  attachmentNotes: 'outlook-prompt.png in Attachments.',
  followUp: {
    required: true,
    note: 'Check the Exchange policy with the mail team.',
    assignee: { ...ROBERT, isActive: false },
    status: 'Open',
    closedAt: null,
    closedBy: null,
  },
})

const PLAIN = action({ id: 'a-1' })

interface Write {
  method: string
  url: string
  body: Record<string, unknown>
}

interface StubOptions {
  actions?: Action[]
  /** Answer the next write with this status and error code. */
  refuseNext?: { status: number; code: string; message: string; fields?: Record<string, string> }
  /** Make the next write fail at the network level. */
  failNext?: boolean
  /** Answer every list read with this status (the message is optional, as servers vary). */
  refuseList?: { status: number; code: string; message?: string }
}

function stubApi(options: StubOptions = {}) {
  const state = { actions: [...(options.actions ?? [])], refuseNext: options.refuseNext, failNext: options.failNext }
  const writes: Write[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

    if (url.pathname === '/api/staff/assignees') {
      return new Response(JSON.stringify({ data: [{ id: CHEN.id, name: CHEN.name }, { id: PRIYA.id, name: PRIYA.name }] }), {
        status: 200,
      })
    }

    const list = () => new Response(JSON.stringify({ data: state.actions }), { status: 200 })
    if (method === 'GET' && options.refuseList) {
      const { status, code, message } = options.refuseList
      return new Response(JSON.stringify({ error: { code, message } }), { status })
    }
    if (method === 'GET') return list()

    writes.push({ method, url: url.pathname, body })

    if (state.failNext) {
      state.failNext = false
      throw new TypeError('Failed to fetch')
    }
    if (state.refuseNext) {
      const { status, code, message, fields } = state.refuseNext
      state.refuseNext = undefined
      return new Response(JSON.stringify({ error: { code, message, fields } }), { status })
    }

    if (method === 'POST') {
      const created = action({
        id: `a-new-${state.actions.length + 1}`,
        actionAt: String(body.actionAt),
        description: String(body.description),
        result: String(body.result),
        attachmentNotes: (body.attachmentNotes as string | null) ?? null,
        followUp: body.followUpRequired
          ? {
              required: true,
              note: String(body.followUpNote),
              assignee: { ...CHEN, isActive: true },
              status: 'Open',
              closedAt: null,
              closedBy: null,
            }
          : PLAIN.followUp,
      })
      state.actions = [created, ...state.actions]
      return new Response(JSON.stringify(created), { status: 201 })
    }

    const id = url.pathname.split('/').pop()
    const index = state.actions.findIndex((entry) => entry.id === id)
    const current = state.actions[index]
    if (body.version !== current.version) {
      return new Response(
        JSON.stringify({ error: { code: 'STALE_UPDATE', message: 'Stale.', current: { version: current.version } } }),
        { status: 409 },
      )
    }
    const updated: Action = {
      ...current,
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.result !== undefined ? { result: String(body.result) } : {}),
      followUp:
        body.followUpStatus !== undefined
          ? {
              ...current.followUp,
              status: body.followUpStatus as 'Completed' | 'Cancelled',
              closedAt: '2026-10-03T07:00:00.000Z',
              closedBy: PRIYA_REF,
            }
          : current.followUp,
      version: current.version + 1,
      updatedBy: PRIYA_REF,
    }
    state.actions[index] = updated
    return new Response(JSON.stringify(updated), { status: 200 })
  })

  return { fetchMock, writes, state }
}

/** `matchMedia` for the desktop table (≥ 992 px) or the card layout. */
function setViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query.includes('min-width: 992px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function renderPanel(
  options: StubOptions & { user?: SessionUser; props?: Partial<ActionsTakenProps>; desktop?: boolean } = {},
) {
  setViewport(options.desktop ?? false)
  const stub = stubApi(options)
  vi.stubGlobal('fetch', stub.fetchMock)

  const onCountChange = vi.fn()
  const onLocked = vi.fn()
  render(
    <AuthStub user={options.user ?? PRIYA}>
      <ActionsTaken
        ticketId={TICKET_ID}
        ticketStatus="InProgress"
        ticketCreatedAt={CREATED}
        ownerId={CHEN.id}
        mode="staff"
        onCountChange={onCountChange}
        onLocked={onLocked}
        {...options.props}
      />
    </AuthStub>,
  )
  return { ...stub, onCountChange, onLocked }
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
})

describe('list (UI-01, AC-11, AC-03)', () => {
  it('shows the desktop table in server order with performer, Owner tag and follow-up state', async () => {
    const user = userEvent.setup()
    const { onCountChange } = renderPanel({ actions: [WITH_OPEN_FOLLOW_UP, PLAIN], desktop: true })

    const table = await screen.findByTestId('actions-list')
    expect(table.tagName).toBe('TABLE')
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Date/Time',
      'Description',
      'Result',
      'Performed by',
      'Follow-up',
      'Details',
    ])

    const rows = screen.getAllByTestId('action-row')
    expect(rows).toHaveLength(2)
    // Server order kept (BR-11): the newer Action first.
    expect(rows[0]).toHaveTextContent('Updated Office')
    expect(rows[0]).toHaveTextContent('Chen Wei')
    expect(within(rows[0]).getByText('Owner')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Follow-up open')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Inactive')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('2 Oct 2026, 10:00')
    expect(within(rows[1]).queryByText('Owner')).toBeNull()

    expect(screen.getByText(/visible to the requester/i)).toBeInTheDocument()
    expect(screen.getByText(/1 open follow-up/)).toBeInTheDocument()
    expect(onCountChange).toHaveBeenCalledWith(2)

    // View mode expands the row with every field.
    await user.click(within(rows[0]).getByRole('button', { name: /view/i }))
    const view = await screen.findByTestId('action-view')
    expect(view).toHaveTextContent('Check the Exchange policy with the mail team.')
    expect(view).toHaveTextContent('outlook-prompt.png in Attachments.')
    expect(within(rows[0]).getByRole('button', { name: /hide/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows cards below 992 px', async () => {
    renderPanel({ actions: [WITH_OPEN_FOLLOW_UP, PLAIN] })

    const list = await screen.findByTestId('actions-list')
    expect(list.tagName).toBe('OL')
    expect(screen.getAllByTestId('action-card')).toHaveLength(2)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows loading, then the empty state, and Retry after a failure', async () => {
    const user = userEvent.setup()
    setViewport(false)
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/assignees')) return new Response(JSON.stringify({ data: [] }), { status: 200 })
        if (fail) throw new TypeError('Failed to fetch')
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }),
    )
    render(
      <AuthStub user={PRIYA}>
        <ActionsTaken ticketId={TICKET_ID} ticketStatus="Open" ticketCreatedAt={CREATED} ownerId={null} mode="staff" />
      </AuthStub>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/loading actions/i)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)

    fail = false
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByTestId('no-actions')).toHaveTextContent('No actions recorded yet.')
  })
})

describe('create mode (UI-02, AC-04)', () => {
  it('validates under each field before sending anything', async () => {
    const user = userEvent.setup()
    const { writes } = renderPanel()
    await screen.findByTestId('no-actions')

    await user.click(screen.getByRole('button', { name: /record action/i }))
    const form = screen.getByTestId('action-form')
    expect(within(form).getByTestId('performed-by')).toHaveTextContent(`You (${PRIYA.name})`)

    await user.click(within(form).getByRole('button', { name: 'Save action' }))

    expect(screen.getByLabelText(/^Action Description/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Action description is required.')).toBeInTheDocument()
    expect(screen.getByText('Result is required.')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('reveals a required note and assignee when follow-up is switched on', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))

    expect(screen.queryByLabelText(/^Follow-up Note/)).toBeNull()
    const toggle = screen.getByRole('switch', { name: /follow-up required/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.type(screen.getByLabelText(/^Action Description/), 'Did it')
    await user.type(screen.getByLabelText(/^Result/), 'Worked')
    // The owner is preselected as assignee; clear it to see the rule.
    await user.selectOptions(screen.getByLabelText(/^Assign follow-up to/), '')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    expect(screen.getByText('A follow-up note is required when follow-up is needed.')).toBeInTheDocument()
    expect(screen.getByText('Choose who will do the follow-up.')).toBeInTheDocument()
  })

  it('bounds the date input by the ticket (rounded up) and now + 5 minutes', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))

    const input = screen.getByLabelText(/^Action Date\/Time/)
    expect(input).toHaveAttribute('type', 'datetime-local')
    expect(input).toHaveAttribute('min', minActionInput(CREATED))
    expect(input.getAttribute('max')! > toBangkokInput(Date.now())).toBe(true)
  })

  it('maps server field errors under the right field and keeps every value', async () => {
    const user = userEvent.setup()
    renderPanel({
      refuseNext: {
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'One or more fields are invalid.',
        fields: { followUpAssigneeId: 'The follow-up must be assigned to an active IT Staff member.' },
      },
    })
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Checked logs')
    await user.type(screen.getByLabelText(/^Result/), 'Nothing found')
    await user.click(screen.getByRole('switch', { name: /follow-up required/i }))
    await user.type(screen.getByLabelText(/^Follow-up Note/), 'Ask the vendor')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    expect(await screen.findByText('The follow-up must be assigned to an active IT Staff member.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Assign follow-up to/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue('Checked logs')
    expect(screen.getByLabelText(/^Follow-up Note/)).toHaveValue('Ask the vendor')
  })

  it('creates the Action, shows it in the list and reports the new count', async () => {
    const user = userEvent.setup()
    const { writes, onCountChange } = renderPanel({ actions: [PLAIN] })
    await screen.findByTestId('actions-list')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), '  Swapped the cable  ')
    await user.type(screen.getByLabelText(/^Result/), 'Fixed')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    expect(await screen.findByText('Action recorded.')).toBeInTheDocument()
    expect(screen.queryByTestId('action-form')).toBeNull()
    expect(screen.getAllByTestId('action-card')).toHaveLength(2)
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(2))

    expect(writes[0].method).toBe('POST')
    expect(writes[0].url).toBe(`/api/staff/tickets/${TICKET_ID}/actions`)
    expect(writes[0].body).toMatchObject({ description: 'Swapped the cable', result: 'Fixed', followUpRequired: false, attachmentNotes: null })
    expect(writes[0].body).not.toHaveProperty('performedById')
    expect(writes[0].body).not.toHaveProperty('followUpNote')
    expect(String(writes[0].body.actionAt)).toMatch(/Z$/)
  })
})

describe('duplicate protection (UI-03, AC-10)', () => {
  it('sends one request for a double click, with a busy state', async () => {
    const user = userEvent.setup()
    const { writes, fetchMock } = renderPanel()
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Did it')
    await user.type(screen.getByLabelText(/^Result/), 'Worked')

    const real = fetchMock.getMockImplementation()!
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') await gate
      return real(input, init)
    })

    const save = screen.getByRole('button', { name: 'Save action' })
    await user.dblClick(save)
    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled()
    release()

    await screen.findByText('Action recorded.')
    expect(writes).toHaveLength(1)
  })

  it('ignores a second submit in the same tick, before the busy state can render', async () => {
    const user = userEvent.setup()
    const { writes } = renderPanel()
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Did it')
    await user.type(screen.getByLabelText(/^Result/), 'Worked')

    // Two submits with no render between them: the disabled button cannot
    // help here, only the ref guard can.
    const form = screen.getByTestId('action-form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    await screen.findByText('Action recorded.')
    expect(writes).toHaveLength(1)
  })

  it('retries after a network failure with the same clientRequestId (BR-10)', async () => {
    const user = userEvent.setup()
    const { writes } = renderPanel({ failNext: true })
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Did it')
    await user.type(screen.getByLabelText(/^Result/), 'Worked')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
    await user.click(screen.getByRole('button', { name: 'Save action' }))
    await screen.findByText('Action recorded.')

    expect(writes).toHaveLength(2)
    expect(writes[0].body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(writes[1].body.clientRequestId).toBe(writes[0].body.clientRequestId)
  })
})

describe('edit mode (UI-04, AC-06)', () => {
  it('prefills, keeps Performed by read-only, and sends only what changed with the version', async () => {
    const user = userEvent.setup()
    const { writes } = renderPanel({ actions: [{ ...PLAIN, version: 3 }] })
    const card = await screen.findByTestId('action-card')
    await user.click(within(card).getByRole('button', { name: 'Edit' }))

    const form = screen.getByTestId('action-form')
    expect(within(form).getByTestId('performed-by')).toHaveTextContent(PRIYA.name)
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue(PLAIN.description)
    expect(screen.getByLabelText(/^Action Date\/Time/)).toHaveValue(toBangkokInput(PLAIN.actionAt))

    await user.clear(screen.getByLabelText(/^Result/))
    await user.type(screen.getByLabelText(/^Result/), 'Fixed for good.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    expect(writes[0]).toEqual({
      method: 'PATCH',
      url: `/api/staff/tickets/${TICKET_ID}/actions/${PLAIN.id}`,
      body: { version: 3, result: 'Fixed for good.' },
    })
  })

  it('says nothing changed instead of sending an empty edit', async () => {
    const user = userEvent.setup()
    const { writes } = renderPanel({ actions: [PLAIN] })
    await user.click(within(await screen.findByTestId('action-card')).getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText(/nothing has changed/i)).toBeInTheDocument()
    expect(writes).toHaveLength(0)
  })

  it('on 409 STALE_UPDATE keeps the typed edit, reloads on request and saves on the new version', async () => {
    const user = userEvent.setup()
    const { writes, state } = renderPanel({ actions: [{ ...PLAIN, version: 1 }] })
    await user.click(within(await screen.findByTestId('action-card')).getByRole('button', { name: 'Edit' }))

    // Someone else saves first.
    state.actions[0] = { ...state.actions[0], version: 2, description: 'Their wording.' }

    await user.clear(screen.getByLabelText(/^Result/))
    await user.type(screen.getByLabelText(/^Result/), 'My result')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/someone else changed this action/i)
    expect(alert).toHaveFocus()
    expect(screen.getByLabelText(/^Result/)).toHaveValue('My result')

    await user.click(within(alert).getByRole('button', { name: 'Reload' }))
    expect(await screen.findByText(/reloaded the latest version/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Result/)).toHaveValue('My result')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Changes saved.')
    expect(writes.at(-1)?.body).toMatchObject({ version: 2, result: 'My result' })
  })
})

describe('follow-up (UI-05, AC-07)', () => {
  it.each([
    ['Mark follow-up done', 'Mark as done', 'Completed', 'Follow-up done'],
    ['Cancel follow-up', 'Cancel follow-up', 'Cancelled', 'Follow-up cancelled'],
  ])('%s asks first, then sends version and status', async (trigger, confirm, status, badge) => {
    const user = userEvent.setup()
    const { writes } = renderPanel({ actions: [{ ...WITH_OPEN_FOLLOW_UP, version: 4 }] })
    const card = await screen.findByTestId('action-card')

    await user.click(within(card).getByRole('button', { name: trigger }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Check the Exchange policy with the mail team.')
    expect(within(dialog).getByRole('button', { name: confirm })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: confirm }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes[0].body).toEqual({ version: 4, followUpStatus: status })
    expect(await screen.findByText(badge)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark follow-up done' })).toBeNull()
  })

  it('closes the dialog with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderPanel({ actions: [WITH_OPEN_FOLLOW_UP] })
    const trigger = within(await screen.findByTestId('action-card')).getByRole('button', { name: 'Cancel follow-up' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('cannot switch a follow-up off in edit mode, and keeps an inactive assignee visible', async () => {
    const user = userEvent.setup()
    renderPanel({ actions: [WITH_OPEN_FOLLOW_UP] })
    await user.click(within(await screen.findByTestId('action-card')).getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('switch', { name: /follow-up required/i })).toBeDisabled()
    expect(screen.getByText('To drop a follow-up, cancel it.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Assign follow-up to/)).toHaveValue(ROBERT.id)
    expect(screen.getByRole('option', { name: 'Robert Wilson (inactive)' })).toBeInTheDocument()
  })

  it('disables note and assignee once the follow-up is closed', async () => {
    const user = userEvent.setup()
    const closed = { ...WITH_OPEN_FOLLOW_UP, followUp: { ...WITH_OPEN_FOLLOW_UP.followUp, status: 'Completed' as const, closedAt: '2026-10-03T00:00:00.000Z', closedBy: PRIYA_REF } }
    renderPanel({ actions: [closed] })
    await user.click(within(await screen.findByTestId('action-card')).getByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText(/^Follow-up Note/)).toBeDisabled()
    expect(screen.getByLabelText(/^Assign follow-up to/)).toBeDisabled()
  })
})

describe('Requester view (UI-06, AC-03, AC-08)', () => {
  it('reads the Requester endpoint and renders every entry with no controls at all', async () => {
    const { fetchMock } = renderPanel({ user: JENNIFER, actions: [WITH_OPEN_FOLLOW_UP, PLAIN], desktop: true, props: { mode: 'requester' } })

    const panel = await screen.findByTestId('work-done')
    await screen.findAllByTestId('action-card')
    expect(within(panel).getByRole('heading', { name: /work done by it \(2\)/i })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      expect.arrayContaining([expect.stringContaining(`/api/tickets/${TICKET_ID}/actions`)]),
    )
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/staff/'))).toBe(false)

    // Cards at every width; no table, no button of any kind.
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(panel).queryAllByRole('button')).toHaveLength(0)
    expect(panel).toHaveTextContent('Next step: Check the Exchange policy with the mail team.')
    expect(panel).not.toHaveTextContent(/visible to the requester/i)
  })

  it('says so when no work has been recorded', async () => {
    renderPanel({ user: JENNIFER, props: { mode: 'requester' } })
    expect(await screen.findByTestId('no-actions')).toHaveTextContent("IT Staff haven't recorded any work yet.")
  })
})

describe('locked ticket (UI-07, AC-09)', () => {
  it.each(['Resolved', 'Closed', 'Cancelled'])('offers no Record or Edit on a %s ticket, and says why', async (status) => {
    renderPanel({ actions: [WITH_OPEN_FOLLOW_UP], props: { ticketStatus: status } })
    await screen.findByTestId('action-card')

    expect(screen.queryByRole('button', { name: /record action/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /follow-up/i })).toBeNull()
    expect(screen.getByTestId('actions-locked-hint')).toHaveTextContent(`This ticket is ${status.toLowerCase()}. Reopen it to record more work.`)
  })

  it('reports a late 409 TICKET_LOCKED to the parent', async () => {
    const user = userEvent.setup()
    const { onLocked } = renderPanel({
      refuseNext: { status: 409, code: 'TICKET_LOCKED', message: 'This ticket is resolved. Reopen it to record more work.' },
    })
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Did it')
    await user.type(screen.getByLabelText(/^Result/), 'Worked')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Reopen it to record more work.')
    expect(onLocked).toHaveBeenCalledTimes(1)
  })

  it('lets an Administrator record work too (AD-02)', async () => {
    renderPanel({ user: ADMIN })
    await screen.findByTestId('no-actions')
    expect(screen.getByRole('button', { name: /record action/i })).toBeInTheDocument()
  })
})

describe('safe failure (UI-08, AC-27)', () => {
  it('keeps every value, focuses the error and lets the user try again', async () => {
    const user = userEvent.setup()
    renderPanel({ failNext: true })
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Checked the switch port')
    await user.type(screen.getByLabelText(/^Result/), 'Port flapping')
    await user.type(screen.getByLabelText(/^Attachment Notes/), 'switch-log.txt')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/your text is still here/i)
    expect(alert).toHaveFocus()
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue('Checked the switch port')
    expect(screen.getByLabelText(/^Result/)).toHaveValue('Port flapping')
    expect(screen.getByLabelText(/^Attachment Notes/)).toHaveValue('switch-log.txt')
    expect(screen.getByRole('button', { name: 'Save action' })).toBeEnabled()
  })

  it('asks before discarding typed text on Cancel', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Half-written')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('action-form')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue('Half-written')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByTestId('action-form')).toBeNull()
  })
})

describe('forbidden, not found and server failure (UI-08, L3 ui-spec.md §2)', () => {
  it('shows a 403 on the list as Access denied with the server message, and nothing else', async () => {
    renderPanel({
      actions: [PLAIN],
      refuseList: { status: 403, code: 'FORBIDDEN', message: 'Only IT Staff and Administrators can view this.' },
    })

    const denied = await screen.findByTestId('actions-denied')
    expect(denied).toHaveAttribute('role', 'alert')
    expect(denied).toHaveTextContent('Access denied')
    expect(denied).toHaveTextContent('Only IT Staff and Administrators can view this.')
    // Not worded as an outage, and nothing to retry or act on.
    expect(denied).not.toHaveTextContent(/could not reach|connection|try again/i)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /record action/i })).toBeNull()
    expect(screen.queryByTestId('actions-list')).toBeNull()
    expect(screen.queryByText('Re-created the Outlook profile.')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('falls back to its own wording when a 403 carries no message (Requester view)', async () => {
    renderPanel({ user: JENNIFER, actions: [PLAIN], props: { mode: 'requester' }, refuseList: { status: 403, code: 'FORBIDDEN' } })

    const denied = await screen.findByTestId('actions-denied')
    expect(denied).toHaveTextContent("You don't have access to the actions on this ticket.")
    expect(within(screen.getByTestId('work-done')).queryAllByRole('button')).toHaveLength(0)
  })

  it('shows a 404 as Not found, without Retry', async () => {
    renderPanel({ refuseList: { status: 404, code: 'NOT_FOUND', message: 'Ticket not found.' } })

    const missing = await screen.findByTestId('actions-not-found')
    expect(missing).toHaveTextContent('Not found')
    expect(missing).toHaveTextContent('Ticket not found.')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /record action/i })).toBeNull()
  })

  it('keeps Retry for a server failure, which may pass on its own', async () => {
    renderPanel({ refuseList: { status: 500, code: 'INTERNAL' } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByTestId('actions-denied')).toBeNull()
  })

  it('names a 403 on save as Access denied, keeps every value and leaves the ticket alone', async () => {
    const user = userEvent.setup()
    const { onLocked } = renderPanel({
      refuseNext: { status: 403, code: 'FORBIDDEN', message: 'Your account can no longer record actions.' },
    })
    await screen.findByTestId('no-actions')
    await user.click(screen.getByRole('button', { name: /record action/i }))
    await user.type(screen.getByLabelText(/^Action Description/), 'Checked the switch port')
    await user.type(screen.getByLabelText(/^Result/), 'Port flapping')
    await user.click(screen.getByRole('button', { name: 'Save action' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Access denied: Your account can no longer record actions.')
    expect(alert).not.toHaveTextContent(/could not reach/i)
    expect(alert).toHaveFocus()
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue('Checked the switch port')
    expect(screen.getByLabelText(/^Result/)).toHaveValue('Port flapping')
    expect(onLocked).not.toHaveBeenCalled()
  })

  it('names a 403 on a follow-up change as Access denied inside the dialog', async () => {
    const user = userEvent.setup()
    renderPanel({ actions: [WITH_OPEN_FOLLOW_UP], refuseNext: { status: 403, code: 'FORBIDDEN', message: 'Not allowed.' } })
    const card = await screen.findByTestId('action-card')

    await user.click(within(card).getByRole('button', { name: 'Mark follow-up done' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as done' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Access denied: Not allowed.')
    expect(screen.getByText('Follow-up open')).toBeInTheDocument()
  })
})
