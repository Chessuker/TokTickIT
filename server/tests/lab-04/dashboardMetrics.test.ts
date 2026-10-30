import { describe, it, expect } from 'vitest';
import {
  ACTIVE_QUERY,
  ACTIVE_STATUSES,
  BY_IT_PRIORITY,
  BY_STATUS,
  PREVIEW_LENGTH,
  descriptionPreview,
  requesterLists,
  requesterMetrics,
  staffLists,
  staffMyMetrics,
  staffSharedMetrics,
  toDashboardAction
} from '../../src/dashboardMetrics.js';
import { parseTicketListQuery, ticketListWhere } from '../../src/ticketListQuery.js';
import { parseQueueQuery, queueWhere } from '../../src/queueQuery.js';

/**
 * UNIT-05 — dashboard metric definitions (BR-22 … BR-27, AC-19, AC-20).
 *
 * The drill-down proof: every card's `href` is parsed back by the real list
 * parser and turned into a `where` by the real list builder, and that `where`
 * must equal the one the card counts with. If a definition and its link ever
 * drift apart, the card and the list it opens would show different totals.
 */

const ME = '22222222-2222-4333-8444-555555555555';

/** The query string of a client route, as Express would hand it to the parser. */
function queryOf(href: string): Record<string, string | string[]> {
  const params = new URLSearchParams(href.split('?')[1] ?? '');
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}

function myTicketsWhere(href: string, requesterId: string) {
  expect(href.startsWith('/tickets?')).toBe(true);
  const { query, fieldErrors } = parseTicketListQuery(queryOf(href));
  expect(fieldErrors).toEqual({});
  return ticketListWhere(query!, requesterId);
}

function queueWhereOf(href: string, callerId: string) {
  expect(href.startsWith('/staff/queue?')).toBe(true);
  const { query, fieldErrors } = parseQueueQuery(queryOf(href));
  expect(fieldErrors).toEqual({});
  return queueWhere(query!, callerId);
}

describe('active statuses (BR-22)', () => {
  it('are exactly the five statuses that still need work, in workflow order', () => {
    expect([...ACTIVE_STATUSES]).toEqual(['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened']);
    expect(ACTIVE_QUERY).toBe('status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened');
    expect([...BY_STATUS]).toEqual([...ACTIVE_STATUSES, 'Resolved']);
    expect([...BY_IT_PRIORITY]).toEqual(['High', 'Medium', 'Low']);
  });
});

describe('Requester cards: href re-parses to the counted filter (BR-23, BR-27)', () => {
  const metrics = requesterMetrics(ME);

  it.each(Object.keys(metrics) as (keyof typeof metrics)[])('%s', (key) => {
    const { where, href } = metrics[key];
    expect(myTicketsWhere(href, ME)).toEqual(where);
    expect(where).toMatchObject({ requesterId: ME });
  });

  it('match the metric table', () => {
    expect(metrics.open.where).toEqual({ requesterId: ME, status: { in: [...ACTIVE_STATUSES] } });
    expect(metrics.waitingForMe.href).toBe('/tickets?status=WaitingForRequester');
    expect(metrics.resolved.where).toEqual({ requesterId: ME, status: 'Resolved' });
    expect(metrics.closed.where).toEqual({ requesterId: ME, status: 'Closed' });
  });

  it('lists are scoped to the Requester, with the fixed order', () => {
    const lists = requesterLists(ME);
    for (const list of Object.values(lists)) expect(list.where).toMatchObject({ requesterId: ME });
    expect(lists.needsAttention).toEqual({
      where: { requesterId: ME, status: 'WaitingForRequester' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }]
    });
    expect(lists.recentlyUpdated.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
    expect(lists.recentlyResolved).toEqual({
      where: { requesterId: ME, status: { in: ['Resolved', 'Closed'] } },
      orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
    });
  });
});

