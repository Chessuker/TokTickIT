import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import App from '../App'
import AppShell from './AppShell'
import { AuthProvider } from '../context/AuthProvider'
import { useAuth } from '../context/auth'
import type { SessionUser } from '../context/auth'
import { AuthStub, JENNIFER, PRIYA, ADMIN, SARAH, authValue } from '../test/auth'

/**
 * UI-08 (AC-11, AC-08, FR-03) — the application shell shows the signed-in
 * user, only their role's navigation, and a profile menu whose Log out ends
 * the session on the server and lands on /login. The Development Requester
 * block from Lab 2 is gone.
 */

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function renderShell(user: SessionUser, overrides: Parameters<typeof authValue>[1] = {}, initialPath = '/tickets') {
  const value = authValue(user, overrides)
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthStub value={value}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<h1>My Tickets</h1>} />
            <Route path="/tickets/new" element={<h1>Create Ticket</h1>} />
            <Route path="/staff/queue" element={<h1>Ticket Queue</h1>} />
            <Route path="/admin/users" element={<h1>Users</h1>} />
            <Route path="/change-password" element={<h1>Change Your Password</h1>} />
          </Route>
          <Route path="/login" element={<h1>Sign in to your account</h1>} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
  return value
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AppShell — identity and role navigation (UI-08, AC-11)', () => {
  it('shows the user name and a role badge in the header', () => {
    renderShell(JENNIFER)

    const header = screen.getByRole('banner')
    expect(within(header).getByText(JENNIFER.name)).toBeInTheDocument()
    expect(within(header).getByText('Requester')).toHaveClass('zg-badge-role-requester')
  })

  it.each([
    ['Requester', JENNIFER, ['My Tickets', 'Create Ticket'], ['Queue', 'Users']],
    ['IT Staff', PRIYA, ['Queue'], ['My Tickets', 'Create Ticket', 'Users']],
    ['Administrator', ADMIN, ['Users', 'Queue'], ['My Tickets', 'Create Ticket']],
  ])('renders only the %s navigation', (_label, user, present, absent) => {
    renderShell(user, {}, '/tickets')

    const nav = screen.getByRole('navigation', { name: /main/i })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(present)
    for (const label of absent) {
      expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
  })

  it('has no Development Requester block and no Change Requester control (FR-05)', () => {
    renderShell(JENNIFER)

    expect(screen.queryByText(/development requester/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change requester/i })).not.toBeInTheDocument()
    expect(document.querySelector('.zg-requester')).toBeNull()
  })

  it('links the app name to the role home', () => {
    renderShell(ADMIN, {}, '/staff/queue')
    expect(screen.getByRole('link', { name: 'TokTickIT' })).toHaveAttribute('href', '/admin/users')
  })

  it('collapses to the app name and Log out while a password change is pending (AC-02)', () => {
    renderShell(SARAH, {}, '/change-password')

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
  })
})

describe('AppShell — profile menu and logout (UI-08, AC-08)', () => {
  it('opens a menu with Change password and Log out', async () => {
    const user = userEvent.setup()
    renderShell(JENNIFER)

    const trigger = screen.getByRole('button', { name: new RegExp(JENNIFER.name) })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: /profile/i })
    expect(within(menu).getByRole('menuitem', { name: /change password/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /log out/i })).toBeInTheDocument()
  })

  it('navigates to /change-password from the menu', async () => {
    const user = userEvent.setup()
    renderShell(JENNIFER)

    await user.click(screen.getByRole('button', { name: new RegExp(JENNIFER.name) }))
    await user.click(screen.getByRole('menuitem', { name: /change password/i }))

    expect(await screen.findByRole('heading', { name: /change your password/i })).toBeInTheDocument()
  })

  it('calls logout and lands on /login', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    renderShell(JENNIFER, { logout })

    await user.click(screen.getByRole('button', { name: new RegExp(JENNIFER.name) }))
    await user.click(screen.getByRole('menuitem', { name: /log out/i }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument()
  })

  it('posts to /api/auth/logout with credentials and forgets the user (through the real provider)', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(200, JENNIFER))
      if (url.endsWith('/api/auth/logout') && init?.method === 'POST') return Promise.resolve({ ok: true, status: 204, json: async () => null })
      if (url.includes('/api/tickets')) return Promise.resolve(jsonResponse(200, { data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }))
      if (url.includes('/api/categories')) return Promise.resolve(jsonResponse(200, { data: [] }))
      return Promise.resolve(jsonResponse(404, {}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )

    // The provider asks /api/auth/me first; the shell then shows Jennifer.
    await user.click(await screen.findByRole('button', { name: new RegExp(JENNIFER.name) }))
    await user.click(screen.getByRole('menuitem', { name: /log out/i }))

    expect(await screen.findByRole('heading', { name: /sign in to your account/i })).toBeInTheDocument()
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/logout'))
    expect(logoutCall?.[1]?.credentials).toBe('include')
    expect(screen.queryByText(JENNIFER.name)).not.toBeInTheDocument()
  })
})

describe('AppShell — identity change discards loaded data', () => {
  /** A screen that loads once on mount and keeps its own state. */
  function Probe({ onLoad }: { onLoad: () => void }) {
    const { user } = useAuth()
    const [loadedFor, setLoadedFor] = useState('')
    useEffect(() => {
      onLoad()
      setLoadedFor(user?.name ?? '')
      // Deliberately mount-only: the shell has to be the thing that clears it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <p>Loaded for {loadedFor}</p>
  }

  it('remounts the routed subtree when a different user signs in', async () => {
    const onLoad = vi.fn()

    function Harness() {
      const [current, setCurrent] = useState<SessionUser>(JENNIFER)
      return (
        <MemoryRouter initialEntries={['/tickets']}>
          <AuthStub value={authValue(current)}>
            <button type="button" onClick={() => setCurrent(PRIYA)}>
              Become Priya
            </button>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/tickets" element={<Probe onLoad={onLoad} />} />
              </Route>
            </Routes>
          </AuthStub>
        </MemoryRouter>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    expect(await screen.findByText(`Loaded for ${JENNIFER.name}`)).toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /become priya/i }))

    await waitFor(() => expect(screen.getByText(`Loaded for ${PRIYA.name}`)).toBeInTheDocument())
    expect(screen.queryByText(`Loaded for ${JENNIFER.name}`)).not.toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledTimes(2)
  })
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})))
})
