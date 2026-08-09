import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CategoryList from './CategoryList'

describe('CategoryList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a loading state while the request is in flight', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<CategoryList />)

    expect(screen.getAllByText('Loading categories...').length).toBeGreaterThan(0)
  })

  it('renders categories returned by the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: '1', name: 'Hardware' },
        { id: '2', name: 'Software' }
      ])
    } as Response)

    render(<CategoryList />)

    await waitFor(() => {
      expect(screen.getByText('Hardware')).toBeInTheDocument()
    })
    expect(screen.getByText('Software')).toBeInTheDocument()
    expect(screen.queryByText('Loading categories...')).not.toBeInTheDocument()
  })

  it('shows an error state when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    render(<CategoryList />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load categories. Please try again.')).toBeInTheDocument()
    })
  })
})
