import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../Badges'
import { formatBangkok } from './dates'
import { relativeTime } from '../../comments'
import { countNoun } from './dashboardData'
import type { DashboardFailure, DashboardTicket, Metric } from './dashboardData'

/**
 * Pieces shared by the two dashboards (Lab 4 ui-spec.md §1.3, §1.4, §3.1,
 * §3.2): `MetricCard`, `DashboardList` and the page states. The data hook and
 * the wording helpers are in `dashboardData.ts`.
 *
 * Nothing here computes a number or builds a drill-down URL. Every count and
 * every `href` comes from the API, which defines both from one place (BR-27);
 * the cards only show and link them.
 */

interface MetricCardProps {
  label: string
  /** Replaces the plain label, e.g. a `StatusBadge` on the compact status cards. */
  labelNode?: ReactNode
  metric: Metric | null
  /** Singular noun for the accessible name: "ticket", "follow-up". */
  noun?: string
  /** Extra words after the count, in the name and on the card ("across 2 tickets"). */
  detail?: string
  /** Marks the card as needing attention when the count is above 0, with this caption. */
  attention?: string
  compact?: boolean
  loading?: boolean
  testId?: string
}

/**
 * One metric (ui-spec.md §1.3): the whole card is one link, so the whole card
 * is the target, and its accessible name says the label and the value.
 */
export function MetricCard({
  label,
  labelNode,
  metric,
  noun = 'ticket',
  detail,
  attention,
  compact = false,
  loading = false,
  testId,
}: MetricCardProps) {
  const classes = ['zg-metric-card', compact ? 'zg-metric-compact' : '']

  if (!metric) {
    // Loading with nothing to show yet: the label stays, so the layout does not jump.
    return (
      <div className={[...classes, 'is-loading'].join(' ')} aria-hidden={!loading} data-testid={testId}>
        <span className="zg-metric-label">{labelNode ?? label}</span>
        <span className="zg-skeleton zg-metric-skeleton" />
      </div>
    )
  }

  const needsAttention = Boolean(attention) && metric.count > 0
  if (needsAttention) classes.push('needs-attention')
  const name = `${label}: ${countNoun(metric.count, noun)}${detail ? ` ${detail}` : ''}`

  return (
    <Link className={classes.filter(Boolean).join(' ')} to={metric.href} aria-label={name} data-testid={testId}>
      <span className="zg-metric-label">{labelNode ?? label}</span>
      <span className="zg-metric-value">{metric.count}</span>
      {detail && <span className="zg-metric-caption">{detail}</span>}
      {metric.count === 0 && <span className="zg-metric-caption">None right now</span>}
      {needsAttention && (
        <span className="zg-metric-caption zg-metric-attention">
          <i className="bi bi-exclamation-circle" aria-hidden="true" /> {attention}
        </span>
      )}
      <span className="zg-metric-cue" aria-hidden="true">
        View <i className="bi bi-chevron-right" />
      </span>
    </Link>
  )
}

/** A row group of cards with a visually hidden heading (ui-spec.md §1.3 "Group"). */
export function MetricGroup({ id, title, compact = false, children }: { id: string; title: string; compact?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="zg-metric-section">
      <h2 id={id} className={compact ? 'zg-dash-subheading' : 'visually-hidden'}>
        {title}
      </h2>
      <div className={compact ? 'zg-metric-grid zg-metric-grid-compact' : 'zg-metric-grid'}>{children}</div>
    </section>
  )
}

interface DashboardListProps<T> {
  title: string
  icon: string
  rows: T[] | null
  empty: string
  viewAll?: string
  testId: string
  render: (row: T) => { key: string; to: string; label: string; children: ReactNode }
}

/** A capped list card (ui-spec.md §1.4): every row is one link. */
export function DashboardList<T>({ title, icon, rows, empty, viewAll, testId, render }: DashboardListProps<T>) {
  const headingId = `${testId}-heading`
  return (
    <section className="zg-card zg-dash-list" aria-labelledby={headingId} data-testid={testId}>
      <div className="zg-dash-list-head">
        <h2 className="zg-section-title" id={headingId}>
          <i className={`bi ${icon}`} aria-hidden="true" /> {title}
        </h2>
        {viewAll && (
          <Link className="zg-dash-view-all" to={viewAll}>
            View all <span className="visually-hidden">{title.toLowerCase()}</span>
          </Link>
        )}
      </div>
      {rows === null ? (
        <ul className="zg-dash-rows" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="zg-dash-row">
              <span className="zg-skeleton zg-skeleton-line" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="zg-muted mb-0" data-testid={`${testId}-empty`}>
          {empty}
        </p>
      ) : (
        <ul className="zg-dash-rows">
          {rows.map((row) => {
            const { key, to, label, children } = render(row)
            return (
              <li key={key}>
                <Link className="zg-dash-row" to={to} aria-label={label}>
                  {children}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The usual row: number · summary · status · time. */
export function TicketRow({ ticket, time }: { ticket: DashboardTicket; time: string | null }) {
  return (
    <>
      <span className="zg-ticket-number">{ticket.ticketNumber}</span>
      <span className="zg-dash-summary" title={ticket.summary}>
        {ticket.summary}
      </span>
      <StatusBadge status={ticket.status} />
      {time && (
        <time className="zg-dash-time" dateTime={time} title={relativeTime(time)}>
          {formatBangkok(time)}
        </time>
      )}
    </>
  )
}

interface PageStateProps {
  failure: DashboardFailure
  onRetry: () => void
}

/** Forbidden or safe failure, in place of the cards and lists (ui-spec.md §3.1). */
export function DashboardFailureState({ failure, onRetry }: PageStateProps) {
  if (failure.kind === 'forbidden') {
    return (
      <div className="zg-card zg-state zg-state-denied" role="alert" data-testid="dashboard-forbidden">
        <span className="zg-state-icon" aria-hidden="true">
          🔒
        </span>
        <h2 className="zg-state-title">Access denied</h2>
        <p className="zg-state-text">{failure.message}</p>
      </div>
    )
  }
  return (
    <div className="zg-callout zg-callout-error" role="alert" data-testid="dashboard-failure">
      <span aria-hidden="true">⚠️</span>
      <div>
        {failure.message}{' '}
        <button type="button" className="zg-link-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}

/** The page head every dashboard shares: greeting, subtitle, Refresh. */
export function DashboardHead({
  title,
  subtitle,
  loading,
  onRefresh,
}: {
  title: string
  subtitle: string
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="zg-page-head">
      <div>
        <h1 className="zg-title">{title}</h1>
        <p className="zg-subtitle mb-0">{subtitle}</p>
      </div>
      <div className="zg-page-head-actions">
        <button type="button" className="zg-btn zg-btn-secondary" onClick={onRefresh} disabled={loading} aria-busy={loading}>
          {loading ? (
            <>
              <span className="zg-spinner-sm" aria-hidden="true" /> Refreshing...
            </>
          ) : (
            <>
              <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
            </>
          )}
        </button>
      </div>
    </div>
  )
}
