import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  ActiveBadge,
  ItPriorityBadge,
  OwnerName,
  PriorityBadge,
  RequesterResolvedBadge,
  RoleBadge,
  StatusBadge,
} from '../Badges'

/**
 * UI-25 (V-13) — the shared badges: every value renders its class and a
 * written label, so colour is never the only signal.
 */

describe('StatusBadge', () => {
  it.each([
    ['New', 'New', 'zg-badge-status-new'],
    ['Open', 'Open', 'zg-badge-status-open'],
    ['InProgress', 'In Progress', 'zg-badge-status-in-progress'],
    ['WaitingForRequester', 'Waiting for Requester', 'zg-badge-status-waiting'],
    ['Reopened', 'Reopened', 'zg-badge-status-reopened'],
    ['Resolved', 'Resolved', 'zg-badge-status-resolved'],
    ['Closed', 'Closed', 'zg-badge-status-closed'],
    ['Cancelled', 'Cancelled', 'zg-badge-status-cancelled'],
  ])('%s → "%s" with %s', (value, label, className) => {
    render(<StatusBadge status={value} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveClass('zg-badge', className)
  })
})

describe('PriorityBadge and ItPriorityBadge', () => {
  it.each(['Low', 'Medium', 'High'])('requested %s', (value) => {
    render(<PriorityBadge priority={value} />)
    expect(screen.getByText(value)).toHaveClass('zg-badge', `zg-badge-priority-${value.toLowerCase()}`)
  })

  it.each(['Low', 'Medium', 'High'])('IT %s carries the IT prefix and its own class', (value) => {
    render(<ItPriorityBadge priority={value} />)
    expect(screen.getByText(`IT ${value}`)).toHaveClass('zg-badge', `zg-badge-it-priority-${value.toLowerCase()}`)
  })
})

describe('RoleBadge and ActiveBadge', () => {
  it.each([
    ['Requester', 'Requester', 'zg-badge-role-requester'],
    ['ITStaff', 'IT Staff', 'zg-badge-role-it-staff'],
    ['Administrator', 'Administrator', 'zg-badge-role-administrator'],
  ] as const)('%s → "%s"', (role, label, className) => {
    render(<RoleBadge role={role} />)
    expect(screen.getByText(label)).toHaveClass('zg-badge', className)
  })

  it('renders Active and Inactive', () => {
    const { rerender } = render(<ActiveBadge active />)
    expect(screen.getByText('Active')).toHaveClass('zg-badge-active')
    rerender(<ActiveBadge active={false} />)
    expect(screen.getByText('Inactive')).toHaveClass('zg-badge-inactive')
  })
})

describe('OwnerName and RequesterResolvedBadge', () => {
  it('shows the name, or the italic Unassigned placeholder', () => {
    const { rerender } = render(<OwnerName owner={{ name: 'Priya Raman' }} />)
    expect(screen.getByText('Priya Raman')).toHaveClass('zg-owner')
    rerender(<OwnerName owner={null} />)
    expect(screen.getByText('Unassigned')).toHaveClass('zg-owner-unassigned')
  })

  it('writes the indication and carries the timestamp on hover', () => {
    render(<RequesterResolvedBadge at="2026-09-14T08:00:00.000Z" />)
    const badge = screen.getByTestId('requester-resolved')
    expect(badge).toHaveTextContent('Requester reports resolved')
    expect(badge).toHaveClass('zg-badge-requester-resolved')
    expect(badge.getAttribute('title')).toMatch(/Reported resolved/)
  })
})
