import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UserManagement from './UserManagement'
import { AuthStub, ADMIN, PRIYA } from '../../test/auth'
import type { SessionUser } from '../../context/auth'

/**
 * UI-21 … UI-24 (AC-25 … AC-30) — Administrator User Management.
 *
 * The stub is a small fake of `/api/admin/users`: it applies `search` and
 * `role` to a directory it holds and mutates that directory on create, patch
 * and initial-password, so the assertions describe a screen that re-reads the
 * server rather than one that patches its own state.
 */

interface Row {
  id: string
  name: string
  email: string
  department: string | null
  role: 'Requester' | 'ITStaff' | 'Administrator'
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

function row(overrides: Partial<Row> & { id: string; name: string; email: string }): Row {
  return {
    department: null,
    role: 'Requester',
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const DIRECTORY: Row[] = [
  row({ id: ADMIN.id, name: 'System Administrator', email: 'admin@toktickit.xyz', role: 'Administrator' }),
  row({ id: 'r-1', name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th' }),
  row({ id: 's-1', name: 'Priya Raman', email: 'priya.raman@kmutt.ac.th', role: 'ITStaff' }),
  row({ id: 'r-2', name: 'Alex Smith', email: 'alex.smith@kmutt.ac.th', isActive: false }),
]

interface StubOptions {
  users?: Row[]
  /** Status for the list request. */
  listStatus?: number
  /** Refuses `POST /api/admin/users` with a duplicate-email 409. */
  duplicateEmail?: boolean
  /** Refuses the next PATCH with this 409 message (the server guard, AC-29). */
  patchConflict?: string
}

function stubApi(options: StubOptions = {}) {
  // A deep copy: the writes below mutate rows, and a shallow copy would carry
  // one test's edit into the next through the shared row objects.
  const directory = (options.users ?? DIRECTORY).map((user) => ({ ...user }))

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const idMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(\/initial-password)?$/)

    if (url.pathname === '/api/admin/users' && method === 'GET') {
      if (options.listStatus === 403) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' } }),
          { status: 403 },
        )
      }
      if (options.listStatus && options.listStatus !== 200) {
        return new Response(
          JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }),
          { status: options.listStatus },
        )
      }

      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const role = url.searchParams.get('role') ?? ''
      const data = directory
        .filter((user) => {
          if (search && !`${user.name} ${user.email}`.toLowerCase().includes(search)) return false
          if (role && user.role !== role) return false
          return true
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return new Response(JSON.stringify({ data }), { status: 200 })
    }

    if (url.pathname === '/api/admin/users' && method === 'POST') {
      if (options.duplicateEmail) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'That email address is already in use.',
              fields: { email: 'That email address is already in use.' },
            },
          }),
          { status: 409 },
        )
      }

      const created = row({
        id: `new-${directory.length + 1}`,
        name: String(body.name),
        email: String(body.email),
        role: body.role as Row['role'],
        isActive: body.isActive !== false,
        mustChangePassword: true,
      })
      directory.push(created)
      return new Response(JSON.stringify(created), { status: 201 })
    }

    if (idMatch && idMatch[2] === '/initial-password' && method === 'POST') {
      const password = String(body.initialPassword ?? '')
      if (password.length < 8) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_FAILED',
              fields: { initialPassword: 'Password must be at least 8 characters.' },
            },
          }),
          { status: 400 },
        )
      }
      const target = directory.find((user) => user.id === idMatch[1])
      if (target) target.mustChangePassword = true
      return new Response(JSON.stringify(target), { status: 200 })
    }

    if (idMatch && !idMatch[2] && method === 'PATCH') {
      if (options.patchConflict) {
        return new Response(
          JSON.stringify({ error: { code: 'CONFLICT', message: options.patchConflict } }),
          { status: 409 },
        )
      }
      const target = directory.find((user) => user.id === idMatch[1])
      if (target) {
        if (typeof body.name === 'string') target.name = body.name
        if (typeof body.email === 'string') target.email = body.email
        if (typeof body.role === 'string') target.role = body.role as Row['role']
        if (typeof body.isActive === 'boolean') target.isActive = body.isActive
      }
      return new Response(JSON.stringify(target), { status: 200 })
    }

    return new Response('{}', { status: 404 })
  })
}

function renderUsers(options: StubOptions & { user?: SessionUser } = {}) {
  const fetchMock = stubApi(options)
  vi.stubGlobal('fetch', fetchMock)

  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthStub user={options.user ?? ADMIN}>
        <UserManagement />
      </AuthStub>
    </MemoryRouter>,
  )

  return fetchMock
}

