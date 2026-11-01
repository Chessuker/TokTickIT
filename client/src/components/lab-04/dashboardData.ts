import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, readApiError } from '../../apiClient'

/**
 * The non-component half of the dashboards (Lab 4 ui-spec.md §1.3, §1.4,
 * §3.1, §3.2): the response types, the data hook and the wording helpers.
 * Kept apart from `DashboardParts.tsx` so that file exports components only
 * (fast refresh), as `ticketStatus.ts` does for the badges.
 */

export interface Metric {
  count: number
  href: string
}

/** api-spec.md §2 `DashboardTicket`. */
export interface DashboardTicket {
  id: string
  ticketNumber: string
  summary: string
  status: string
  itPriority: string
  updatedAt: string
  resolvedAt: string | null
}

export type DashboardFailure = { kind: 'forbidden' | 'failed'; message: string }

/**
 * Loads one dashboard endpoint. `refresh` keeps the numbers on screen while
 * the new ones load (ui-spec.md §3.1 "Refresh"), and only the newest request
 * may write, so a slow first load cannot overwrite a fast refresh.
 */
export function useDashboard<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<DashboardFailure | null>(null)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const request = requestRef.current + 1
    requestRef.current = request
    setLoading(true)
    setFailure(null)

    try {
      const res = await apiFetch(path)
      if (requestRef.current !== request) return
      if (!res.ok) {
        const error = await readApiError(res)
        setFailure(
          res.status === 403
            ? { kind: 'forbidden', message: error?.message ?? "You don't have access to this dashboard." }
            : { kind: 'failed', message: error?.message ?? 'Something went wrong. Please try again.' },
        )
        return
      }
      setData((await res.json()) as T)
    } catch {
      if (requestRef.current === request) {
        setFailure({ kind: 'failed', message: 'Could not reach the server. Please check your connection and try again.' })
      }
    } finally {
      if (requestRef.current === request) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, failure, refresh: load }
}

/** "Waiting for you: 1 ticket" — singular and plural spelled out (ui-spec.md §1.3). */
export function countNoun(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`
}

export function firstName(name: string | undefined): string {
  return name?.split(/\s+/)[0] ?? ''
}

export function ticketRowLabel(ticket: DashboardTicket): string {
  return `${ticket.ticketNumber}: ${ticket.summary}`
}
