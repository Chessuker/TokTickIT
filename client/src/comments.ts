/**
 * Rules and helpers shared by the Public Comments panel and, later, the
 * Internal Notes panel (Lab 3 BR-22, ui-spec.md §2 "Public vs Internal").
 * Kept apart from the components so the component files export components
 * only (fast refresh) and the helpers can be unit-tested on their own.
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

  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

/** The full timestamp shown on hover. */
export function fullTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
