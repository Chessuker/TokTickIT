import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import { AuthStub, JENNIFER, PRIYA, ADMIN, SARAH, authValue } from '../../test/auth'
import type { AuthContextValue } from '../../context/auth'

/**
 * UI-09 — the route guard (AC-02, AC-08, AC-11).
 */

function ShowLocation({ label }: { label: string }) {
  const location = useLocation()
  return (
    <h1>
      {label} @ {location.pathname}
      {location.search}
    </h1>
  )
}

const loaded = vi.fn()

function Probe({ label }: { label: string }) {
  loaded()
  return <h1>{label}</h1>
}

function renderGuarded(value: AuthContextValue, initialPath: string) {
  loaded.mockClear()
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthStub value={value}>
        <Routes>
          <Route path="/login" element={<ShowLocation label="Login" />} />
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<Probe label="Change Your Password" />} />
          </Route>
          <Route element={<RequireAuth roles={['Requester']} />}>
            <Route path="/tickets" element={<Probe label="My Tickets" />} />
            <Route path="/tickets/new" element={<Probe label="Create Ticket" />} />
          </Route>
          <Route element={<RequireAuth roles={['ITStaff', 'Administrator']} />}>
            <Route path="/staff/queue" element={<Probe label="Ticket Queue" />} />
          </Route>
          <Route element={<RequireAuth roles={['Administrator']} />}>
            <Route path="/admin/users" element={<Probe label="Users" />} />
          </Route>
        </Routes>
      </AuthStub>
    </MemoryRouter>,
  )
}

describe('RequireAuth (UI-09)', () => {
  it('shows a loading state and nothing else until the session check answers', () => {
    renderGuarded(authValue(null, { loading: true }), '/tickets')

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(loaded).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to /login with the attempted path in from (AC-08)', () => {
    renderGuarded(authValue(null), '/tickets/new?draft=1')

    expect(screen.getByRole('heading')).toHaveTextContent('Login @ /login?from=%2Ftickets%2Fnew%3Fdraft%3D1')
    expect(loaded).not.toHaveBeenCalled()
  })

  it('lets a signed-in user through to a route for their role', () => {
    renderGuarded(authValue(JENNIFER), '/tickets')

    expect(screen.getByRole('heading', { name: /my tickets/i })).toBeInTheDocument()
  })

  it('sends a user with mustChangePassword to /change-password from any other route (AC-02)', () => {
    renderGuarded(authValue(SARAH), '/tickets')

    expect(screen.getByRole('heading', { name: /change your password/i })).toBeInTheDocument()
    expect(loaded).toHaveBeenCalledTimes(1)
  })

  it('lets a user with mustChangePassword reach /change-password itself', () => {
    renderGuarded(authValue(SARAH), '/change-password')

    expect(screen.getByRole('heading', { name: /change your password/i })).toBeInTheDocument()
  })

  it.each([
    ['Requester → /staff/queue', JENNIFER, '/staff/queue'],
    ['Requester → /admin/users', JENNIFER, '/admin/users'],
    ['IT Staff → /admin/users', PRIYA, '/admin/users'],
    ['IT Staff → /tickets', PRIYA, '/tickets'],
    ['Administrator → /tickets', ADMIN, '/tickets'],
  ])('renders the Forbidden state without loading the screen: %s (AC-11)', (_label, user, path) => {
    renderGuarded(authValue(user), path)

    expect(screen.getByRole('alert')).toHaveTextContent(/you don't have access to this page/i)
    expect(screen.getByRole('link', { name: /go to your home/i })).toBeInTheDocument()
    expect(loaded).not.toHaveBeenCalled()
  })

  it('points the Forbidden state at the role home', () => {
    renderGuarded(authValue(PRIYA), '/admin/users')
    expect(screen.getByRole('link', { name: /go to your home/i })).toHaveAttribute('href', '/staff/queue')
  })

  it('lets an Administrator into the shared staff area', () => {
    renderGuarded(authValue(ADMIN), '/staff/queue')

    expect(screen.getByRole('heading', { name: /ticket queue/i })).toBeInTheDocument()
  })
})
