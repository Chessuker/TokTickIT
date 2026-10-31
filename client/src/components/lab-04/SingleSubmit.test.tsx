import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CreateTicketForm from '../CreateTicketForm'
import Login from '../lab-03/Login'
import ChangePassword from '../lab-03/ChangePassword'
import CommentsPanel from '../lab-03/CommentsPanel'
import UserManagement from '../lab-03/UserManagement'
import InternalNotesPanel from '../lab-03/InternalNotesPanel'
import { useSingleFlight } from '../../useSingleFlight'
import { AuthStub, ADMIN, JENNIFER, PRIYA, SARAH, authValue } from '../../test/auth'

/**
 * Issue #57 hardening — duplicate submission on every Lab 2/3 form (ui-spec.md
 * §2 "Duplicate submit", V-09, AC-27).
 *
 * The busy state disables a button only after React re-renders, so these
 * tests fire two submits in the same tick, before any re-render: exactly the
 * case the disabled button cannot stop (found in Issue #54). Each write is
 * left pending, as a slow network would, and the assertion is that exactly
 * one request went out.
 */

const pending = () => new Promise<Response>(() => undefined)
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

/** GETs answer from `reads`; every write is counted and left pending. */
function stubFetch(reads: Record<string, unknown> = {}) {
  const writes: string[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      writes.push(`${method} ${url.pathname}`)
      return pending()
    }
    const body = reads[url.pathname]
    return body === undefined ? json({ data: [] }) : json(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return writes
}

function submitTwiceInOneTick(form: HTMLElement) {
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSingleFlight', () => {
  it('lets one caller in until it ends, then the next', () => {
    const { result } = renderHook(() => useSingleFlight())
    expect(result.current.begin()).toBe(true)
    expect(result.current.begin()).toBe(false)
    result.current.end()
    expect(result.current.begin()).toBe(true)
  })
})

