import { createContext, useContext } from 'react'

/**
 * Authenticated user context (Lab 3 FR-01 … FR-03).
 *
 * Replaces the Lab 2 Development Requester context wholesale: the identity
 * comes from the server's session cookie via `GET /api/auth/me`, never from
 * anything the client stores. The context object, its types and its hook live
 * here so the provider file exports components only and stays
 * fast-refresh friendly.
 */
export type Role = 'Requester' | 'ITStaff' | 'Administrator'

/** `SessionUser` as api-spec.md §2 defines it. */
export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
}

export interface AuthContextValue {
  /** The signed-in user, or null when there is no valid session. */
  user: SessionUser | null
  /** True until the first `GET /api/auth/me` has answered. */
  loading: boolean
  /**
   * True right after `logout()` until the next sign-in. The route guard uses
   * it to send the user to a plain `/login` instead of `/login?from=…`: a
   * deliberate logout is not an interrupted visit to return to.
   */
  loggedOut: boolean
  /** Replaces the user after login or a password change. */
  setUser: (user: SessionUser | null) => void
  /** Re-asks the server who the caller is (used by route guards). */
  refresh: () => Promise<SessionUser | null>
  /** Ends the session on the server and clears the client state. */
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
