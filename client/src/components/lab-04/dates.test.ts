import { describe, it, expect } from 'vitest'
import { defaultActionInput, formatBangkok, formatBangkokDate, maxActionInput, minActionInput, toBangkokInput, toUtcIso } from './dates'

/** UNIT-10 — BR-25, AD-11: Bangkok display and `datetime-local` conversion. */

describe('formatBangkok', () => {
  it('shows UTC instants in Bangkok time, across midnight and month end', () => {
    expect(formatBangkok('2026-10-02T17:30:00.000Z')).toBe('3 Oct 2026, 00:30')
    expect(formatBangkok('2026-10-31T18:05:00.000Z')).toBe('1 Nov 2026, 01:05')
    expect(formatBangkok('2026-10-03T07:05:00.000Z')).toBe('3 Oct 2026, 14:05')
  })

  it('always prints the Gregorian year and Latin digits, whatever the machine locale', () => {
    expect(formatBangkok('2026-01-01T00:00:00.000Z')).toMatch(/2026/)
    expect(formatBangkok('2026-01-01T00:00:00.000Z')).not.toMatch(/2569/)
  })

  it('shows a dash for a missing or unparsable value', () => {
    expect(formatBangkok(null)).toBe('—')
    expect(formatBangkok('')).toBe('—')
    expect(formatBangkok('not a date')).toBe('—')
  })
})

describe('datetime-local conversion', () => {
  it('round-trips exactly through the Bangkok input value', () => {
    expect(toBangkokInput('2026-10-02T17:30:00.000Z')).toBe('2026-10-03T00:30')
    expect(toUtcIso('2026-10-03T00:30')).toBe('2026-10-02T17:30:00.000Z')
    for (const iso of ['2026-12-31T16:59:00.000Z', '2026-02-28T17:00:00.000Z']) {
      expect(toUtcIso(toBangkokInput(iso))).toBe(iso)
    }
  })

  it('refuses anything that is not a datetime-local value', () => {
    expect(toUtcIso('')).toBeNull()
    expect(toUtcIso('2026-10-03')).toBeNull()
    expect(toUtcIso('03/10/2026 14:05')).toBeNull()
  })
})

describe('Action Date/Time bounds (BR-05, PR #60 review)', () => {
  it('rounds the ticket createdAt UP to the next minute, so the input never offers a time before it', () => {
    // 03:20:45 UTC → 10:20:45 Bangkok → earliest offered minute 10:21.
    expect(minActionInput('2026-09-30T03:20:45.000Z')).toBe('2026-09-30T10:21')
    // Already on a whole minute: that minute itself is valid.
    expect(minActionInput('2026-09-30T03:20:00.000Z')).toBe('2026-09-30T10:20')
  })

  it('allows up to five minutes ahead of now, rounded down', () => {
    const now = Date.parse('2026-10-03T07:00:30.000Z')
    expect(maxActionInput(now)).toBe('2026-10-03T14:05')
  })

  it('defaults to now, but never earlier than the minimum', () => {
    const now = Date.parse('2026-10-03T07:00:30.000Z')
    expect(defaultActionInput('2026-09-30T03:20:45.000Z', now)).toBe('2026-10-03T14:00')
    // A ticket created in this very minute: the default moves up to the minimum.
    expect(defaultActionInput('2026-10-03T07:00:10.000Z', now)).toBe('2026-10-03T14:01')
  })
})

describe('formatBangkokDate (Issue #57: the Lab 2/3 list dates)', () => {
  it('shows the Bangkok calendar day, which can differ from the UTC one', () => {
    expect(formatBangkokDate('2026-10-02T17:30:00.000Z')).toBe('3 Oct 2026')
    expect(formatBangkokDate('2026-10-02T16:59:00.000Z')).toBe('2 Oct 2026')
  })

  it('never prints the Buddhist year, and shows a dash for a bad value', () => {
    expect(formatBangkokDate('2026-01-01T00:00:00.000Z')).not.toMatch(/2569/)
    expect(formatBangkokDate(null)).toBe('—')
    expect(formatBangkokDate('nope')).toBe('—')
  })
})

describe('month names (Issue #58)', () => {
  it('are always three letters, whatever the ICU data ("Sept" pushed the Queue date column over)', () => {
    expect(formatBangkok('2026-09-18T08:05:00.000Z')).toBe('18 Sep 2026, 15:05')
    expect(formatBangkokDate('2026-09-18T08:05:00.000Z')).toBe('18 Sep 2026')
    const months = Array.from({ length: 12 }, (_, m) => formatBangkokDate(new Date(Date.UTC(2026, m, 15)).toISOString()))
    expect(months.map((text) => text.split(' ')[1])).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  })
})
