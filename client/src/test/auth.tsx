import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthContext } from '../context/auth'
import type { AuthContextValue, SessionUser } from '../context/auth'

/**
 * Test fixtures for the auth context (UI-20). Components under test get a
 * ready, signed-in user without the provider's `GET /api/auth/me` round trip,
 * which keeps the fetch stubs in each suite about the screen being tested.
 */
export const JENNIFER: SessionUser = {
  id: 'r-1',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: false,
}

export const SARAH: SessionUser = {
  id: 'r-2',
  name: 'Sarah Johnson',
  email: 'sarah.johnson@kmutt.ac.th',
  role: 'Requester',
  mustChangePassword: true,
}

export const PRIYA: SessionUser = {
  id: 's-1',
  name: 'Priya Raman',
  email: 'priya.raman@kmutt.ac.th',
  role: 'ITStaff',
  mustChangePassword: false,
}

export const ADMIN: SessionUser = {
  id: 'a-1',
  name: 'System Administrator',
  email: 'admin@toktickit.xyz',
  role: 'Administrator',
  mustChangePassword: false,
}

export function authValue(user: SessionUser | null, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user,
    loading: false,
    loggedOut: false,
    setUser: vi.fn(),
    refresh: vi.fn().mockResolvedValue(user),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function AuthStub({ user, value, children }: { user?: SessionUser | null; value?: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value ?? authValue(user ?? null)}>{children}</AuthContext.Provider>
}
