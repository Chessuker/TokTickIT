import type { Role } from '../context/auth'
import { ROLE_LABELS } from '../roles'
import { STATUS_PRESENTATION } from '../ticketStatus'

/**
 * Shared badge components (Lab 3 ui-spec.md §2 "Badges").
 *
 * Every badge writes its level inside the pill so colour is never the only
 * signal. Extracted here once and used by every screen; the Lab 2 copies in
 * `MyTickets.tsx` and `TicketDetail.tsx` are gone.
 */

export function StatusBadge({ status }: { status: string }) {
  const presentation = STATUS_PRESENTATION[status] ?? { label: status, className: status.toLowerCase() }
  return <span className={`zg-badge zg-badge-status-${presentation.className}`}>{presentation.label}</span>
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`zg-badge zg-badge-priority-${priority.toLowerCase()}`}>{priority}</span>
}

/**
 * IT Priority carries an "IT" prefix in the label so the two priority columns
 * are never confused when they differ (ui-spec.md §2).
 */
export function ItPriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`zg-badge zg-badge-it-priority-${priority.toLowerCase()}`}>IT {priority}</span>
  )
}

const ROLE_CLASS: Record<Role, string> = {
  Requester: 'zg-badge-role-requester',
  ITStaff: 'zg-badge-role-it-staff',
  Administrator: 'zg-badge-role-administrator',
}

export function RoleBadge({ role, onPrimary = false }: { role: Role; onPrimary?: boolean }) {
  const className = ['zg-badge', ROLE_CLASS[role], onPrimary ? 'zg-badge-on-primary' : '']
    .filter(Boolean)
    .join(' ')
  return <span className={className}>{ROLE_LABELS[role]}</span>
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'zg-badge zg-badge-active' : 'zg-badge zg-badge-inactive'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

/** The ticket owner's name, or the shared italic _Unassigned_ placeholder. */
export function OwnerName({ owner }: { owner: { name: string } | null }) {
  if (!owner) {
    return (
      <span className="zg-owner zg-owner-unassigned" title="No IT Staff owner has been assigned yet">
        Unassigned
      </span>
    )
  }
  return <span className="zg-owner">{owner.name}</span>
}

/**
 * The Requester's "this looks fixed" indication (BR-21). Shown wherever the
 * ticket header is, with the full timestamp on hover; rendered only once
 * `requesterResolvedAt` is set, so its presence *is* the signal.
 */
export function RequesterResolvedBadge({ at }: { at: string }) {
  const date = new Date(at)
  const title = Number.isNaN(date.getTime()) ? undefined : `Reported resolved ${date.toLocaleString()}`
  return (
    <span className="zg-badge zg-badge-requester-resolved" title={title} data-testid="requester-resolved">
      <i className="bi bi-check-circle" aria-hidden="true" /> Requester reports resolved
    </span>
  )
}
