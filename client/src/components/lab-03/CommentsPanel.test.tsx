import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommentsPanel from './CommentsPanel'
import { relativeTime } from '../../comments'

/**
 * The parts of the Public Comments panel that the Requester Ticket Detail
 * suite (UI-19) does not exercise: the read-only mode an Administrator gets
 * (BR-17, BR-23) and the relative-time helper.
 */

const THREAD = {
  data: [
    {
      id: 'cmt-1',
      body: 'We are investigating the issue on your device.',
      author: { id: 's-1', name: 'Priya Raman', role: 'ITStaff' },
      createdAt: '2026-08-24T09:30:00.000Z',
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CommentsPanel — composer visibility (BR-17, BR-23)', () => {
  it('offers the composer when the caller may comment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(THREAD), { status: 200 })))

    render(<CommentsPanel ticketId="t-1" canComment />)

    expect(await screen.findByTestId('comment-list')).toBeInTheDocument()
    expect(screen.getByLabelText(/add public comment/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /post comment/i })).toBeInTheDocument()
  })

  it('renders the thread read-only, with no composer, when the caller may not comment', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(THREAD), { status: 200 })))

    render(<CommentsPanel ticketId="t-1" canComment={false} />)

    expect(await screen.findByTestId('comment-list')).toBeInTheDocument()
    expect(screen.queryByLabelText(/add public comment/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /post comment/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows a retryable error when the thread cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }), { status: 500 })),
    )

    render(<CommentsPanel ticketId="t-1" canComment />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('relativeTime', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z')

  it.each([
    ['2026-08-25T11:59:50.000Z', 'just now'],
    ['2026-08-25T11:59:00.000Z', '1 minute ago'],
    ['2026-08-25T11:35:00.000Z', '25 minutes ago'],
    ['2026-08-25T09:00:00.000Z', '3 hours ago'],
    ['2026-08-23T12:00:00.000Z', '2 days ago'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, NOW)).toBe(expected)
  })

  it('falls back to a locale date once the comment is older than a month', () => {
    const iso = '2026-06-01T12:00:00.000Z'
    expect(relativeTime(iso, NOW)).toBe(
      new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }),
    )
    expect(relativeTime(iso, NOW)).not.toMatch(/ago$/)
  })

  it('returns an empty string for an unparseable value', () => {
    expect(relativeTime('not a date', NOW)).toBe('')
  })
})
