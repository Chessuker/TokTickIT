import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiFetch, apiJson, readApiError } from '../../apiClient'
import { useAuth } from '../../context/auth'
import { formatBytes } from '../../attachments'
import {
  ItPriorityBadge,
  OwnerName,
  PriorityBadge,
  RequesterResolvedBadge,
  StatusBadge,
} from '../Badges'
import { statusLabel } from '../../ticketStatus'
import CommentsPanel from './CommentsPanel'
import InternalNotesPanel from './InternalNotesPanel'
import ActionsTaken from '../lab-04/ActionsTaken'
import TicketHistory from '../lab-04/TicketHistory'
import { formatBangkok } from '../lab-04/dates'

/**
 * IT Staff Ticket Detail (ui-spec.md §3.5, api-spec.md §3.10, §3.12 – §3.17 —
 * FR-09 … FR-12, AC-18 … AC-24).
 *
 * Three rules shape this screen:
 *
 * 1. The server owns the workflow (BR-18, BR-19). The status control offers
 *    exactly `permittedTransitions` from the API plus the current value, so
 *    the matrix is never restated here; a `409` is still handled, because the
 *    ticket can move under a screen that has been open for a while.
 * 2. Every operational control writes one field (api-spec.md §3.12 – §3.15).
 *    Each saves on change with its own busy state and its own inline conflict,
 *    so a refused status change does not blank the owner the user just set.
 * 3. An Administrator sees the same screen with the controls rendered as
 *    values (BR-17). Not disabled inputs — values, because there is nothing
 *    to enable.
 *
 * Lab 4 (Issue #55, ui-spec.md §3.4, §3.5) adds three things on top:
 *
 * - Every operation sends the `version` it was based on. A `409 STALE_UPDATE`
 *   keeps the user's choice on screen and offers Reload instead of reverting
 *   silently (AC-17).
 * - While the resolution gate is closed, the server leaves Resolved out of
 *   `permittedTransitions`; the screen says which conditions are missing and
 *   links to the place to fix each (AC-12). Recording an Action re-reads the
 *   ticket, so the gate follows the work without a page reload.
 * - A History tab, re-read whenever the ticket's version moves (AC-14, AC-16).
 */

interface UserRef {
  id: string
  name: string
  role: string
}

interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  isRemoved: boolean
  removedReason: string | null
  removedAt: string | null
  downloadUrl: string | null
}

interface StaffTicketDetailData {
  id: string
  ticketNumber: string
  summary: string
  description: string
  status: string
  requestedPriority: string
  itPriority: string
  category: { id: string; name: string } | null
  relatedSystem: { id: string; name: string } | null
  requester: { id: string; name: string; email: string; department: string | null; role: string }
  owner: UserRef | null
  requesterResolvedAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  attachments: Attachment[]
  counts: { comments: number; internalNotes: number; attachments: number; actions?: number; openFollowUps?: number }
  permittedTransitions: string[]
  createdAt: string
  updatedAt: string
  /** Lab 4 (BR-19): sent back as `expectedVersion` with every operation. */
  version?: number
  /** Lab 4 (BR-14): why Resolved is missing from `permittedTransitions`. */
  resolutionGate?: { ok: boolean; unmet: GateCondition[]; reopenedAt: string | null }
}

type GateCondition = 'OWNER' | 'ACTION_SINCE_REOPEN' | 'OPEN_FOLLOW_UPS'

interface Assignee {
  id: string
  name: string
}

interface LoadFailure {
  status: number
  message: string
}

/** Which control is mid-flight, so only that one shows a busy state. */
type Control = 'owner' | 'itPriority' | 'status' | null

/** A pending change waiting for the user to confirm it (ui-spec.md §2). */
interface Confirmation {
  title: string
  message: string
  /** Rendered with the error fill for the destructive ones. */
  danger?: boolean
  run: () => Promise<SaveOutcome>
}

/** What one operation came back with, so a confirmation dialog knows whether to close. */
type SaveOutcome = 'ok' | 'stale' | 'error'

const IT_PRIORITIES = ['Low', 'Medium', 'High'] as const
// Actions Taken is first and the default (Lab 4 ui-spec.md §3.3); History last (§3.5).
const TABS = ['actions', 'comments', 'notes', 'attachments', 'history'] as const
type Tab = (typeof TABS)[number]

