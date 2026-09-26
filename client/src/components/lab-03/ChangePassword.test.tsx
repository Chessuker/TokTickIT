import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ChangePassword from './ChangePassword'
import AppShell from '../AppShell'
import { AuthStub, JENNIFER, SARAH, authValue } from '../../test/auth'
import type { AuthContextValue, SessionUser } from '../../context/auth'

/**
 * UI-06, UI-07 — the Change Password screen (AC-02, AC-09, AC-10).
 */

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function renderScreen(user: SessionUser, options: { withShell?: boolean; setUser?: AuthContextValue['setUser'] } = {}) {
  const value = authValue(user, options.setUser ? { setUser: options.setUser } : {})
  render(
    <MemoryRouter initialEntries={['/change-password']}>
      <AuthStub value={value}>
        <Routes>
          {options.withShell ? (
            <Route element={<AppShell />}>
              <Route path="/change-password" element={<ChangePassword />} />
            </Route>
          ) : (
            <Route path="/change-password" element={<ChangePassword />} />
          )}
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
  return value
}

async function fill(values: { current?: string; next?: string; confirm?: string }) {
  const user = userEvent.setup()
  if (values.current) await user.type(screen.getByLabelText(/^current/i), values.current)
  if (values.next) await user.type(screen.getByLabelText(/^new password/i), values.next)
  if (values.confirm) await user.type(screen.getByLabelText(/^confirm new password/i), values.confirm)
  return user
}

function rulesPanel() {
  return screen.getByRole('list', { name: /password rules/i })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ChangePassword — live rules panel and validation (UI-06, AC-09)', () => {
  it('lists the five BR-08 rules and ticks each one as the new password satisfies it', async () => {
    renderScreen(SARAH)
    const items = within(rulesPanel()).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.every((item) => !item.classList.contains('is-met'))).toBe(true)

    const user = userEvent.setup()
    const field = screen.getByLabelText(/^new password/i)

    await user.type(field, 'welcome')
    expect(within(rulesPanel()).getByText(/lower-case/i).closest('li')).toHaveClass('is-met')
    expect(within(rulesPanel()).getByText(/at least 8/i).closest('li')).not.toHaveClass('is-met')

    await user.type(field, 'W1!')
    expect(items.every((item) => item.classList.contains('is-met'))).toBe(true)
    expect(rulesPanel()).toHaveAttribute('aria-live', 'polite')
  })

  it('requires all three fields and sends nothing when they are empty', async () => {
    renderScreen(SARAH)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByLabelText(/^current/i)).toHaveAccessibleDescription(/required/i)
    expect(screen.getByLabelText(/^new password/i)).toHaveAccessibleDescription(/required/i)
    expect(screen.getByLabelText(/^confirm new password/i)).toHaveAccessibleDescription(/confirm/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('flags a mismatch under the confirmation field', async () => {
    renderScreen(SARAH)
    const user = await fill({ current: 'Welcome123!', next: 'Stronger1!', confirm: 'Stronger2!' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByLabelText(/^confirm new password/i)).toHaveAccessibleDescription(/do not match/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('flags a new password equal to the current one under the new-password field', async () => {
    renderScreen(SARAH)
    const user = await fill({ current: 'Welcome123!', next: 'Welcome123!', confirm: 'Welcome123!' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByLabelText(/^new password/i)).toHaveAccessibleDescription(/must differ/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('flags a new password that breaks the rules', async () => {
    renderScreen(SARAH)
    const user = await fill({ current: 'Welcome123!', next: 'weak', confirm: 'weak' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByLabelText(/^new password/i)).toHaveAccessibleDescription(/rules/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maps server field errors onto the three fields', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'One or more fields are invalid.',
          fields: { currentPassword: 'Current password is incorrect.' },
        },
      }) as Response,
    )
    renderScreen(SARAH)
    const user = await fill({ current: 'Nope12345!', next: 'Stronger1!', confirm: 'Stronger1!' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^current/i)).toHaveAccessibleDescription('Current password is incorrect.')
    expect(screen.queryByText(/do not match/i)).not.toBeInTheDocument()
  })

  it('posts the three values as JSON with credentials: include', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...SARAH, mustChangePassword: false }) as Response)
    renderScreen(SARAH)
    const user = await fill({ current: 'Welcome123!', next: 'Stronger1!', confirm: 'Stronger1!' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/auth\/change-password$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: 'Welcome123!',
      newPassword: 'Stronger1!',
      confirmPassword: 'Stronger1!',
    })
  })
})

describe('ChangePassword — forced mode (UI-07, AC-02, AC-10)', () => {
  it('shows the forced wording, Continue, and no Cancel', () => {
    renderScreen(SARAH)

    expect(screen.getByText(/you must change your password to continue/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('renders the shell without navigation while the change is pending', () => {
    renderScreen(SARAH, { withShell: true })

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my tickets/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
    expect(screen.getByText(SARAH.name)).toBeInTheDocument()
  })

  it('publishes the updated user and navigates to the role home on success', async () => {
    const updated = { ...SARAH, mustChangePassword: false }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updated) as Response)
    const setUser = vi.fn()
    renderScreen(SARAH, { setUser })
    const user = await fill({ current: 'Welcome123!', next: 'Stronger1!', confirm: 'Stronger1!' })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
    expect(setUser).toHaveBeenCalledWith(updated)
  })
})

describe('ChangePassword — voluntary mode', () => {
  it('shows the voluntary wording, Save password and Cancel, and stays with a success callout', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, JENNIFER) as Response)
    renderScreen(JENNIFER, { withShell: true })

    expect(screen.getByText(/choose a new password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    // The full shell is available in voluntary mode.
    expect(screen.getByRole('navigation')).toBeInTheDocument()

    const user = await fill({ current: 'Requester1!', next: 'Stronger1!', confirm: 'Stronger1!' })
    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/password has been changed/i)
    expect(screen.getByRole('heading', { name: /change your password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('')
  })

  it('shows the safe failure message when the server is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    renderScreen(JENNIFER)
    const user = await fill({ current: 'Requester1!', next: 'Stronger1!', confirm: 'Stronger1!' })

    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('Stronger1!')
  })
})

describe('ChangePassword — busy state (V-09)', () => {
  it('shows Saving… and disables Continue while the request is in flight', async () => {
    let release: (value: unknown) => void = () => undefined
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => (release = resolve)) as never)
    renderScreen(SARAH)

    const user = await fill({ current: 'Welcome123!', next: 'Changed123!pass', confirm: 'Changed123!pass' })
    await user.click(screen.getByRole('button', { name: /continue/i }))

    const busy = await screen.findByRole('button', { name: /saving/i })
    expect(busy).toBeDisabled()
    release(jsonResponse(200, { ...SARAH, mustChangePassword: false }))
  })
})