describe('one request for two same-tick submits', () => {
  it('Login', async () => {
    const user = userEvent.setup()
    const writes = stubFetch()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthStub value={authValue(null)}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email address/i), 'jennifer.anderson@kmutt.ac.th')
    await user.type(screen.getByLabelText(/^password/i), 'Requester1!')

    submitTwiceInOneTick(screen.getByRole('button', { name: /sign in/i }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/auth/login']))
  })

  it('Change Password', async () => {
    const user = userEvent.setup()
    const writes = stubFetch()
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <AuthStub user={SARAH}>
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
          </Routes>
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/^current/i), 'Welcome123!')
    await user.type(screen.getByLabelText(/^new password/i), 'Brand-new-pass1!')
    await user.type(screen.getByLabelText(/^confirm new password/i), 'Brand-new-pass1!')

    submitTwiceInOneTick(screen.getByRole('button', { name: /continue|change password|save/i }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/auth/change-password']))
  })

  it('Create Ticket', async () => {
    const user = userEvent.setup()
    const writes = stubFetch({
      '/api/categories': { data: [{ id: 'cat-hardware', name: 'Hardware' }] },
      '/api/related-systems': { data: [{ id: 'sys-laptop', name: 'Corporate Laptop' }] },
    })
    render(
      <MemoryRouter>
        <AuthStub user={JENNIFER}>
          <CreateTicketForm />
        </AuthStub>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByLabelText(/^Category/)).toBeEnabled())
    await user.type(screen.getByLabelText(/^Summary \/ Title/), 'Laptop battery drains quickly')
    await user.type(screen.getByLabelText(/^Description/), 'The battery drops from 100% to 20% within an hour.')
    await user.selectOptions(screen.getByLabelText(/^Category/), 'cat-hardware')
    await user.selectOptions(screen.getByLabelText(/^Related System/), 'sys-laptop')
    await user.click(screen.getByRole('radio', { name: 'High' }))

    submitTwiceInOneTick(screen.getByRole('button', { name: /create ticket/i }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/tickets']))
  })

  it('Public Comment', async () => {
    const user = userEvent.setup()
    const writes = stubFetch()
    render(
      <MemoryRouter>
        <AuthStub user={JENNIFER}>
          <CommentsPanel ticketId="t-1" canComment />
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText('Add public comment'), 'Still happening this morning.')

    submitTwiceInOneTick(screen.getByRole('button', { name: 'Post Comment' }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/tickets/t-1/comments']))
  })

  it('Create User', async () => {
    const user = userEvent.setup()
    const writes = stubFetch({
      '/api/admin/users': { data: [], pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 } },
    })
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AuthStub user={ADMIN}>
          <UserManagement />
        </AuthStub>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Create User' }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/full name/i), 'Dara Suksan')
    await user.type(within(panel).getByLabelText(/email address/i), 'dara.suksan@kmutt.ac.th')
    await user.selectOptions(within(panel).getByLabelText(/^role/i), 'ITStaff')
    await user.type(within(panel).getByLabelText(/^initial password/i), 'Welcome123!')

    submitTwiceInOneTick(within(panel).getByRole('button', { name: 'Save User' }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/admin/users']))
  })
})

/** One directory row, as GET /api/admin/users answers it. */
const DARA = {
  id: 'u-dara',
  name: 'Dara Suksan',
  email: 'dara.suksan@kmutt.ac.th',
  department: null,
  role: 'ITStaff',
  isActive: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

function renderUsers() {
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthStub user={ADMIN}>
        <UserManagement />
      </AuthStub>
    </MemoryRouter>,
  )
}

describe('one request for two same-tick submits — more forms (Issue #57 review)', () => {
  it('Edit User (Save Changes)', async () => {
    const user = userEvent.setup()
    const writes = stubFetch({ '/api/admin/users': { data: [DARA] } })
    renderUsers()
    await user.click(await screen.findByRole('button', { name: 'Edit Dara Suksan' }))
    const panel = screen.getByTestId('user-panel')
    await user.clear(within(panel).getByLabelText(/full name/i))
    await user.type(within(panel).getByLabelText(/full name/i), 'Dara S.')

    submitTwiceInOneTick(within(panel).getByRole('button', { name: 'Save Changes' }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['PATCH /api/admin/users/u-dara']))
  })

  it('Set Initial Password', async () => {
    const user = userEvent.setup()
    const writes = stubFetch({ '/api/admin/users': { data: [DARA] } })
    renderUsers()
    await user.click(await screen.findByRole('button', { name: 'Edit Dara Suksan' }))
    const panel = screen.getByTestId('user-panel')
    await user.type(within(panel).getByLabelText(/^new initial password/i), 'Welcome456!')
    const button = within(panel).getByRole('button', { name: 'Set Initial Password' })

    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    await waitFor(() => expect(writes).toEqual(['POST /api/admin/users/u-dara/initial-password']))
  })

  it('Internal Note', async () => {
    const user = userEvent.setup()
    const writes = stubFetch()
    render(
      <MemoryRouter>
        <AuthStub user={PRIYA}>
          <InternalNotesPanel ticketId="t-1" canPost />
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText('Add internal note'), 'Vendor RMA 12345.')

    submitTwiceInOneTick(screen.getByRole('button', { name: 'Add Internal Note' }).closest('form')!)

    await waitFor(() => expect(writes).toEqual(['POST /api/staff/tickets/t-1/internal-notes']))
  })
})

describe('the guard is released after a failure, so the user can try again (Issue #57 review, AC-27)', () => {
  it('Login: a network failure, then a second Sign in is sent', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET').toUpperCase() === 'GET') return json({ data: [] })
        calls.push(String(input))
        if (fail) {
          fail = false
          return Promise.reject(new TypeError('Failed to fetch'))
        }
        return pending()
      }),
    )
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthStub value={authValue(null)}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email address/i), 'jennifer.anderson@kmutt.ac.th')
    await user.type(screen.getByLabelText(/^password/i), 'Requester1!')

    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(calls).toHaveLength(2))
    // The typed email survived the failure (AC-27).
    expect(screen.getByLabelText(/email address/i)).toHaveValue('jennifer.anderson@kmutt.ac.th')
  })

  it('Public Comment: a server error, then a second Post Comment is sent with the text kept', async () => {
    const user = userEvent.setup()
    let posts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET').toUpperCase() === 'GET') return json({ data: [] })
        posts += 1
        return posts === 1
          ? json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, 500)
          : pending()
      }),
    )
    render(
      <MemoryRouter>
        <AuthStub user={JENNIFER}>
          <CommentsPanel ticketId="t-1" canComment />
        </AuthStub>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText('Add public comment'), 'Still happening.')

    await user.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.getByLabelText('Add public comment')).toHaveValue('Still happening.')
    await user.click(screen.getByRole('button', { name: 'Post Comment' }))

    await waitFor(() => expect(posts).toBe(2))
  })
})
