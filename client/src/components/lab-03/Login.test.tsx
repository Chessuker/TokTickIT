import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from './Login'
import { AuthStub, JENNIFER, PRIYA, ADMIN, SARAH, authValue } from '../../test/auth'
import type { AuthContextValue, SessionUser } from '../../context/auth'

/**
 * UI-01 … UI-05 — the Login screen (AC-02, AC-05 … AC-07, AC-10, AC-34).
 */

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function errorBody(code: string, message: string, fields?: Record<string, string>) {
  return { error: { code, message, ...(fields ? { fields } : {}) } }
}

/** Renders Login plus the destinations it can navigate to, so a redirect is observable. */
function renderLogin(options: { user?: SessionUser | null; initialPath?: string; setUser?: AuthContextValue['setUser'] } = {}) {
  const value = authValue(options.user ?? null, options.setUser ? { setUser: options.setUser } : {})
  render(
    <MemoryRouter initialEntries={[options.initialPath ?? '/login']}>
      <AuthStub value={value}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
          <Route path="/tickets/new" element={<h1>Create Ticket</h1>} />
          <Route path="/staff/queue" element={<h1>Ticket Queue</h1>} />
          <Route path="/admin/users" element={<h1>Users</h1>} />
          <Route path="/change-password" element={<h1>Change Your Password</h1>} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
  return value
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  if (email) await user.type(screen.getByLabelText(/email address/i), email)
  if (password) await user.type(screen.getByLabelText(/^password/i), password)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  return user
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Login — client validation (UI-01, AC-05)', () => {
  it('shows an error under each empty field and sends no request', async () => {
    renderLogin()

    await fillAndSubmit('', '')

    expect(screen.getByLabelText(/email address/i)).toHaveAccessibleDescription(/email address is required/i)
    expect(screen.getByLabelText(/^password/i)).toHaveAccessibleDescription(/password is required/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a malformed email without a request', async () => {
    renderLogin()

    await fillAndSubmit('not-an-email', 'Requester1!')

    expect(screen.getByLabelText(/email address/i)).toHaveAccessibleDescription(/valid email/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('clears a field error as soon as the field is edited', async () => {
    renderLogin()
    const user = await fillAndSubmit('', 'Requester1!')

    expect(screen.getByText(/email address is required/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/email address/i), 'j')
    expect(screen.queryByText(/email address is required/i)).not.toBeInTheDocument()
  })

  it('offers a show/hide toggle on the password field with aria-pressed', async () => {
    renderLogin()
    const user = userEvent.setup()
    const toggle = screen.getByRole('button', { name: /show password/i })

    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('explains that passwords are reset by an administrator (X-01)', () => {
    renderLogin()
    expect(screen.getByText(/contact an administrator to reset your password/i)).toBeInTheDocument()
  })
})

describe('Login — invalid credentials (UI-02, AC-05)', () => {
  it('shows the generic callout, clears the password, keeps the email and focuses the password', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, errorBody('INVALID_CREDENTIALS', 'Invalid email or password.')) as Response,
    )
    renderLogin()

    await fillAndSubmit('jennifer.anderson@kmutt.ac.th', 'WrongPassword1!')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password. Please try again.')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('jennifer.anderson@kmutt.ac.th')
    expect(screen.getByLabelText(/^password/i)).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toHaveFocus())
  })
})

describe('Login — inactive and throttled (UI-03, AC-06, AC-07)', () => {
  it('shows the inactive-account callout on 403 ACCOUNT_INACTIVE', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(403, errorBody('ACCOUNT_INACTIVE', 'This account is inactive. Please contact an administrator.')) as Response,
    )
    renderLogin()

    await fillAndSubmit('alex.smith@kmutt.ac.th', 'Welcome123!')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This account is inactive. Please contact an administrator.')
    expect(alert).toHaveClass('zg-callout-warning')
    // The password is kept: the credentials were right.
    expect(screen.getByLabelText(/^password/i)).toHaveValue('Welcome123!')
  })

  it('shows the throttled callout on 429 and disables the button for the cooldown', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(429, errorBody('TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in a few minutes.')) as Response,
    )
    renderLogin()

    await fillAndSubmit('jennifer.anderson@kmutt.ac.th', 'Requester1!')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many failed attempts. Try again in a few minutes.')
    expect(alert).toHaveClass('zg-callout-warning')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
  })
})

describe('Login — failure handling (UI-04, AC-34)', () => {
  it('shows the safe message with Retry and preserves the entered values on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    renderLogin()

    await fillAndSubmit('jennifer.anderson@kmutt.ac.th', 'Requester1!')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toHaveValue('jennifer.anderson@kmutt.ac.th')
    expect(screen.getByLabelText(/^password/i)).toHaveValue('Requester1!')
  })

  it('shows the safe message on a 500', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(500, errorBody('INTERNAL_ERROR', 'Something went wrong. Please try again.')) as Response,
    )
    renderLogin()

    await fillAndSubmit('jennifer.anderson@kmutt.ac.th', 'Requester1!')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })

  it('shows the busy state while the request is in flight', async () => {
    let resolve: (value: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    renderLogin()

    await fillAndSubmit('jennifer.anderson@kmutt.ac.th', 'Requester1!')

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    resolve(jsonResponse(200, JENNIFER) as Response)
    await screen.findByRole('heading', { name: /my tickets/i })
  })

  it('posts JSON with credentials: include to /api/auth/login', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, JENNIFER) as Response)
    renderLogin()

    await fillAndSubmit('  Jennifer.Anderson@kmutt.ac.th ', 'Requester1!')

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/auth\/login$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'Jennifer.Anderson@kmutt.ac.th', password: 'Requester1!' })
    expect((init.headers as Record<string, string>)['X-Requester-Id']).toBeUndefined()
  })
})

describe('Login — success routing (UI-05, AC-02, AC-10)', () => {
  it.each([
    ['Requester', JENNIFER, /my tickets/i],
    ['IT Staff', PRIYA, /ticket queue/i],
    ['Administrator', ADMIN, /^users$/i],
  ])('sends a %s to their role home and publishes the user', async (_label, sessionUser, heading) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, sessionUser) as Response)
    const setUser = vi.fn()
    renderLogin({ setUser })

    await fillAndSubmit(sessionUser.email, 'Password1!')

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(setUser).toHaveBeenCalledWith(sessionUser)
  })

  it('sends a user with mustChangePassword to /change-password before anything else', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, SARAH) as Response)
    renderLogin({ initialPath: '/login?from=%2Ftickets%2Fnew' })

    await fillAndSubmit(SARAH.email, 'Welcome123!')

    expect(await screen.findByRole('heading', { name: /change your password/i })).toBeInTheDocument()
  })

  it('returns to the from path when it belongs to the role', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, JENNIFER) as Response)
    renderLogin({ initialPath: '/login?from=%2Ftickets%2Fnew' })

    await fillAndSubmit(JENNIFER.email, 'Requester1!')

    expect(await screen.findByRole('heading', { name: /create ticket/i })).toBeInTheDocument()
  })

  it('ignores a from path that belongs to another role and uses the role home', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, JENNIFER) as Response)
    renderLogin({ initialPath: '/login?from=%2Fadmin%2Fusers' })

    await fillAndSubmit(JENNIFER.email, 'Requester1!')

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
  })

  it('redirects an already signed-in visitor to their role home without rendering the form', () => {
    renderLogin({ user: PRIYA })

    expect(screen.getByRole('heading', { name: /ticket queue/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument()
  })
})
