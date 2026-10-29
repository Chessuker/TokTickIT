import { useCallback, useEffect, useState } from 'react'
import { apiFetch, readApiError } from '../../apiClient'
import type { Role } from '../../context/auth'
import { RoleBadge, StatusBadge } from '../Badges'
import { formatBangkok } from './dates'

/**
 * Status history (Lab 4 ui-spec.md §3.5; api-spec.md §3.5; FR-06, BR-18,
 * AC-16, AD-12).
 *
 * A read-only timeline, oldest first. The first row ("Created") is not stored:
 * it is drawn from the ticket's `createdAt` and Requester, which the endpoint
 * returns for exactly this purpose. There are no controls of any kind, because
 * there is no route that could change a row.
 *
 * `refreshKey` is the ticket's `version`: every status change bumps it, so the
 * Staff Ticket Detail re-reads the history after a change without a reload
 * (AC-14). `collapsible` is the Requester's variant, closed by default and
 * loaded only when opened (ui-spec.md §3.6).
 */

interface UserRef {
  id: string
  name: string
  role: Role
}

export interface StatusChange {
  id: string
  fromStatus: string
  toStatus: string
  createdAt: string
  changedBy: UserRef
}

interface HistoryBody {
  createdAt: string
  createdBy: UserRef
  data: StatusChange[]
}

export interface TicketHistoryProps {
  ticketId: string
  /** Decides whether an empty history is a legacy ticket or simply a new one. */
  ticketStatus: string
  refreshKey?: number
  collapsible?: boolean
}

/** Why the history did not load; only `failed` is worth a Retry (L3 ui-spec.md §2). */
interface LoadFailure {
  kind: 'refused' | 'failed'
  message: string
}

function Timeline({ ticketId, ticketStatus, refreshKey }: Omit<TicketHistoryProps, 'collapsible'>) {
  const [history, setHistory] = useState<HistoryBody | null>(null)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/history`)
      if (!res.ok) {
        const error = await readApiError(res)
        const refused = res.status === 403 || res.status === 404
        if (refused) setHistory(null)
        setFailure({
          kind: refused ? 'refused' : 'failed',
          message: error?.message ?? (refused ? "You don't have access to this history." : 'Something went wrong. Please try again.'),
        })
        return
      }
      setHistory((await res.json()) as HistoryBody)
      setFailure(null)
    } catch {
      setFailure({ kind: 'failed', message: 'Could not reach the server. Please check your connection and try again.' })
    }
  }, [ticketId])

  useEffect(() => {
    void load()
  }, [load, refreshKey, retryToken])

  if (failure) {
    return (
      <div className="zg-callout zg-callout-error" role="alert" data-testid="history-error">
        <span aria-hidden="true">⚠️</span>
        <div>
          {failure.message}{' '}
          {failure.kind === 'failed' && (
            <button type="button" className="zg-link-button" onClick={() => setRetryToken((token) => token + 1)}>
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!history) {
    return (
      <div className="zg-loading" role="status">
        <span className="zg-spinner" aria-hidden="true" />
        Loading history...
      </div>
    )
  }

  // Every change since Lab 4 writes a row, so a ticket that has moved on from
  // New without one predates the history (ui-spec.md §3.5 "Legacy").
  const legacy = history.data.length === 0 && ticketStatus !== 'New'

  return (
    <ol className="zg-history" data-testid="history-list">
      <li className="zg-history-row" data-testid="history-created">
        <span className="zg-history-dot" aria-hidden="true" />
        <div className="zg-history-body">
          <div className="zg-history-change">
            <strong>Created</strong> by {history.createdBy.name} <RoleBadge role={history.createdBy.role} />
          </div>
          <time className="zg-history-time" dateTime={history.createdAt}>
            {formatBangkok(history.createdAt)}
          </time>
          {legacy && (
            <p className="zg-muted zg-history-legacy" data-testid="history-legacy">
              Status history is recorded from Lab 4 onward.
            </p>
          )}
        </div>
      </li>
      {history.data.map((change) => (
        <li key={change.id} className="zg-history-row" data-testid="history-row">
          <span className="zg-history-dot" aria-hidden="true" />
          <div className="zg-history-body">
            <div className="zg-history-change">
              <StatusBadge status={change.fromStatus} />
              <span className="zg-history-arrow">
                <i className="bi bi-arrow-right" aria-hidden="true" />
                <span className="visually-hidden">to</span>
              </span>
              <StatusBadge status={change.toStatus} />
            </div>
            <div className="zg-history-meta">
              {change.changedBy.name} <RoleBadge role={change.changedBy.role} />
            </div>
            <time className="zg-history-time" dateTime={change.createdAt}>
              {formatBangkok(change.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}

function TicketHistory({ collapsible = false, ...props }: TicketHistoryProps) {
  const [open, setOpen] = useState(!collapsible)

  if (!collapsible) {
    return (
      <section className="zg-thread" aria-labelledby="history-heading" data-testid="ticket-history">
        <h2 className="zg-section-title" id="history-heading">
          <i className="bi bi-clock-history" aria-hidden="true" /> Status history
        </h2>
        <Timeline {...props} />
      </section>
    )
  }

  return (
    <section className="zg-card" data-testid="ticket-history">
      <h2 className="zg-section-title mb-0">
        <button
          type="button"
          className="zg-disclosure"
          aria-expanded={open}
          aria-controls="history-panel"
          onClick={() => setOpen((current) => !current)}
        >
          <i className={open ? 'bi bi-chevron-down' : 'bi bi-chevron-right'} aria-hidden="true" />{' '}
          <i className="bi bi-clock-history" aria-hidden="true" /> Status history
        </button>
      </h2>
      <div id="history-panel" hidden={!open} className="mt-3">
        {open && <Timeline {...props} />}
      </div>
    </section>
  )
}

export default TicketHistory
