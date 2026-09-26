import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../apiClient'
import { AuthContext } from './auth'
import type { AuthContextValue, SessionUser } from './auth'

/**
 * Holds the signed-in user for the whole app (ui-spec.md §3.0).
 *
 * Nothing is persisted on the client: the cookie is httpOnly, so the only way
 * to know who the caller is, is to ask the server. The provider does that once
 * on mount and again whenever a guard asks it to; login and change-password
 * push their responses in through `setUser` so the shell updates immediately.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)

  const setUser = useCallback((next: SessionUser | null) => {
    setUserState(next)
    if (next) setLoggedOut(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me')
      const next = res.ok ? ((await res.json()) as SessionUser) : null
      setUser(next)
      return next
    } catch {
      // The server is unreachable: treat the caller as signed out. The Login
      // screen shows the safe-failure state when they try to sign in.
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [setUser])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the server could not be reached the client forgets the user;
      // the cookie is gone or dead either way on the next guarded request.
    } finally {
      setUserState(null)
      setLoggedOut(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, loggedOut, setUser, refresh, logout }),
    [user, loading, loggedOut, setUser, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
