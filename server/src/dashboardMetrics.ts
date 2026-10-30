/**
 * Dashboard metric definitions (Lab 4 specification.md §5 "Dashboards",
 * BR-21 … BR-27; api-spec.md §2, §3.6, §3.7).
 *
 * Every card is defined once, here, as a pair: the Prisma `where` that counts
 * it and the client route (`href`) that lists it. Keeping the two side by side
 * is what makes drill-down consistent (BR-27): the list a card opens parses
 * its query string back into the same filter, so its total is the card's
 * count. `dashboardMetrics.test.ts` (UNIT-05) re-parses every `href` with the
 * real list parsers to prove it.
 *
 * Pure and database-free, like the other rule modules: the routes only run
 * these `where`s.
 */
import type { Prisma } from '@prisma/client';
import type { TicketStatusValue } from './ticketListQuery.js';
import type { ItPriorityValue } from './queueQuery.js';

/** BR-22: the five statuses in which a Ticket still needs work. */
export const ACTIVE_STATUSES: readonly TicketStatusValue[] = [
  'New',
  'Open',
  'InProgress',
  'WaitingForRequester',
  'Reopened'
];

/** The `byStatus` cards: the active statuses, plus Resolved (awaiting closure). */
export const BY_STATUS: readonly TicketStatusValue[] = [...ACTIVE_STATUSES, 'Resolved'];

export const BY_IT_PRIORITY: readonly ItPriorityValue[] = ['High', 'Medium', 'Low'];

/** BR-25: every dashboard list is this long. */
export const LIST_LENGTH = 5;

/** `status=New&status=Open&…`, the `{active}` of the metric table. */
export const ACTIVE_QUERY = ACTIVE_STATUSES.map((status) => `status=${status}`).join('&');

const active = { in: [...ACTIVE_STATUSES] };

export interface MetricDefinition {
  where: Prisma.TicketWhereInput;
  href: string;
}

/** A dashboard list: its filter and its fixed order (BR-25). */
export interface ListDefinition {
  where: Prisma.TicketWhereInput;
  orderBy: Prisma.TicketOrderByWithRelationInput[];
}

/** BR-23: every Requester definition is scoped to the session user, and nothing else. */
export function requesterMetrics(
  requesterId: string
): Record<'open' | 'waitingForMe' | 'resolved' | 'closed', MetricDefinition> {
  return {
    open: { where: { requesterId, status: active }, href: `/tickets?${ACTIVE_QUERY}` },
    waitingForMe: {
      where: { requesterId, status: 'WaitingForRequester' },
      href: '/tickets?status=WaitingForRequester'
    },
    resolved: { where: { requesterId, status: 'Resolved' }, href: '/tickets?status=Resolved' },
    closed: { where: { requesterId, status: 'Closed' }, href: '/tickets?status=Closed' }
  };
}

/** The three Requester lists: filter and fixed order (BR-25). */
export function requesterLists(
  requesterId: string
): Record<'needsAttention' | 'recentlyUpdated' | 'recentlyResolved', ListDefinition> {
  return {
    needsAttention: {
      where: { requesterId, status: 'WaitingForRequester' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }]
    },
    recentlyUpdated: { where: { requesterId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] },
    recentlyResolved: {
      where: { requesterId, status: { in: ['Resolved', 'Closed'] } },
      orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
    }
  };
}

/**
 * The IT Staff cards that are the same for everyone (BR-24): the whole queue,
 * with no "my" in them.
 */
