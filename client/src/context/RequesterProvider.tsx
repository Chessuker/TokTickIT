import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { RequesterContext, REQUESTER_STORAGE_KEY } from './requester'
import type { Requester, RequesterContextValue } from './requester'

function isRequester(value: unknown): value is Requester {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}

/** Reads the stored requester, tolerating absent, blocked or corrupt storage. */
function readStoredRequester(): Requester | null {
  try {
    const raw = window.sessionStorage.getItem(REQUESTER_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isRequester(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Holds the selected Development Requester and mirrors it into session storage
 * so a reload does not bounce the user back to the selector.
 */
export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(readStoredRequester)

  useEffect(() => {
    try {
      if (requester) {
        window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
      } else {
        window.sessionStorage.removeItem(REQUESTER_STORAGE_KEY)
      }
    } catch {
      // A blocked storage API must not break the app; the selection simply
      // does not survive a reload.
    }
  }, [requester])

  const selectRequester = useCallback((next: Requester) => setRequester(next), [])
  const clearRequester = useCallback(() => setRequester(null), [])

  const value = useMemo<RequesterContextValue>(
    () => ({ requester, selectRequester, clearRequester }),
    [requester, selectRequester, clearRequester],
  )

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>
}
