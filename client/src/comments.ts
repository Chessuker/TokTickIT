import { formatBangkok, formatBangkokDate } from './components/lab-04/dates'

/**
 * Rules and helpers shared by the Public Comments panel and, later, the
 * Internal Notes panel (Lab 3 BR-22, ui-spec.md §2 "Public vs Internal").
 * Kept apart from the components so the component files export components
 * only (fast refresh) and the helpers can be unit-tested on their own.
 *
 * Lab 4 (Issue #57): absolute dates go through the Bangkok helpers, so a
 * Thai-locale browser shows the same "3 Oct 2026" as every other screen
 * instead of a Buddhist-calendar year. The dashboards reuse `relativeTime`.
 */

/** The server's limit (BR-22); the counter and the disabled submit mirror it. */
export const COMMENT_MAX_LENGTH = 2000

/** "3 minutes ago" for the row; the full timestamp goes on `title`. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((now - then) / 1000)
  if (seconds < 45) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  return formatBangkokDate(iso)
}

/** The full timestamp shown on hover, in Bangkok time; empty for a bad value. */
export function fullTimestamp(iso: string): string {
  const text = formatBangkok(iso)
  return text === '—' ? '' : text
}