/** The parameters of the most recent list request. */
function lastListQuery(fetchMock: ReturnType<typeof stubApi>): URLSearchParams {
  const calls = fetchMock.mock.calls.filter(
    ([input, init]) => String(input).includes('/api/admin/users?') && (init?.method ?? 'GET') === 'GET',
  )
  return new URL(String(calls[calls.length - 1][0]), 'http://localhost').searchParams
}

function lastWrite(fetchMock: ReturnType<typeof stubApi>) {
  const calls = fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
  const last = calls[calls.length - 1]
  return {
    url: String(last[0]),
    method: last[1]?.method,
    body: last[1]?.body ? JSON.parse(String(last[1].body)) : undefined,
  }
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

describe('UserManagement — list (UI-21, AC-25)', () => {
  it('shows name, email, role badge, status badge and Edit, sorted by name', async () => {
    renderUsers()

    const table = await screen.findByTestId('user-table')
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent?.trim())).toEqual([
      'Name',
      'Email',
      'Role',
      'Status',
      'Edit',
    ])

    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((tr) => within(tr).getAllByRole('cell')[0].textContent?.replace(' (you)', ''))).toEqual([
      'Alex Smith',
      'Jennifer Anderson',
      'Priya Raman',
      'System Administrator',
    ])

    expect(within(rows[2]).getByText('IT Staff')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Inactive')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Active')).toBeInTheDocument()
    expect(within(table).getAllByRole('button', { name: /^edit /i })).toHaveLength(4)
  })

  it('marks the signed-in administrator with "(you)"', async () => {
    renderUsers()
    const table = await screen.findByTestId('user-table')

    const self = within(table)
      .getAllByRole('row')
      .find((tr) => tr.textContent?.includes('System Administrator'))
    expect(self).toHaveTextContent('(you)')
    expect(within(table).getAllByText('(you)')).toHaveLength(1)
  })

  it('offers no delete control anywhere (BR-27)', async () => {
    renderUsers()
    await screen.findByTestId('user-table')

    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByText(/delete/i)).toBeNull()
  })

  it('searches by name or email, debounced', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')
    const before = fetchMock.mock.calls.length

    await user.type(screen.getByLabelText('Search'), 'priya')

    await waitFor(() => expect(lastListQuery(fetchMock).get('search')).toBe('priya'))
    await waitFor(() => expect(within(screen.getByTestId('user-table')).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByTestId('user-table')).toHaveTextContent('Priya Raman')

    // One request for the word, not one per keystroke.
    const listCalls = fetchMock.mock.calls.slice(before).filter(([, init]) => (init?.method ?? 'GET') === 'GET')
    expect(listCalls).toHaveLength(1)
  })

  it('filters by role', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.selectOptions(screen.getByLabelText('Role'), 'ITStaff')

    await waitFor(() => expect(lastListQuery(fetchMock).get('role')).toBe('ITStaff'))
    await waitFor(() => expect(within(screen.getByTestId('user-table')).getAllByRole('row')).toHaveLength(2))
  })

  it('shows the no-results state when nothing matches', async () => {
    const user = userEvent.setup()
    renderUsers()
    await screen.findByTestId('user-table')

    await user.type(screen.getByLabelText('Search'), 'nobody at all')

    expect(await screen.findByTestId('no-results-state')).toHaveTextContent('No users match.')
    expect(screen.queryByTestId('user-table')).toBeNull()
  })

  it('renders cards instead of a table on mobile (AC-33)', async () => {
    stubMobile()
    renderUsers()

    const cards = await screen.findByTestId('user-cards')
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(cards).getAllByRole('listitem')).toHaveLength(4)
    expect(within(cards).getAllByRole('button', { name: /^edit /i })).toHaveLength(4)
  })

  it('shows a retryable failure on a 500 (AC-34)', async () => {
    renderUsers({ listStatus: 500 })

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('UserManagement — create panel (UI-22, AC-26)', () => {
  it('collects the fields, shows the password rules live and creates the user', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Create User' }))
    const panel = screen.getByTestId('user-panel')
    expect(within(panel).getByText('Create New User')).toBeInTheDocument()

    await user.type(within(panel).getByLabelText(/full name/i), 'Dara Suksan')
    await user.type(within(panel).getByLabelText(/email address/i), 'dara.suksan@kmutt.ac.th')
    await user.selectOptions(within(panel).getByLabelText(/^role/i), 'ITStaff')

    const rules = within(panel).getByRole('list', { name: /password rules/i })
    expect(within(rules).getAllByRole('listitem')[0]).not.toHaveClass('is-met')
    await user.type(within(panel).getByLabelText(/^initial password/i), 'Welcome123!')
    await waitFor(() => expect(within(rules).getAllByRole('listitem')[0]).toHaveClass('is-met'))

    await user.click(within(panel).getByRole('button', { name: 'Save User' }))

    await waitFor(() => expect(screen.queryByTestId('user-panel')).toBeNull())
    expect(lastWrite(fetchMock)).toMatchObject({
      method: 'POST',
      body: {
        name: 'Dara Suksan',
        email: 'dara.suksan@kmutt.ac.th',
        role: 'ITStaff',
        isActive: true,
        initialPassword: 'Welcome123!',
      },
    })
    // The list is re-read and the new row appears.
    expect(await screen.findByText('Dara Suksan')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/must change their password/i)
  })

  it('shows a duplicate email under the Email field (AC-26)', async () => {
    const user = userEvent.setup()
    renderUsers({ duplicateEmail: true })
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Create User' }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/full name/i), 'Duplicate Person')
    await user.type(within(panel).getByLabelText(/email address/i), 'admin@toktickit.xyz')
    await user.type(within(panel).getByLabelText(/^initial password/i), 'Welcome123!')
    await user.click(within(panel).getByRole('button', { name: 'Save User' }))

    const emailField = within(panel).getByLabelText(/email address/i)
    await waitFor(() => expect(emailField).toHaveAttribute('aria-invalid', 'true'))
    expect(within(panel).getByRole('alert')).toHaveTextContent(/already in use/i)
    // The panel stays open with the typed values (AC-34).
    expect(within(panel).getByLabelText(/full name/i)).toHaveValue('Duplicate Person')
  })

  it('offers an Initial Password only on create, with a show/hide toggle', async () => {
    const user = userEvent.setup()
    renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Create User' }))
    const field = screen.getByLabelText(/^initial password/i)
    expect(field).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show initial password/i }))
    expect(field).toHaveAttribute('type', 'text')
  })

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Create User' }))
    await user.click(within(screen.getByTestId('user-panel')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByTestId('user-panel')).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})

