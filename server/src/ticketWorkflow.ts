/**
 * The ticket status workflow (specification.md §5 BR-18 … BR-20, BR-31).
 *
 * Pure and database-free, like the query parsers: the matrix, the owner rule
 * and the timestamp rule live here as data and small functions, so every
 * (from, to) pair can be unit-tested without a route, and the routes are left
 * with nothing to decide.
 *
 * Two things follow from keeping the matrix here rather than in a route:
 *
 * 1. `permittedTransitions` in the API response is computed from the same
 *    table that enforces the change, so the UI never encodes the matrix and
 *    the two cannot drift (BR-18, AD-04).
 * 2. A transition that is not in the table is impossible by construction. The
 *    default is refusal, so a status added later is refused until it is given
 *    a row.
 */
import { TICKET_STATUSES } from './ticketListQuery.js';
import type { TicketStatusValue } from './ticketListQuery.js';

export type { TicketStatusValue };
export { TICKET_STATUSES };

/** One permitted target and what it demands of the ticket. */
export interface Transition {
  to: TicketStatusValue;
  /** BR-19: `InProgress` and `Resolved` may not be entered without an owner. */
  requiresOwner?: true;
  /** BR-18 ⚠: the UI asks for confirmation first; the server does not care. */
  confirm?: true;
}

/**
 * The transition matrix exactly as specification.md §5 draws it. Rows are the
 * current status; a status missing from a row cannot be reached from it.
 * `Cancelled` has an empty row: it is terminal (BR-20).
 */
export const TRANSITIONS: Record<TicketStatusValue, Transition[]> = {
  New: [
    { to: 'Open' },
    { to: 'InProgress', requiresOwner: true },
    { to: 'Cancelled', confirm: true }
  ],
  Open: [
    { to: 'InProgress', requiresOwner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', requiresOwner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  InProgress: [
    { to: 'WaitingForRequester' },
    { to: 'Resolved', requiresOwner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  WaitingForRequester: [
    { to: 'InProgress', requiresOwner: true },
    { to: 'Resolved', requiresOwner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  Resolved: [{ to: 'Closed', confirm: true }, { to: 'Reopened' }],
  Closed: [{ to: 'Reopened' }],
  Reopened: [
    { to: 'InProgress', requiresOwner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', requiresOwner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  Cancelled: []
};

/**
 * Statuses in which a ticket is finished: no owner or IT Priority change is
 * accepted any more (BR-31), and the Requester's resolution indication is
 * refused (BR-21).
 */
export const TERMINAL_STATUSES: readonly TicketStatusValue[] = ['Closed', 'Cancelled'];

/** True for a status that also refuses the Requester's "appears resolved" (BR-21). */
export const REQUESTER_TERMINAL_STATUSES: readonly TicketStatusValue[] = [
  'Resolved',
  'Closed',
  'Cancelled'
];

export function isTicketStatus(value: unknown): value is TicketStatusValue {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTerminal(status: TicketStatusValue): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The targets the API advertises for a ticket (`permittedTransitions`).
 *
 * The owner rule is applied here too: an unassigned ticket does not advertise
 * `InProgress` or `Resolved`, so the UI's status dropdown cannot offer a
 * transition the server would refuse. An Administrator gets `[]` — the caller
 * decides that, since this module knows nothing about roles.
 */
export function permittedTransitions(
  status: TicketStatusValue,
  hasOwner: boolean
): TicketStatusValue[] {
  return TRANSITIONS[status]
    .filter((transition) => hasOwner || !transition.requiresOwner)
    .map((transition) => transition.to);
}

/** Whether a permitted transition is one the UI should confirm first (BR-18 ⚠). */
export function needsConfirmation(from: TicketStatusValue, to: TicketStatusValue): boolean {
  return TRANSITIONS[from].some((transition) => transition.to === to && transition.confirm === true);
}

export type TransitionRefusal =
  | { reason: 'NOT_IN_MATRIX'; message: string }
  | { reason: 'OWNER_REQUIRED'; message: string };

export type TransitionCheck = { ok: true } | { ok: false; refusal: TransitionRefusal };

/** How a status reads in a message: `WaitingForRequester` → "Waiting for Requester". */
export function statusLabel(status: TicketStatusValue): string {
  return status.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function permittedList(status: TicketStatusValue, hasOwner: boolean): string {
  const targets = permittedTransitions(status, hasOwner);
  return targets.length === 0
    ? 'no further changes'
    : targets.map(statusLabel).join(', ');
}

/**
 * The one place a status change is judged (BR-18, BR-19).
 *
 * The owner rule is checked separately from the matrix so the refusal can say
 * *which* rule was broken: "this ticket needs an owner" is actionable in a way
 * that "not permitted" is not (AC-22).
 */
export function checkTransition(
  from: TicketStatusValue,
  to: TicketStatusValue,
  hasOwner: boolean
): TransitionCheck {
  const transition = TRANSITIONS[from].find((candidate) => candidate.to === to);

  if (!transition) {
    return {
      ok: false,
      refusal: {
        reason: 'NOT_IN_MATRIX',
        message: `A ticket that is ${statusLabel(from)} cannot become ${statusLabel(to)}. Permitted: ${permittedList(from, hasOwner)}.`
      }
    };
  }

  if (transition.requiresOwner && !hasOwner) {
    return {
      ok: false,
      refusal: {
        reason: 'OWNER_REQUIRED',
        message: `A ticket must have an owner before it can become ${statusLabel(to)}. Assign an owner first.`
      }
    };
  }

  return { ok: true };
}

/** The three workflow timestamps a status change writes (BR-20). */
export interface StatusTimestamps {
  resolvedAt: Date | null;
  closedAt: Date | null;
  requesterResolvedAt?: null;
}

/**
 * The timestamp columns to write with a status change (BR-20).
 *
 * `Resolved` stamps `resolvedAt`; `Closed` stamps `closedAt` and keeps the
 * `resolvedAt` it already had; `Reopened` clears all three, including the
 * Requester's indication — the problem is evidently not fixed, so the old
 * "looks resolved" is stale rather than merely historical. Every other target
 * leaves the timestamps alone, which is why the return type is partial.
 */
export function timestampsFor(
  to: TicketStatusValue,
  now: Date,
  current: { resolvedAt: Date | null; closedAt: Date | null }
): Partial<StatusTimestamps> {
  switch (to) {
    case 'Resolved':
      return { resolvedAt: now, closedAt: null };
    case 'Closed':
      return { closedAt: now, resolvedAt: current.resolvedAt ?? now };
    case 'Reopened':
      return { resolvedAt: null, closedAt: null, requesterResolvedAt: null };
    default:
      return {};
  }
}
