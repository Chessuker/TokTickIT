/**
 * Date and time for Lab 4 screens (specification.md BR-25, AD-11; ui-spec.md
 * §1.5).
 *
 * The server speaks UTC ISO-8601 only. Every user is in Thailand, so every
 * timestamp is shown — and every `datetime-local` input is read — in
 * Asia/Bangkok, whatever the machine's own time zone or locale. Bangkok has no
 * daylight saving, so a fixed +07:00 offset is exact all year.
 *
 * The locale is pinned to `en-GB` with the Gregorian calendar and Latin
 * digits: a Thai-locale browser would otherwise print the Buddhist year (2569)
 * and Thai digits, which is what broke a Lab 3 date test on a local machine.
 */

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const MINUTE_MS = 60_000

/** BR-05: the server accepts Action Date/Time up to 5 minutes ahead. */
export const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS

const DISPLAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  calendar: 'gregory',
  numberingSystem: 'latn',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "3 Oct 2026, 14:05" in Bangkok time; "—" for a missing or bad value. */
export function formatBangkok(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    DISPLAY.formatToParts(date).find((entry) => entry.type === type)?.value ?? ''

  return `${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')}`
}

/** A UTC instant as the `YYYY-MM-DDTHH:mm` a `datetime-local` input shows, in Bangkok time. */
export function toBangkokInput(instant: string | Date | number): string {
  const ms = new Date(instant).getTime()
  return new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 16)
}

/** The value of a `datetime-local` input, read as Bangkok time, as a UTC ISO string. */
export function toUtcIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  const ms = Date.parse(`${local}:00.000+07:00`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/**
 * The earliest value the Action Date/Time input may offer: the ticket's
 * `createdAt` rounded **up** to the next whole minute. The server compares to
 * `createdAt` exactly (BR-05, PR #60 review); the input has minute precision,
 * so rounding up is what keeps every choice it offers valid.
 */
export function minActionInput(ticketCreatedAt: string): string {
  const ms = new Date(ticketCreatedAt).getTime()
  return toBangkokInput(Math.ceil(ms / MINUTE_MS) * MINUTE_MS)
}

/** The latest value the input may offer: now + 5 minutes, rounded down to the minute. */
export function maxActionInput(now: number = Date.now()): string {
  return toBangkokInput(Math.floor((now + FUTURE_TOLERANCE_MS) / MINUTE_MS) * MINUTE_MS)
}

/** The default for a new Action: now, but never earlier than the minimum. */
export function defaultActionInput(ticketCreatedAt: string, now: number = Date.now()): string {
  const current = toBangkokInput(Math.floor(now / MINUTE_MS) * MINUTE_MS)
  const minimum = minActionInput(ticketCreatedAt)
  return current < minimum ? minimum : current
}