export function staffSharedMetrics() {
  return {
    unassigned: {
      where: { ownerId: null, status: active },
      href: `/staff/queue?owner=unassigned&${ACTIVE_QUERY}`
    },
    requesterReportsResolved: {
      where: { requesterResolvedAt: { not: null }, status: active },
      href: `/staff/queue?requesterResolved=true&${ACTIVE_QUERY}`
    },
    byStatus: Object.fromEntries(
      // `in` with one value: exactly the clause the Queue builds from `?status=`.
      BY_STATUS.map((status) => [status, { where: { status: { in: [status] } }, href: `/staff/queue?status=${status}` }])
    ) as unknown as Record<TicketStatusValue, MetricDefinition>,
    byItPriority: Object.fromEntries(
      BY_IT_PRIORITY.map((itPriority) => [
        itPriority,
        { where: { itPriority, status: active }, href: `/staff/queue?itPriority=${itPriority}&${ACTIVE_QUERY}` }
      ])
    ) as unknown as Record<ItPriorityValue, MetricDefinition>
  };
}

/**
 * The open follow-ups assigned to someone (BR-22): `followUpStatus = Open` on
 * a Ticket in an active status. Used as the Action filter for the count and,
 * through `followUpTicketWhere`, as the Ticket filter for the Queue.
 */
export function openFollowUpsOf(assigneeId: string): Prisma.TicketActionWhereInput {
  return { followUpAssigneeId: assigneeId, followUpStatus: 'Open', ticket: { status: active } };
}

/** The Tickets that hold `assigneeId`'s open follow-ups: what `followUp=mine` lists. */
export function followUpTicketWhere(assigneeId: string): Prisma.TicketWhereInput {
  return { status: active, actions: { some: { followUpAssigneeId: assigneeId, followUpStatus: 'Open' } } };
}

/** The two IT Staff "my" cards; an Administrator gets neither (BR-24). */
export function staffMyMetrics(userId: string) {
  return {
    mine: { where: { ownerId: userId, status: active }, href: `/staff/queue?owner=me&${ACTIVE_QUERY}` },
    myFollowUps: {
      /** Counts Actions (follow-ups), not Tickets. */
      actionWhere: openFollowUpsOf(userId),
      /** Counts the Tickets that hold them: the Queue total (AC-20). */
      where: { AND: [followUpTicketWhere(userId)] },
      href: '/staff/queue?followUp=mine'
    }
  };
}

/** The IT Staff lists: filter and fixed order (BR-25). */
export function staffLists(): Record<'urgent' | 'recentlyUpdated', ListDefinition> {
  return {
    // Longest untouched first: the ones most at risk of being forgotten.
    urgent: { where: { status: active, itPriority: 'High' }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }] },
    recentlyUpdated: { where: {}, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }
  };
}

/** `myRecentActions`: the caller's own Actions, newest first. */
export function myRecentActionsQuery(userId: string): {
  where: Prisma.TicketActionWhereInput;
  orderBy: Prisma.TicketActionOrderByWithRelationInput[];
} {
  return { where: { performedById: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] };
}

/** The compact Ticket row every dashboard list returns (api-spec.md §2 `DashboardTicket`). */
export const DASHBOARD_TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  status: true,
  itPriority: true,
  updatedAt: true,
  resolvedAt: true
} as const;

export const DASHBOARD_ACTION_SELECT = {
  id: true,
  ticketId: true,
  description: true,
  actionAt: true,
  followUpStatus: true,
  ticket: { select: { ticketNumber: true } }
} as const;

export const PREVIEW_LENGTH = 120;

/**
 * The first 120 characters of an Action's description, cut at the last word
 * boundary and ending in "…" when shortened (api-spec.md §2 `DashboardAction`).
 * A single word longer than the limit is cut mid-word rather than dropped.
 */
export function descriptionPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= PREVIEW_LENGTH) return flat;

  const cut = flat.slice(0, PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface DashboardActionRow {
  id: string;
  ticketId: string;
  description: string;
  actionAt: Date;
  followUpStatus: string | null;
  ticket: { ticketNumber: string };
}

export function toDashboardAction(row: DashboardActionRow) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    ticketNumber: row.ticket.ticketNumber,
    descriptionPreview: descriptionPreview(row.description),
    actionAt: row.actionAt,
    followUpStatus: row.followUpStatus
  };
}
