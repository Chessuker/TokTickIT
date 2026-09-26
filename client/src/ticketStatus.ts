/**
 * How the eight `TicketStatus` values are written and coloured
 * (Lab 3 ui-spec.md §2 "Badges", api-spec.md §3.9).
 *
 * Kept out of `Badges.tsx` so that file exports components only (fast
 * refresh), and so the screens that need the *label* without the badge — the
 * status dropdown on the staff detail, a confirmation dialog's title — share
 * one spelling with the badge rather than inventing their own.
 */
export const STATUS_PRESENTATION: Record<string, { label: string; className: string }> = {
  New: { label: 'New', className: 'new' },
  Open: { label: 'Open', className: 'open' },
  InProgress: { label: 'In Progress', className: 'in-progress' },
  WaitingForRequester: { label: 'Waiting for Requester', className: 'waiting' },
  Reopened: { label: 'Reopened', className: 'reopened' },
  Resolved: { label: 'Resolved', className: 'resolved' },
  Closed: { label: 'Closed', className: 'closed' },
  Cancelled: { label: 'Cancelled', className: 'cancelled' },
}

/** Human label for a status value; falls back to the raw value for anything unknown. */
export function statusLabel(status: string): string {
  return STATUS_PRESENTATION[status]?.label ?? status
}
