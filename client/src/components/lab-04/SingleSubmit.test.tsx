import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CreateTicketForm from '../CreateTicketForm'
import Login from '../lab-03/Login'
import ChangePassword from '../lab-03/ChangePassword'
import CommentsPanel from '../lab-03/CommentsPanel'
import UserManagement from '../lab-03/UserManagement'
import { useSingleFlight } from '../../useSingleFlight'
import { AuthStub, ADMIN, JENNIFER, SARAH, authValue } from '../../test/auth'

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
