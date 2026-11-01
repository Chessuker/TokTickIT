/**
 * Dashboard endpoints (Lab 4 api-spec.md §3.6, §3.7; FR-08, FR-09, BR-21 …
 * BR-27, AC-02, AC-19 … AC-21, AC-23, AC-30).
 *
 * Both answers are computed on every request from the live tables (BR-21):
 * nothing is cached. Every count and list of one response is read in one
 * `REPEATABLE READ` transaction, so they all describe the same moment — under
 * the default READ COMMITTED each statement would take its own snapshot, and
 * a Ticket that moved mid-request could be counted in two cards.
 *
 * The queries themselves live in `dashboardMetrics.ts` next to the `href` of
 * the list each card opens; this module only runs them and shapes the answer.
 * Responses carry counts and short lists only, never a description, comment
 * or note body (AC-30).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { getSessionUser, requireAuth, requireRole } from './auth.js';
import { sendInternalError } from './httpErrors.js';
import {
  BY_IT_PRIORITY,
  BY_STATUS,
  DASHBOARD_ACTION_SELECT,
  DASHBOARD_TICKET_SELECT,
  LIST_LENGTH,
  myRecentActionsQuery,
  requesterLists,
  requesterMetrics,
  staffLists,
  staffMyMetrics,
  staffSharedMetrics,
  toDashboardAction
} from './dashboardMetrics.js';
import type { DashboardActionRow } from './dashboardMetrics.js';

const SNAPSHOT = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead };

/** Pairs each card's count with its `href`, so the client never builds a URL (BR-27). */
const metric = (count: number, href: string) => ({ count, href });

// ---------------------------------------------------------------------------
// GET /api/dashboard/requester (§3.6)
// ---------------------------------------------------------------------------

export const requesterDashboardRouter = Router();

// Requester only: IT Staff and Administrators have their own dashboard, and a
// staff caller here is a mistake, not a wider view (AC-21).
requesterDashboardRouter.use(requireAuth, requireRole('Requester'));