describe('UserManagement — edit panel (UI-23, AC-27, AC-29)', () => {
  it('prefills the fields and saves the changes', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Priya Raman' }))
    const panel = screen.getByTestId('user-panel')
    expect(within(panel).getByText('Edit User')).toBeInTheDocument()
    expect(within(panel).getByLabelText(/full name/i)).toHaveValue('Priya Raman')
    expect(within(panel).getByLabelText(/email address/i)).toHaveValue('priya.raman@kmutt.ac.th')
    expect(within(panel).getByLabelText(/^role/i)).toHaveValue('ITStaff')
    expect(within(panel).getByLabelText('Active')).toHaveValue('yes')
    // No initial-password field in the edit form itself.
    expect(within(panel).queryByLabelText(/^initial password/i)).toBeNull()

    await user.selectOptions(within(panel).getByLabelText(/^role/i), 'Administrator')
    await user.click(within(panel).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(screen.queryByTestId('user-panel')).toBeNull())
    expect(lastWrite(fetchMock)).toMatchObject({
      method: 'PATCH',
      body: { name: 'Priya Raman', role: 'Administrator', isActive: true },
    })
  })

  it('confirms before deactivating, and says the user is signed out', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Jennifer Anderson' }))
    await user.selectOptions(screen.getByLabelText('Active'), 'no')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const dialog = await screen.findByRole('dialog', { name: /deactivate this user/i })
    expect(dialog).toHaveTextContent(/signed out immediately/i)
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => expect(lastWrite(fetchMock).body).toMatchObject({ isActive: false }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('cancelling the confirmation sends nothing', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Jennifer Anderson' }))
    await user.selectOptions(screen.getByLabelText('Active'), 'no')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('disables the Active toggle on the administrator’s own account, with the reason (AC-29)', async () => {
    const user = userEvent.setup()
    renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit System Administrator' }))

    expect(screen.getByLabelText('Active')).toBeDisabled()
    expect(screen.getByTestId('self-deactivation-hint')).toHaveTextContent(
      'You cannot deactivate your own account.',
    )
  })

  it('disables the toggle and the role select for the last active administrator (AC-29, BR-26)', async () => {
    const user = userEvent.setup()
    renderUsers()
    await screen.findByTestId('user-table')

    // The directory holds exactly one active Administrator.
    await user.click(screen.getByRole('button', { name: 'Edit System Administrator' }))

    const panel = screen.getByTestId('user-panel')
    expect(within(panel).getByLabelText('Active')).toBeDisabled()
    expect(within(panel).getByLabelText(/^role/i)).toBeDisabled()
    expect(screen.getByTestId('last-admin-hint')).toHaveTextContent(
      'At least one active administrator is required.',
    )
  })

  it('leaves the controls enabled once a second active administrator exists', async () => {
    const user = userEvent.setup()
    renderUsers({
      users: [
        ...DIRECTORY,
        row({ id: 'a-2', name: 'Second Admin', email: 'second.admin@kmutt.ac.th', role: 'Administrator' }),
      ],
    })
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Second Admin' }))

    const panel = screen.getByTestId('user-panel')
    expect(within(panel).getByLabelText('Active')).toBeEnabled()
    expect(within(panel).getByLabelText(/^role/i)).toBeEnabled()
    expect(screen.queryByTestId('last-admin-hint')).toBeNull()
  })

  it('shows the server’s 409 inline when a guard is reached anyway (AC-29)', async () => {
    const user = userEvent.setup()
    renderUsers({
      users: [
        ...DIRECTORY,
        row({ id: 'a-2', name: 'Second Admin', email: 'second.admin@kmutt.ac.th', role: 'Administrator' }),
      ],
      patchConflict: 'At least one active administrator is required.',
    })
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Second Admin' }))
    await user.selectOptions(screen.getByLabelText('Active'), 'no')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^confirm$/i }))

    const panel = await screen.findByTestId('user-panel')
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'At least one active administrator is required.',
    )
    // The panel stays open so the administrator can put the toggle back.
    expect(within(panel).getByLabelText(/full name/i)).toHaveValue('Second Admin')
  })
})