/** Status targets the spec asks the UI to confirm before sending (BR-18 ⚠). */
const CONFIRMED_TARGETS = ['Resolved', 'Closed', 'Cancelled']

/**
 * The statuses from which the matrix leads to Resolved (Lab 4 specification.md
 * §5). Used only to decide whether the gate hint is relevant; the server still
 * decides what is permitted.
 */
const RESOLVABLE_FROM = ['Open', 'InProgress', 'WaitingForRequester', 'Reopened']

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** One read-only row of the ticket (ui-spec.md §3.5 "Read-only group"). */
function ReadOnlyField({
  label,
  children,
  wide = false,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? 'zg-detail-item zg-detail-item-wide' : 'zg-detail-item'}>
      <dt className="zg-detail-label">{label}</dt>
      <dd className="zg-detail-value">{children}</dd>
    </div>
  )
}

function StaffTicketDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const location = useLocation()

  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null)
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [busy, setBusy] = useState<Control>(null)
  const [controlError, setControlError] = useState<{ control: Control; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  /** The change the server refused as stale, still shown in its control (AC-17). */
  const [stale, setStale] = useState<{ control: Exclude<Control, null>; value: string } | null>(null)
  const [reloading, setReloading] = useState(false)

  const [tab, setTab] = useState<Tab>(() => (location.hash === '#comments' ? 'comments' : 'actions'))
  const [actionCount, setActionCount] = useState<number | null>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    actions: null,
    comments: null,
    notes: null,
    attachments: null,
    history: null,
  })
  const ownerSelectRef = useRef<HTMLSelectElement | null>(null)
  const staleReloadRef = useRef<HTMLButtonElement | null>(null)

  /** The version every operation is based on: the one on screen right now. */
  const versionRef = useRef<number | undefined>(undefined)
  versionRef.current = ticket?.version

  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const isStaff = user?.role === 'ITStaff'

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setFailure(null)

    apiFetch(`/api/staff/tickets/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (cancelled) return

        if (!res.ok) {
          setTicket(null)
          setFailure({
            status: res.status,
            message: body?.error?.message ?? 'The ticket could not be loaded.',
          })
          return
        }

        setTicket(body as StaffTicketDetailData)
      })
      .catch(() => {
        if (cancelled) return
        setTicket(null)
        setFailure({
          status: 0,
          message: 'Could not reach the server. Please check your connection and try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, reloadToken])

  useEffect(() => {
    if (!isStaff) return
    let cancelled = false

    apiFetch('/api/staff/assignees')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setAssignees(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        // The owner control degrades to the current value plus Unassigned;
        // Claim still works, because it needs no list.
        if (!cancelled) setAssignees([])
      })

    return () => {
      cancelled = true
    }
  }, [isStaff])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  /**
   * Re-reads the ticket without the full-screen loading state, so the gate,
   * the counts and the version follow an Action or a stale Reload while the
   * user stays where they are. A failure keeps the copy on screen.
   */
  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/staff/tickets/${id}`)
      if (res.ok) setTicket((await res.json()) as StaffTicketDetailData)
    } catch {
      // The next operation will report the outage against its own control.
    }
  }, [id])

  /**
   * Sends one operational change and replaces the ticket with the server's
   * answer, so `permittedTransitions`, the timestamps and the counts all come
   * from the same read. A `409` leaves the ticket untouched and reports
   * against the control that caused it, which is what makes the select snap
   * back to the real value (ui-spec.md §3.5). `STALE_UPDATE` is the exception:
   * the user's choice stays in the control and the stale callout offers Reload
   * (Lab 4 ui-spec.md §2, §3.4).
   */
  const save = useCallback(
    async (
      control: Exclude<Control, null>,
      path: string,
      method: string,
      body: Record<string, unknown>,
      value: string,
    ): Promise<SaveOutcome> => {
      setBusy(control)
      setControlError(null)
      setNotice(null)
      setStale(null)

      try {
        const res = await apiJson(`/api/staff/tickets/${id}${path}`, method, {
          ...body,
          ...(versionRef.current !== undefined ? { expectedVersion: versionRef.current } : {}),
        })

        if (res.ok) {
          setTicket((await res.json()) as StaffTicketDetailData)
          return 'ok'
        }

        const error = await readApiError(res)

        if (res.status === 409 && error?.code === 'STALE_UPDATE') {
          setStale({ control, value })
          return 'stale'
        }

        const fieldMessage = error?.fields ? Object.values(error.fields)[0] : undefined
        setControlError({
          control,
          message: fieldMessage ?? error?.message ?? 'The change could not be saved.',
        })

        // The gate closed under the screen (someone opened a follow-up, say):
        // re-read it so the hint and the status choices match the refusal.
        if (res.status === 409 && error?.code === 'RESOLUTION_BLOCKED') void refresh()
        if (res.status === 404) setFailure({ status: 404, message: 'Ticket not found.' })
        return 'error'
      } catch {
        setControlError({ control, message: 'Could not reach the server. The change was not saved.' })
        return 'error'
      } finally {
        setBusy(null)
      }
    },
    [id, refresh],
  )

  useEffect(() => {
    if (stale) staleReloadRef.current?.focus()
  }, [stale])

  const reloadAfterStale = async () => {
    setReloading(true)
    await refresh()
    setReloading(false)
    setStale(null)
  }

  const claim = () => void save('owner', '/claim', 'POST', {}, user?.id ?? '')

  const changeOwner = (ownerId: string) => {
    const next = ownerId === '' ? null : ownerId
    const target = assignees.find((assignee) => assignee.id === next)

    // Reassigning a ticket that already belongs to somebody else takes work
    // away from them, so it is confirmed first (ui-spec.md §3.5).
    if (ticket?.owner && next !== null && next !== ticket.owner.id) {
      setConfirmation({
        title: 'Reassign this ticket?',
        message: `${ticket.owner.name} is the current owner. ${target?.name ?? 'The new owner'} will take it over.`,
        run: () => save('owner', '/owner', 'PATCH', { ownerId: next }, ownerId),
      })
      return
    }

    void save('owner', '/owner', 'PATCH', { ownerId: next }, ownerId)
  }

  const changeItPriority = (itPriority: string) =>
    void save('itPriority', '/it-priority', 'PATCH', { itPriority }, itPriority)

  const changeStatus = (status: string) => {
    if (CONFIRMED_TARGETS.includes(status)) {
      const openFollowUps = ticket?.counts.openFollowUps ?? 0
      const followUpLine =
        status === 'Cancelled' && openFollowUps > 0
          ? ` ${openFollowUps} open follow-up${openFollowUps === 1 ? '' : 's'} will be cancelled.`
          : ''

      setConfirmation({
        title: `Mark as ${statusLabel(status)}?`,
        message:
          status === 'Cancelled'
            ? `The ticket is closed to further work and the requester will see it as cancelled.${followUpLine}`
            : `The ticket moves to ${statusLabel(status)} and the requester will see the new status.`,
        danger: status === 'Cancelled',
        run: () => save('status', '/status', 'PATCH', { status }, status),
      })
      return
    }

    void save('status', '/status', 'PATCH', { status }, status)
  }

  const runConfirmation = async () => {
    if (!confirmation) return
    setConfirming(true)
    setConfirmError(null)

    const outcome = await confirmation.run()
    setConfirming(false)

    // A refusal stays in the dialog. A stale answer closes it: the stale
    // callout on the operations card is where the user decides what to do.
    if (outcome === 'error') {
      setControlError((current) => {
        if (current) setConfirmError(current.message)
        return current
      })
      return
    }
    setConfirmation(null)
  }

  /** The gate hint's links: each takes the user to the place to fix it (ui-spec.md §3.4). */
  const goToOwner = () => ownerSelectRef.current?.focus()
  const goToActions = () => {
    setTab('actions')
    tabRefs.current.actions?.focus()
  }

  /**
   * Downloads through `fetch` rather than a bare link so a refusal can be
   * shown inline instead of as a browser error page (Lab 2 behaviour, reused).
   */
  const download = async (attachment: Attachment) => {
    setDownloadError(null)
    setDownloadingId(attachment.id)

    try {
      const res = await apiFetch(`/api/attachments/${attachment.id}/download`)

      if (!res.ok) {
        const error = await readApiError(res)
        setDownloadError(error?.message ?? `${attachment.fileName} could not be downloaded.`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Could not reach the server. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  /** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump to the ends. */
  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.indexOf(tab)
    let next: Tab | null = null

    if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length]
    else if (event.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length]
    else if (event.key === 'Home') next = TABS[0]
    else if (event.key === 'End') next = TABS[TABS.length - 1]

    if (!next) return
    event.preventDefault()
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  /** Back to the queue with the filters the user left it on (ui-spec.md §3.5). */
  const queueSearch = (location.state as { queueSearch?: string } | null)?.queueSearch ?? ''

  if (loading) {
    return (
      <div className="zg-loading" role="status">
        <span className="zg-spinner" aria-hidden="true" />
        Loading ticket...
      </div>
    )
  }

  if (failure?.status === 404) {
    return (
      <div className="zg-card zg-state" data-testid="ticket-not-found" role="alert">
        <span className="zg-state-icon" aria-hidden="true">
          <i className="bi bi-search" />
        </span>
        <h1 className="zg-state-title">Ticket not found</h1>
        <p className="zg-state-text">No ticket exists with this reference.</p>
        <Link className="zg-btn zg-btn-primary" to={`/staff/queue${queueSearch}`}>
          Back to Queue
        </Link>
      </div>
    )
  }

  if (failure || !ticket) {
    return (
      <div className="zg-callout zg-callout-error" role="alert">
        <span aria-hidden="true">⚠️</span>
        <div>
          {failure?.message ?? 'The ticket could not be loaded.'}{' '}
          <button type="button" className="zg-link-button" onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const activeAttachments = ticket.attachments.filter((file) => !file.isRemoved)
  const removedAttachments = ticket.attachments.filter((file) => file.isRemoved)

  // The current value always stays in the list, so the select can show where
  // the ticket is even when the workflow offers no way back to it.
  const statusOptions = [ticket.status, ...ticket.permittedTransitions]

  const errorFor = (control: Control) =>
    controlError?.control === control ? controlError.message : null

  /** A stale control keeps showing what the user chose, marked as not saved. */
  const shown = (control: Exclude<Control, null>, current: string) =>
    stale?.control === control ? stale.value : current
  const staleClass = (control: Exclude<Control, null>) =>
    stale?.control === control ? 'zg-select is-stale' : 'zg-select'

  const gate = ticket.resolutionGate
  const showGateHint = isStaff && gate !== undefined && !gate.ok && RESOLVABLE_FROM.includes(ticket.status)
  const openFollowUps = ticket.counts.openFollowUps ?? 0

  return (
    <section>
      <div className="zg-page-head">
        <div>
          <p className="zg-breadcrumb">
            <Link to={`/staff/queue${queueSearch}`}>Queue</Link> / Ticket Detail
          </p>
          <h1 className="zg-title">{ticket.summary}</h1>
          <div className="zg-detail-headline">
            <span className="zg-ticket-number">{ticket.ticketNumber}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.requestedPriority} />
            <ItPriorityBadge priority={ticket.itPriority} />
            {ticket.requesterResolvedAt && <RequesterResolvedBadge at={ticket.requesterResolvedAt} />}
          </div>
        </div>
        <div className="zg-page-head-actions">
          <Link className="zg-btn zg-btn-secondary" to={`/staff/queue${queueSearch}`}>
            Back to Queue
          </Link>
        </div>
      </div>

      {/* Operational group — the only writable part of the screen (AC-18 … AC-22). */}
      <div className="zg-card" data-testid="operational-group">
        <h2 className="zg-section-title">Ticket operations</h2>

        {!isStaff && (
          <p className="zg-hint" data-testid="admin-readonly-note">
            Administrators can view but not change tickets.
          </p>
        )}

        {isStaff ? (
          <div className="zg-ops-grid">
            <div className="zg-field">
              <label className="zg-label" htmlFor="ticket-owner">
                Ticket Owner
              </label>
              <div className="zg-ops-control">
                <select
                  id="ticket-owner"
                  ref={ownerSelectRef}
                  className={staleClass('owner')}
                  value={shown('owner', ticket.owner?.id ?? '')}
                  disabled={busy !== null}
                  onChange={(event) => changeOwner(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {/* The current owner stays selectable even if deactivated. */}
                  {ticket.owner && !assignees.some((a) => a.id === ticket.owner?.id) && (
                    <option value={ticket.owner.id}>{ticket.owner.name}</option>
                  )}
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
                {ticket.owner?.id !== user?.id && (
                  <button
                    type="button"
                    className="zg-btn zg-btn-secondary zg-btn-sm"
                    onClick={claim}
                    disabled={busy !== null}
                  >
                    Claim
                  </button>
                )}
              </div>
              {busy === 'owner' && (
                <p className="zg-hint" role="status">
                  <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                </p>
              )}
              {errorFor('owner') && (
                <p className="zg-field-error" role="alert">
                  {errorFor('owner')}
                </p>
              )}
            </div>

            <div className="zg-field">
              <label className="zg-label" htmlFor="ticket-it-priority">
                IT Priority
              </label>
              <select
                id="ticket-it-priority"
                className={staleClass('itPriority')}
                value={shown('itPriority', ticket.itPriority)}
                disabled={busy !== null}
                onChange={(event) => changeItPriority(event.target.value)}
              >
                {IT_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              {busy === 'itPriority' && (
                <p className="zg-hint" role="status">
                  <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                </p>
              )}
              {errorFor('itPriority') && (
                <p className="zg-field-error" role="alert">
                  {errorFor('itPriority')}
                </p>
              )}
            </div>

            <div className="zg-field">
              <label className="zg-label" htmlFor="ticket-status">
                Current Status
              </label>
              <select
                id="ticket-status"
                className={staleClass('status')}
                value={shown('status', ticket.status)}
                aria-describedby={showGateHint ? 'resolution-gate-hint' : undefined}
                disabled={busy !== null}
                onChange={(event) => changeStatus(event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              {/*
               * The owner rule, restated as a hint rather than as a rule: the
               * API is the guard (AC-22), this only explains why the two
               * targets are missing from the list above.
               */}
              {!ticket.owner && (
                <p className="zg-hint" data-testid="owner-required-hint">
                  Assign an owner first to move this ticket to In Progress or Resolved.
                </p>
              )}
              {/*
               * Lab 4 BR-14: why Resolved is missing. One bullet per unmet
               * condition, each a link to where it is fixed (ui-spec.md §3.4).
               * Not an error — the ticket is fine, it just is not done yet.
               */}
              {showGateHint && gate && (
                <div className="zg-callout zg-callout-info zg-gate-hint" id="resolution-gate-hint" data-testid="resolution-gate-hint">
                  <i className="bi bi-info-circle" aria-hidden="true" />
                  <div>
                    <p className="mb-1">Resolve is unavailable until:</p>
                    <ul className="mb-0">
                      {gate.unmet.map((condition) => (
                        <li key={condition}>
                          {condition === 'OWNER' && (
                            <button type="button" className="zg-link-button" onClick={goToOwner}>
                              an owner is assigned
                            </button>
                          )}
                          {condition === 'ACTION_SINCE_REOPEN' && (
                            <button type="button" className="zg-link-button" onClick={goToActions}>
                              {gate.reopenedAt
                                ? 'at least one action is recorded since the ticket was reopened'
                                : 'at least one action is recorded'}
                            </button>
                          )}
                          {condition === 'OPEN_FOLLOW_UPS' && (
                            <button type="button" className="zg-link-button" onClick={goToActions}>
                              {openFollowUps} open follow-up{openFollowUps === 1 ? ' is' : 's are'} completed or cancelled
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {busy === 'status' && (
                <p className="zg-hint" role="status">
                  <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                </p>
              )}
              {errorFor('status') && (
                <p className="zg-field-error" role="alert">
                  {errorFor('status')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <dl className="zg-detail-grid" data-testid="operational-readonly">
            <ReadOnlyField label="Ticket Owner">
              <OwnerName owner={ticket.owner} />
            </ReadOnlyField>
            <ReadOnlyField label="IT Priority">
              <ItPriorityBadge priority={ticket.itPriority} />
            </ReadOnlyField>
            <ReadOnlyField label="Current Status">
              <StatusBadge status={ticket.status} />
            </ReadOnlyField>
          </dl>
        )}

        {stale && (
          <div className="zg-callout zg-callout-warning mt-3" role="alert" data-testid="stale-callout">
            <span aria-hidden="true">⚠️</span>
            <div>
              <p className="mb-2">
                Someone else changed this ticket after you opened it. Reload to see the latest version. Your
                change was not saved.
              </p>
              <button
                type="button"
                ref={staleReloadRef}
                className="zg-btn zg-btn-primary zg-btn-sm"
                onClick={() => void reloadAfterStale()}
                disabled={reloading}
              >
                {reloading ? 'Reloading...' : 'Reload'}
              </button>
            </div>
          </div>
        )}

        {ticket.requesterResolvedAt && RESOLVABLE_FROM.includes(ticket.status) && (
          <p className="zg-hint mt-3" data-testid="requester-resolved-note">
            Requester reports resolved on {formatBangkok(ticket.requesterResolvedAt)} — review the actions before
            resolving.
          </p>
        )}

        {notice && (
          <p className="zg-callout zg-callout-success" role="status">
            {notice}
          </p>
        )}
      </div>

      <div className="zg-card mt-3">
        <h2 className="zg-section-title">Ticket details</h2>
        <dl className="zg-detail-grid" data-testid="ticket-fields">
          <ReadOnlyField label="Ticket No.">
            <span className="zg-ticket-number">{ticket.ticketNumber}</span>
          </ReadOnlyField>
          <ReadOnlyField label="Category">{ticket.category?.name ?? 'Uncategorised'}</ReadOnlyField>
          <ReadOnlyField label="Related System">
            {ticket.relatedSystem?.name ?? 'Not specified'}
          </ReadOnlyField>
          <ReadOnlyField label="Requested Priority">
            <PriorityBadge priority={ticket.requestedPriority} />
          </ReadOnlyField>
          <ReadOnlyField label="Requester">
            {ticket.requester.name}
            <span className="zg-muted"> · {ticket.requester.email}</span>
            {ticket.requester.department ? (
              <span className="zg-muted"> · {ticket.requester.department}</span>
            ) : null}
          </ReadOnlyField>
          <ReadOnlyField label="Created">{formatDateTime(ticket.createdAt)}</ReadOnlyField>
          <ReadOnlyField label="Updated">{formatDateTime(ticket.updatedAt)}</ReadOnlyField>
          {ticket.resolvedAt && (
            <ReadOnlyField label="Resolved">{formatDateTime(ticket.resolvedAt)}</ReadOnlyField>
          )}
          {ticket.closedAt && (
            <ReadOnlyField label="Closed">{formatDateTime(ticket.closedAt)}</ReadOnlyField>
          )}
          <ReadOnlyField label="Summary" wide>
            {ticket.summary}
          </ReadOnlyField>
          <ReadOnlyField label="Description" wide>
            <p className="zg-detail-description">{ticket.description}</p>
          </ReadOnlyField>
        </dl>
      </div>

      <div className="zg-card mt-3">
        <div className="zg-tabs" role="tablist" aria-label="Ticket activity" onKeyDown={onTabKeyDown}>
          {(
            [
              [
                'actions',
                (actionCount ?? ticket.counts.actions) === undefined
                  ? 'Actions Taken'
                  : `Actions Taken (${actionCount ?? ticket.counts.actions})`,
              ],
              ['comments', `Public Comments (${ticket.counts.comments})`],
              ['notes', `Internal Notes (${ticket.counts.internalNotes})`],
              ['attachments', `Attachments (${ticket.counts.attachments})`],
              ['history', 'History'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              className={tab === value ? 'zg-tab is-active' : 'zg-tab'}
              ref={(element) => {
                tabRefs.current[value] = element
              }}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-actions" aria-labelledby="tab-actions" hidden={tab !== 'actions'}>
          {tab === 'actions' && (
            <ActionsTaken
              ticketId={ticket.id}
              ticketStatus={ticket.status}
              ticketCreatedAt={ticket.createdAt}
              ownerId={ticket.owner?.id ?? null}
              mode="staff"
              onCountChange={setActionCount}
              onLocked={reload}
              onChanged={() => void refresh()}
            />
          )}
        </div>

        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={tab !== 'history'}>
          {tab === 'history' && (
            <TicketHistory ticketId={ticket.id} ticketStatus={ticket.status} refreshKey={ticket.version} />
          )}
        </div>

        <div role="tabpanel" id="panel-comments" aria-labelledby="tab-comments" hidden={tab !== 'comments'}>
          {tab === 'comments' && (
            <CommentsPanel ticketId={ticket.id} canComment={isStaff} onPosted={reload} />
          )}
        </div>

        <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== 'notes'}>
          {tab === 'notes' && (
            <InternalNotesPanel ticketId={ticket.id} canPost={isStaff} onPosted={reload} />
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-attachments"
          aria-labelledby="tab-attachments"
          hidden={tab !== 'attachments'}
        >
          {tab === 'attachments' && (
            <section className="zg-thread">
              <h2 className="zg-section-title">
                <i className="bi bi-paperclip" aria-hidden="true" /> Attachments
              </h2>
              {/*
               * Read-only for staff (AC-24, BR-14): Download on active files,
               * removed files muted with their reason, and no upload zone or
               * Remove control anywhere — the API refuses both anyway.
               */}
              <p className="zg-hint">
                Attachments are managed by the requester. IT Staff can download them, but cannot add
                or remove files.
              </p>

              {downloadError && (
                <div className="zg-callout zg-callout-error mb-3" role="alert">
                  <span aria-hidden="true">⚠️</span>
                  <div>{downloadError}</div>
                </div>
              )}

              {ticket.attachments.length === 0 && (
                <p className="zg-muted" data-testid="no-attachments">
                  No files are attached to this ticket.
                </p>
              )}

              {activeAttachments.length > 0 && (
                <ul className="zg-file-list" data-testid="active-attachments">
                  {activeAttachments.map((file) => (
                    <li key={file.id} className="zg-file-row">
                      <span className="zg-file-name">{file.fileName}</span>
                      <span className="zg-file-size">{formatBytes(file.sizeBytes)}</span>
                      <span className="zg-file-size">Uploaded {formatDateTime(file.uploadedAt)}</span>
                      <span className="zg-file-actions">
                        <button
                          type="button"
                          className="zg-btn zg-btn-secondary zg-btn-sm"
                          onClick={() => void download(file)}
                          disabled={downloadingId === file.id}
                          aria-label={
                            downloadingId === file.id
                              ? `Downloading ${file.fileName}`
                              : `Download ${file.fileName}`
                          }
                        >
                          {downloadingId === file.id ? 'Downloading...' : 'Download'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {removedAttachments.length > 0 && (
                <>
                  <h3 className="zg-subsection-title">Removed files</h3>
                  <ul className="zg-file-list" data-testid="removed-attachments">
                    {removedAttachments.map((file) => (
                      <li key={file.id} className="zg-file-row zg-file-row-removed">
                        <span className="zg-file-name">{file.fileName}</span>
                        <span className="zg-badge zg-badge-removed">Removed</span>
                        <span className="zg-file-size">{formatBytes(file.sizeBytes)}</span>
                        <span className="zg-file-removed-meta">
                          Removed {formatDateTime(file.removedAt)} — {file.removedReason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {confirmation && (
        <div className="zg-modal-backdrop" role="presentation">
          <div className="zg-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 className="zg-section-title" id="confirm-title">
              {confirmation.title}
            </h2>
            <p className="zg-hint">{confirmation.message}</p>

            {confirmError && (
              <p className="zg-field-error" role="alert">
                {confirmError}
              </p>
            )}

            <div className="zg-actions">
              <button
                type="button"
                className={confirmation.danger ? 'zg-btn zg-btn-danger' : 'zg-btn zg-btn-primary'}
                onClick={() => void runConfirmation()}
                disabled={confirming}
              >
                {confirming ? (
                  <>
                    <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={() => {
                  setConfirmation(null)
                  setConfirmError(null)
                }}
                disabled={confirming}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default StaffTicketDetail