// No query parameter is read, so none can widen the scope (BR-23): the
// Requester is the session user and nothing else.
requesterDashboardRouter.get('/requester', async (_req: Request, res: Response) => {
  try {
    const requesterId = getSessionUser(res).id;
    const metrics = requesterMetrics(requesterId);
    const lists = requesterLists(requesterId);

    const [open, waitingForMe, resolved, closed, needsAttention, recentlyUpdated, recentlyResolved, totalTickets] =
      await prisma.$transaction(
        [
          prisma.ticket.count({ where: metrics.open.where }),
          prisma.ticket.count({ where: metrics.waitingForMe.where }),
          prisma.ticket.count({ where: metrics.resolved.where }),
          prisma.ticket.count({ where: metrics.closed.where }),
          prisma.ticket.findMany({ ...lists.needsAttention, take: LIST_LENGTH, select: DASHBOARD_TICKET_SELECT }),
          prisma.ticket.findMany({ ...lists.recentlyUpdated, take: LIST_LENGTH, select: DASHBOARD_TICKET_SELECT }),
          prisma.ticket.findMany({ ...lists.recentlyResolved, take: LIST_LENGTH, select: DASHBOARD_TICKET_SELECT }),
          prisma.ticket.count({ where: { requesterId } })
        ] as never,
        SNAPSHOT
      );

    res.json({
      generatedAt: new Date(),
      metrics: {
        open: metric(open as number, metrics.open.href),
        waitingForMe: metric(waitingForMe as number, metrics.waitingForMe.href),
        resolved: metric(resolved as number, metrics.resolved.href),
        closed: metric(closed as number, metrics.closed.href)
      },
      lists: { needsAttention, recentlyUpdated, recentlyResolved },
      // All statuses, Cancelled included: tells "no tickets at all" apart from
      // "tickets, but none in these buckets" (BR-26).
      totalTickets
    });
  } catch (error) {
    sendInternalError(res, 'GET /api/dashboard/requester', error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/staff/dashboard (§3.7) — mounted on `staffRouter`, behind its gate.
// ---------------------------------------------------------------------------

export async function staffDashboard(_req: Request, res: Response) {
  try {
    const caller = getSessionUser(res);
    const isStaff = caller.role === 'ITStaff';
    const shared = staffSharedMetrics();
    const my = staffMyMetrics(caller.id);
    const lists = staffLists();

    // One flat batch, so the whole answer is one snapshot. The order of the
    // queries is the order of the destructuring below; keep the two in step.
    const queries = [
      prisma.ticket.count({ where: shared.unassigned.where }),
      prisma.ticket.count({ where: shared.requesterReportsResolved.where }),
      ...BY_STATUS.map((status) => prisma.ticket.count({ where: shared.byStatus[status].where })),
      ...BY_IT_PRIORITY.map((priority) => prisma.ticket.count({ where: shared.byItPriority[priority].where })),
      prisma.ticket.findMany({ ...lists.urgent, take: LIST_LENGTH, select: DASHBOARD_TICKET_SELECT }),
      prisma.ticket.findMany({ ...lists.recentlyUpdated, take: LIST_LENGTH, select: DASHBOARD_TICKET_SELECT }),
      prisma.ticketAction.findMany({
        ...myRecentActionsQuery(caller.id),
        take: LIST_LENGTH,
        select: DASHBOARD_ACTION_SELECT
      }),
      // "My" cards for IT Staff (BR-24) …
      ...(isStaff
        ? [
            prisma.ticket.count({ where: my.mine.where }),
            prisma.ticketAction.count({ where: my.myFollowUps.actionWhere }),
            prisma.ticket.count({ where: my.myFollowUps.where })
          ]
        : []),
      // … and the user-account counts for an Administrator.
      ...(isStaff
        ? []
        : [
            prisma.user.count({ where: { role: 'Requester', isActive: true } }),
            prisma.user.count({ where: { role: 'ITStaff', isActive: true } }),
            prisma.user.count({ where: { role: 'Administrator', isActive: true } }),
            prisma.user.count({ where: { isActive: false } })
          ])
    ];

    const results = (await prisma.$transaction(queries as never, SNAPSHOT)) as unknown[];
    let index = 0;
    const next = <T>() => results[index++] as T;

    const unassigned = next<number>();
    const requesterReportsResolved = next<number>();
    const byStatus = Object.fromEntries(
      BY_STATUS.map((status) => [status, metric(next<number>(), shared.byStatus[status].href)])
    );
    const byItPriority = Object.fromEntries(
      BY_IT_PRIORITY.map((priority) => [priority, metric(next<number>(), shared.byItPriority[priority].href)])
    );
    const urgent = next<unknown[]>();
    const recentlyUpdated = next<unknown[]>();
    const myRecentActions = next<DashboardActionRow[]>().map(toDashboardAction);

    const mine = isStaff ? metric(next<number>(), my.mine.href) : null;
    const myFollowUps = isStaff
      ? { count: next<number>(), ticketCount: next<number>(), href: my.myFollowUps.href }
      : null;

    const users = isStaff
      ? null
      : {
          activeByRole: { Requester: next<number>(), ITStaff: next<number>(), Administrator: next<number>() },
          inactive: next<number>(),
          href: '/admin/users'
        };

    res.json({
      generatedAt: new Date(),
      viewer: caller.role,
      metrics: {
        unassigned: metric(unassigned, shared.unassigned.href),
        mine,
        myFollowUps,
        requesterReportsResolved: metric(requesterReportsResolved, shared.requesterReportsResolved.href),
        byStatus,
        byItPriority
      },
      lists: { urgent, recentlyUpdated, myRecentActions },
      users
    });
  } catch (error) {
    sendInternalError(res, 'GET /api/staff/dashboard', error);
  }
}
