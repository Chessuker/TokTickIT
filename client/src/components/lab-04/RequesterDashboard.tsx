import { Link } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import {
  DashboardFailureState,
  DashboardHead,
  DashboardList,
  MetricCard,
  MetricGroup,
  TicketRow,
} from './DashboardParts'
import { firstName, ticketRowLabel, useDashboard } from './dashboardData'
import type { DashboardTicket, Metric } from './dashboardData'

/**
 * Requester dashboard (Lab 4 ui-spec.md §3.1; api-spec.md §3.6; FR-08, BR-23,
 * BR-26, AC-02, AC-21, AC-23).
 *
 * A summary that links out, not a second My Tickets: four counts, three
 * five-row lists and two quick actions. The server decides whose tickets
 * these are (the session user), so nothing here passes an id.
 */

export interface RequesterDashboardData {
  generatedAt: string
  metrics: { open: Metric; waitingForMe: Metric; resolved: Metric; closed: Metric }
  lists: {
    needsAttention: DashboardTicket[]
    recentlyUpdated: DashboardTicket[]
    recentlyResolved: DashboardTicket[]
  }
  totalTickets: number
}

function QuickActions() {
  return (
    <section className="zg-card zg-dash-quick" aria-labelledby="quick-actions-heading">
      <h2 className="zg-section-title" id="quick-actions-heading">
        <i className="bi bi-lightning" aria-hidden="true" /> Quick actions
      </h2>
      <div className="zg-actions">
        <Link className="zg-btn zg-btn-primary" to="/tickets/new">
          <i className="bi bi-plus-lg" aria-hidden="true" /> Create Ticket
        </Link>
        <Link className="zg-btn zg-btn-secondary" to="/tickets">
          View My Tickets
        </Link>
      </div>
    </section>
  )
}

function RequesterDashboard() {
  const { user } = useAuth()
  const { data, loading, failure, refresh } = useDashboard<RequesterDashboardData>('/api/dashboard/requester')

  const head = (
    <DashboardHead
      title={`Welcome, ${firstName(user?.name)}!`}
      subtitle="Here's the latest on your requests."
      loading={loading}
      onRefresh={() => void refresh()}
    />
  )

  // A Requester with no Tickets at all: one panel with the way in (BR-26).
  if (data && data.totalTickets === 0 && !failure) {
    return (
      <section data-testid="requester-dashboard">
        {head}
        <div className="zg-card zg-state zg-state-empty" data-testid="dashboard-empty">
          <span className="zg-state-icon" aria-hidden="true">
            🌱
          </span>
          <h2 className="zg-state-title">You haven't raised any tickets yet.</h2>
          <p className="zg-state-text">When you ask the IT team for help, your requests and their progress appear here.</p>
          <Link className="zg-btn zg-btn-primary" to="/tickets/new">
            Create Ticket
          </Link>
        </div>
      </section>
    )
  }

  const m = data?.metrics
  const lists = data?.lists

  return (
    <section data-testid="requester-dashboard">
      {head}

      {failure && !data ? (
        <DashboardFailureState failure={failure} onRetry={() => void refresh()} />
      ) : (
        <>
          {failure && <DashboardFailureState failure={failure} onRetry={() => void refresh()} />}

          <MetricGroup id="requester-counts" title="Ticket counts">
            <MetricCard label="My open tickets" metric={m?.open ?? null} loading={loading} testId="metric-open" />
            <MetricCard
              label="Waiting for you"
              metric={m?.waitingForMe ?? null}
              attention="Reply needed"
              loading={loading}
              testId="metric-waiting"
            />
            <MetricCard label="Resolved" metric={m?.resolved ?? null} loading={loading} testId="metric-resolved" />
            <MetricCard label="Closed" metric={m?.closed ?? null} loading={loading} testId="metric-closed" />
          </MetricGroup>

          <div className="zg-dash-lists">
            <DashboardList
              title="Needs your reply"
              icon="bi-reply"
              rows={lists?.needsAttention ?? null}
              empty="Nothing needs your reply."
              testId="list-needs-attention"
              render={(ticket) => ({
                key: ticket.id,
                to: `/tickets/${ticket.id}`,
                label: ticketRowLabel(ticket),
                children: <TicketRow ticket={ticket} time={ticket.updatedAt} />,
              })}
            />
            <DashboardList
              title="Recently updated"
              icon="bi-clock-history"
              rows={lists?.recentlyUpdated ?? null}
              empty="No recent updates."
              viewAll="/tickets?sort=updatedAt:desc"
              testId="list-recently-updated"
              render={(ticket) => ({
                key: ticket.id,
                to: `/tickets/${ticket.id}`,
                label: ticketRowLabel(ticket),
                children: <TicketRow ticket={ticket} time={ticket.updatedAt} />,
              })}
            />
            <DashboardList
              title="Recently resolved"
              icon="bi-check2-circle"
              rows={lists?.recentlyResolved ?? null}
              empty="Nothing resolved yet."
              testId="list-recently-resolved"
              render={(ticket) => ({
                key: ticket.id,
                to: `/tickets/${ticket.id}`,
                label: ticketRowLabel(ticket),
                children: <TicketRow ticket={ticket} time={ticket.resolvedAt} />,
              })}
            />
          </div>
        </>
      )}

      {/* Usable while loading and after a failure (ui-spec.md §3.1). */}
      <QuickActions />
    </section>
  )
}

export default RequesterDashboard
