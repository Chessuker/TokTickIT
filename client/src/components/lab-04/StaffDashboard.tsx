import { Link } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import { FollowUpBadge, ItPriorityBadge, StatusBadge } from '../Badges'
import { formatBangkok } from './dates'
import {
  DashboardFailureState,
  DashboardHead,
  DashboardList,
  MetricCard,
  MetricGroup,
  TicketRow,
} from './DashboardParts'
import { relativeTime } from '../../comments'
import { countNoun, firstName, ticketRowLabel, useDashboard } from './dashboardData'
import type { DashboardTicket, Metric } from './dashboardData'

/**
 * IT Staff / Administrator dashboard (Lab 4 ui-spec.md §3.2; api-spec.md §3.7;
 * FR-09, BR-24 … BR-27, AC-19 … AC-21).
 *
 * One component, two variants decided by the API's `viewer`: an Administrator
 * gets `null` for the two "my" metrics (they never own Tickets or follow-ups),
 * so those cards are simply not rendered, and a Users card appears instead.
 */

/** api-spec.md §2 `DashboardAction`. */
export interface DashboardAction {
  id: string
  ticketId: string
  ticketNumber: string
  descriptionPreview: string
  actionAt: string
  followUpStatus: string | null
}

const BY_STATUS = ['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened', 'Resolved'] as const
const BY_IT_PRIORITY = ['High', 'Medium', 'Low'] as const

const STATUS_LABELS: Record<(typeof BY_STATUS)[number], string> = {
  New: 'New',
  Open: 'Open',
  InProgress: 'In Progress',
  WaitingForRequester: 'Waiting for Requester',
  Reopened: 'Reopened',
  Resolved: 'Resolved',
}

export interface StaffDashboardData {
  generatedAt: string
  viewer: 'ITStaff' | 'Administrator'
  metrics: {
    unassigned: Metric
    mine: Metric | null
    myFollowUps: (Metric & { ticketCount: number }) | null
    requesterReportsResolved: Metric
    byStatus: Record<(typeof BY_STATUS)[number], Metric>
    byItPriority: Record<(typeof BY_IT_PRIORITY)[number], Metric>
  }
  lists: { urgent: DashboardTicket[]; recentlyUpdated: DashboardTicket[]; myRecentActions: DashboardAction[] }
  users: {
    activeByRole: { Requester: number; ITStaff: number; Administrator: number }
    inactive: number
    href: string
  } | null
}

function StaffDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const { data, loading, failure, refresh } = useDashboard<StaffDashboardData>('/api/staff/dashboard')
  const m = data?.metrics
  const lists = data?.lists

  return (
    <section data-testid="staff-dashboard">
      <DashboardHead
        title={`Welcome back, ${firstName(user?.name)}!`}
        subtitle="Here's what's happening in the queue."
        loading={loading}
        onRefresh={() => void refresh()}
      />

      {failure && !data ? (
        <DashboardFailureState failure={failure} onRetry={() => void refresh()} />
      ) : (
        <>
          {failure && <DashboardFailureState failure={failure} onRetry={() => void refresh()} />}

          <MetricGroup id="staff-primary" title="Ticket counts">
            <MetricCard label="Unassigned" metric={m?.unassigned ?? null} loading={loading} testId="metric-unassigned" />
            {/* Administrators own nothing, so the "my" cards are absent, not "N/A" (ui-spec.md §1.3). */}
            {!isAdmin && (
              <>
                <MetricCard label="My open tickets" metric={m?.mine ?? null} loading={loading} testId="metric-mine" />
                <MetricCard
                  label="My open follow-ups"
                  metric={m?.myFollowUps ?? null}
                  noun="follow-up"
                  detail={m?.myFollowUps ? `across ${countNoun(m.myFollowUps.ticketCount, 'ticket')}` : undefined}
                  loading={loading}
                  testId="metric-follow-ups"
                />
              </>
            )}
            <MetricCard
              label="Requester reports resolved"
              metric={m?.requesterReportsResolved ?? null}
              loading={loading}
              testId="metric-requester-resolved"
            />
            {isAdmin && data?.users && (
              <Link
                className="zg-metric-card zg-metric-users"
                to={data.users.href}
                aria-label={`Users: ${countNoun(data.users.activeByRole.Requester, 'active requester')}, ${data.users.activeByRole.ITStaff} active IT Staff, ${countNoun(data.users.activeByRole.Administrator, 'active administrator')}, ${data.users.inactive} inactive`}
                data-testid="metric-users"
              >
                <span className="zg-metric-label">Users</span>
                <dl className="zg-metric-users-list">
                  <div>
                    <dt>Requesters</dt>
                    <dd>{data.users.activeByRole.Requester}</dd>
                  </div>
                  <div>
                    <dt>IT Staff</dt>
                    <dd>{data.users.activeByRole.ITStaff}</dd>
                  </div>
                  <div>
                    <dt>Administrators</dt>
                    <dd>{data.users.activeByRole.Administrator}</dd>
                  </div>
                  <div>
                    <dt>Inactive</dt>
                    <dd>{data.users.inactive}</dd>
                  </div>
                </dl>
                <span className="zg-metric-cue" aria-hidden="true">
                  View <i className="bi bi-chevron-right" />
                </span>
              </Link>
            )}
          </MetricGroup>

          <MetricGroup id="staff-by-status" title="By status" compact>
            {BY_STATUS.map((status) => (
              <MetricCard
                key={status}
                label={STATUS_LABELS[status]}
                labelNode={<StatusBadge status={status} />}
                metric={m?.byStatus[status] ?? null}
                loading={loading}
                compact
                testId={`metric-status-${status}`}
              />
            ))}
          </MetricGroup>

          <MetricGroup id="staff-by-priority" title="Active by IT Priority" compact>
            {BY_IT_PRIORITY.map((priority) => (
              <MetricCard
                key={priority}
                label={`IT ${priority}`}
                labelNode={<ItPriorityBadge priority={priority} />}
                metric={m?.byItPriority[priority] ?? null}
                loading={loading}
                compact
                testId={`metric-priority-${priority}`}
              />
            ))}
          </MetricGroup>

          <div className="zg-dash-lists">
            <DashboardList
              title="Urgent"
              icon="bi-exclamation-triangle"
              rows={lists?.urgent ?? null}
              empty="No urgent tickets."
              viewAll={m?.byItPriority.High.href}
              testId="list-urgent"
              render={(ticket) => ({
                key: ticket.id,
                to: `/staff/tickets/${ticket.id}`,
                label: ticketRowLabel(ticket),
                children: <TicketRow ticket={ticket} time={ticket.updatedAt} />,
              })}
            />
            <DashboardList
              title="Recently updated"
              icon="bi-clock-history"
              rows={lists?.recentlyUpdated ?? null}
              empty="No recent updates."
              viewAll="/staff/queue"
              testId="list-recently-updated"
              render={(ticket) => ({
                key: ticket.id,
                to: `/staff/tickets/${ticket.id}`,
                label: ticketRowLabel(ticket),
                children: <TicketRow ticket={ticket} time={ticket.updatedAt} />,
              })}
            />
            <DashboardList
              title="My recent actions"
              icon="bi-tools"
              rows={lists?.myRecentActions ?? null}
              empty="You haven't recorded any actions yet."
              testId="list-my-actions"
              render={(action) => ({
                key: action.id,
                // `#actions` opens the Actions Taken tab (ui-spec.md §3.3).
                to: `/staff/tickets/${action.ticketId}#actions`,
                label: `${action.ticketNumber}: ${action.descriptionPreview}`,
                children: (
                  <>
                    <span className="zg-ticket-number">{action.ticketNumber}</span>
                    <span className="zg-dash-summary" title={action.descriptionPreview}>
                      {action.descriptionPreview}
                    </span>
                    <FollowUpBadge status={action.followUpStatus} />
                    <time className="zg-dash-time" dateTime={action.actionAt} title={relativeTime(action.actionAt)}>
                      {formatBangkok(action.actionAt)}
                    </time>
                  </>
                ),
              })}
            />
          </div>
        </>
      )}

      <section className="zg-card zg-dash-quick" aria-labelledby="staff-quick-heading">
        <h2 className="zg-section-title" id="staff-quick-heading">
          <i className="bi bi-lightning" aria-hidden="true" /> Quick actions
        </h2>
        <div className="zg-actions">
          <Link className="zg-btn zg-btn-primary" to="/staff/queue">
            Open Queue
          </Link>
          {isAdmin ? (
            <Link className="zg-btn zg-btn-secondary" to="/admin/users">
              Users
            </Link>
          ) : (
            <>
              <Link className="zg-btn zg-btn-secondary" to="/staff/queue?owner=me">
                My Queue
              </Link>
              <Link className="zg-btn zg-btn-secondary" to="/staff/queue?owner=unassigned">
                Unassigned
              </Link>
            </>
          )}
        </div>
      </section>
    </section>
  )
}

export default StaffDashboard