describe('IT Staff cards: href re-parses to the counted filter (BR-24, BR-27)', () => {
  const shared = staffSharedMetrics();
  const my = staffMyMetrics(ME);

  const cards: [string, { where: Record<string, unknown>; href: string }][] = [
    ['unassigned', shared.unassigned],
    ['requesterReportsResolved', shared.requesterReportsResolved],
    ['mine', my.mine],
    ['myFollowUps (Tickets)', my.myFollowUps],
    ...BY_STATUS.map((status) => [`byStatus.${status}`, shared.byStatus[status]] as [string, typeof shared.unassigned]),
    ...BY_IT_PRIORITY.map(
      (priority) => [`byItPriority.${priority}`, shared.byItPriority[priority]] as [string, typeof shared.unassigned]
    )
  ];

  it.each(cards)('%s', (_key, { where, href }) => {
    expect(queueWhereOf(href, ME)).toEqual(where);
  });

  it('match the metric table', () => {
    const active = { in: [...ACTIVE_STATUSES] };
    expect(shared.unassigned.where).toEqual({ ownerId: null, status: active });
    expect(shared.requesterReportsResolved.where).toEqual({ requesterResolvedAt: { not: null }, status: active });
    expect(shared.byStatus.Resolved).toEqual({ where: { status: { in: ['Resolved'] } }, href: '/staff/queue?status=Resolved' });
    expect(shared.byItPriority.High.where).toEqual({ itPriority: 'High', status: active });
    expect(my.mine.where).toEqual({ ownerId: ME, status: active });
    expect(my.myFollowUps.href).toBe('/staff/queue?followUp=mine');
  });

  it('counts open follow-ups as Actions on active Tickets, and lists the Tickets that hold them', () => {
    expect(my.myFollowUps.actionWhere).toEqual({
      followUpAssigneeId: ME,
      followUpStatus: 'Open',
      ticket: { status: { in: [...ACTIVE_STATUSES] } }
    });
    expect(my.myFollowUps.where).toEqual({
      AND: [
        {
          status: { in: [...ACTIVE_STATUSES] },
          actions: { some: { followUpAssigneeId: ME, followUpStatus: 'Open' } }
        }
      ]
    });
  });

  it('lists: urgent is active IT High, longest untouched first; recent is everything, newest first', () => {
    expect(staffLists()).toEqual({
      urgent: { where: { status: { in: [...ACTIVE_STATUSES] }, itPriority: 'High' }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }] },
      recentlyUpdated: { where: {}, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }
    });
  });
});

describe('descriptionPreview (api-spec.md §2 DashboardAction)', () => {
  it('keeps a short description as it is, with whitespace collapsed', () => {
    expect(descriptionPreview('Re-created  the\nOutlook profile. ')).toBe('Re-created the Outlook profile.');
  });

  it('cuts a long one at the last word boundary within 120 characters and adds "…"', () => {
    const text = `${'word '.repeat(30)}end`;
    const preview = descriptionPreview(text);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_LENGTH + 1);
    expect(preview.slice(0, -1).endsWith('word')).toBe(true);
  });

  it('is exactly 120 characters untouched, and cuts a single over-long word mid-word', () => {
    expect(descriptionPreview('a'.repeat(120))).toBe('a'.repeat(120));
    expect(descriptionPreview('a'.repeat(130))).toBe(`${'a'.repeat(120)}…`);
  });

  it('shapes a DashboardAction row', () => {
    expect(
      toDashboardAction({
        id: 'a-1',
        ticketId: 't-1',
        description: 'Checked the switch port.',
        actionAt: new Date('2026-10-01T02:00:00.000Z'),
        followUpStatus: 'Open',
        ticket: { ticketNumber: 'TKT-2026-900007' }
      })
    ).toEqual({
      id: 'a-1',
      ticketId: 't-1',
      ticketNumber: 'TKT-2026-900007',
      descriptionPreview: 'Checked the switch port.',
      actionAt: new Date('2026-10-01T02:00:00.000Z'),
      followUpStatus: 'Open'
    });
  });
});
