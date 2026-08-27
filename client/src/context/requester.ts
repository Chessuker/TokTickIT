import { createContext, useContext } from 'react'

/**
 * Development Requester context (Issue #3 — FR-02, FR-06, BR-03, BR-13).
 *
 * This is a simulated identity for development and testing only: no password,
 * no session, no role. Real authentication arrives in Lab 3 and replaces this
 * context wholesale.
 *
 * The context object, its types and its hook live here rather than beside the
 * provider component so the provider file exports components only and stays
 * fast-refresh friendly.
 */
export interface Requester {
  id: string
  name: string
  email: string
  department: string | null
}

export interface RequesterContextValue {
  /** The currently selected requester, or null when none has been chosen. */
  requester: Requester | null
  /** Selects a requester and persists it for the rest of the browser session. */
  selectRequester: (requester: Requester) => void
  /** Clears the selection so the guard sends the user back to the selector. */
  clearRequester: () => void
}

/**
 * Session storage, not local storage: the simulated identity should not
 * outlive the browser session, and two tabs can act as two requesters.
 */
export const REQUESTER_STORAGE_KEY = 'toktickit.requester'

export const RequesterContext = createContext<RequesterContextValue | null>(null)

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext)
  if (!context) {
    throw new Error('useRequester must be used within a RequesterProvider')
  }
  return context
}
