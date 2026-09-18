import type { Role } from '../context/auth'
import { ROLE_LABELS } from '../roles'

/**
 * Shared badge components (Lab 3 ui-spec.md §2 "Badges").
 *
 * Every badge writes its level inside the pill so colour is never the only
 * signal. This file starts with the badges the authentication foundation
 * needs; the queue and detail issues add the status/priority variants here
 * and retire the Lab 2 copies.
 */

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