describe('UserManagement — initial password and access (UI-24, AC-28, AC-30)', () => {
  it('sets a new initial password and confirms the user must change it', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Jennifer Anderson' }))
    const panel = screen.getByTestId('user-panel')
    expect(within(panel).getByText('Set new initial password')).toBeInTheDocument()

    const button = within(panel).getByRole('button', { name: 'Set Initial Password' })
    expect(button).toBeDisabled()

    await user.type(within(panel).getByLabelText(/^new initial password/i), 'Reset123!pass')
    await user.click(button)

    expect(await within(panel).findByRole('status')).toHaveTextContent(
      'Password set — the user must change it at next login.',
    )
    expect(lastWrite(fetchMock)).toMatchObject({
      method: 'POST',
      body: { initialPassword: 'Reset123!pass' },
    })
    expect(lastWrite(fetchMock).url).toContain('/initial-password')
    expect(within(panel).getByLabelText(/^new initial password/i)).toHaveValue('')
  })

  it('shows the server’s rejection under the password field', async () => {
    const user = userEvent.setup()
    renderUsers()
    await screen.findByTestId('user-table')

    await user.click(screen.getByRole('button', { name: 'Edit Jennifer Anderson' }))
    await user.type(screen.getByLabelText(/^new initial password/i), 'short')
    await user.click(screen.getByRole('button', { name: 'Set Initial Password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
  })

  it('shows the forbidden state, and no user data, for a non-Administrator (AC-30)', async () => {
    renderUsers({ user: PRIYA, listStatus: 403 })

    expect(await screen.findByTestId('users-forbidden')).toHaveTextContent(/don't have access/i)
    expect(screen.queryByTestId('user-table')).toBeNull()
    expect(screen.queryByText('Jennifer Anderson')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create User' })).toBeNull()
  })
})

describe('UserManagement — busy states (V-09)', () => {
  /** Holds every write open until the test releases it, so the busy label can be seen. */
  function holdWrites(fetchMock: ReturnType<typeof stubApi>) {
    const real = fetchMock.getMockImplementation()!
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method && init.method !== 'GET') await gate
      return real(input, init)
    })
    return () => release()
  }

  it('shows Saving… on Save User while the create request is in flight', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')
    const release = holdWrites(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Create User' }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/full name/i), 'Busy Person')
    await user.type(within(panel).getByLabelText(/email address/i), 'busy.person@kmutt.ac.th')
    await user.type(within(panel).getByLabelText(/^initial password/i), 'Welcome123!')
    await user.click(within(panel).getByRole('button', { name: 'Save User' }))

    expect(await within(panel).findByRole('button', { name: /saving/i })).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByTestId('user-panel')).toBeNull())
  })

  it('shows Setting… on Set Initial Password while the request is in flight', async () => {
    const user = userEvent.setup()
    const fetchMock = renderUsers()
    await screen.findByTestId('user-table')
    const release = holdWrites(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Edit Jennifer Anderson' }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/^new initial password/i), 'Reset123!pass')
    await user.click(within(panel).getByRole('button', { name: 'Set Initial Password' }))

    expect(await within(panel).findByRole('button', { name: /setting/i })).toBeDisabled()
    release()
    expect(await within(panel).findByRole('status')).toHaveTextContent(/must change it at next login/i)
  })
})

