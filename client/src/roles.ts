import type { Role } from './context/auth'

/**
 * Role-dependent facts the shell and the guards share (ui-spec.md §3.0).
 */
export const ROLE_LABELS: Record<Role, string> = {
  Requester: 'Requester',
  ITStaff: 'IT Staff',
  Administrator: 'Administrator',
}

/** Where each role lands after login and where "home" links point. */
export const ROLE_HOMES: Record<Role, string> = {
  Requester: '/tickets',
  ITStaff: '/staff/queue',
  Administrator: '/admin/users',
}

export interface NavItem {
  to: string
  label: string
  /** Match the path exactly, so `/tickets` is not active on `/tickets/new`. */
  end?: boolean
}

/** Only the current role's links ever render (AC-11). */
export const ROLE_NAV: Record<Role, NavItem[]> = {
  Requester: [
    { to: '/tickets', label: 'My Tickets', end: true },
    { to: '/tickets/new', label: 'Create Ticket' },
  ],
  ITStaff: [{ to: '/staff/queue', label: 'Queue' }],
  Administrator: [
    { to: '/admin/users', label: 'Users' },
    { to: '/staff/queue', label: 'Queue' },
  ],
}

/** Which roles may open each application area; used to vet the `from` param. */
export const AREA_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: '/tickets', roles: ['Requester'] },
  { prefix: '/staff', roles: ['ITStaff', 'Administrator'] },
  { prefix: '/admin', roles: ['Administrator'] },
]

/** True when `path` is somewhere `role` is allowed to be. */
export function pathBelongsToRole(path: string, role: Role): boolean {
  const area = AREA_ROLES.find((entry) => path === entry.prefix || path.startsWith(entry.prefix + '/'))
  return area ? area.roles.includes(role) : false
}

/** Initials for the avatar: first letter of the first two words. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}
