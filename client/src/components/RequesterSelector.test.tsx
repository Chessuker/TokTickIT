import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import App from '../App'
import RequesterSelector from './RequesterSelector'
import { RequesterProvider } from '../context/RequesterProvider'
import { REQUESTER_STORAGE_KEY } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * UI-01 (AC-02) — the guard redirects to the selector when no requester is set.
 * UI-02 (AC-14, BR-03) — the selector lists active requesters only and states
 * clearly that it is not a real login.
 */

const ACTIVE_REQUESTERS: Requester[] = [
  { id: 'r-3', name: 'David Lee', email: 'david.lee@kmutt.ac.th', department: 'Engineering' },
  { id: 'r-1', name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th', department: 'Registrar' },
  { id: 'r-2', name: 'Sarah Johnson', email: 'sarah.johnson@kmutt.ac.th', department: 'Finance' },
]

/** Present in the seed with isActive = false; the API must never return it. */
const INACTIVE_REQUESTER_NAME = 'Alex Smith'

function mockRequestersResponse(data: Requester[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  })
}

function renderSelector() {
  return render(
    <MemoryRouter initialEntries={['/select-requester']}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelector />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.stubGlobal('fetch', mockRequestersResponse(ACTIVE_REQUESTERS))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RequesterSelector — guard and redirect (UI-01)', () => {
  it('redirects to the selector when an application screen is opened with no requester', async () => {
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <App />
        </RequesterProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /development requester selection/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^my tickets$/i })).not.toBeInTheDocument()
  })

  it('redirects to the selector from every guarded route', async () => {
    for (const path of ['/tickets/new', '/system', '/somewhere-unknown']) {
      const view = render(
        <MemoryRouter initialEntries={[path]}>
          <RequesterProvider>
            <App />
          </RequesterProvider>
        </MemoryRouter>,
      )

      expect(
        await screen.findByRole('heading', { name: /development requester selection/i }),
      ).toBeInTheDocument()

      view.unmount()
    }
  })

  it('does not redirect once a requester is stored for the session', async () => {
    window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(ACTIVE_REQUESTERS[0]))

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <App />
        </RequesterProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /^my tickets$/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /development requester selection/i }),
    ).not.toBeInTheDocument()
  })
})

describe('RequesterSelector — content and warning (UI-02)', () => {
  it('shows the "not a real login" warning callout', async () => {
    renderSelector()

    expect(
      await screen.findByText(/testing mechanism only, not a real login screen/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/authentication coming in lab 3/i)).toBeInTheDocument()
  })

  it('lists every active requester returned by the API', async () => {
    renderSelector()

    for (const requester of ACTIVE_REQUESTERS) {
      expect(
        await screen.findByRole('option', { name: new RegExp(requester.name, 'i') }),
      ).toBeInTheDocument()
    }
  })

  it('does not list the inactive requester (AC-14)', async () => {
    renderSelector()

    await screen.findByRole('option', { name: /jennifer anderson/i })

    expect(
      screen.queryByRole('option', { name: new RegExp(INACTIVE_REQUESTER_NAME, 'i') }),
    ).not.toBeInTheDocument()
    // One option per active requester, plus the placeholder.
    expect(screen.getAllByRole('option')).toHaveLength(ACTIVE_REQUESTERS.length + 1)
  })
})

describe('RequesterSelector — states and continue', () => {
  it('shows a loading state while the requesters are being fetched', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      ),
    )

    renderSelector()

    expect(screen.getByRole('status')).toHaveTextContent(/loading requesters/i)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    resolveFetch({ ok: true, status: 200, json: async () => ({ data: ACTIVE_REQUESTERS }) })

    expect(await screen.findByRole('option', { name: /jennifer anderson/i })).toBeInTheDocument()
  })

  it('shows an error state and can retry when the API fails', async () => {
    const user = userEvent.setup()
    const failing = vi.fn().mockRejectedValueOnce(new Error('network down'))
    failing.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: ACTIVE_REQUESTERS }),
    })
    vi.stubGlobal('fetch', failing)

    renderSelector()

    expect(await screen.findByText(/failed to load requesters/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByRole('option', { name: /jennifer anderson/i })).toBeInTheDocument()
    expect(screen.queryByText(/failed to load requesters/i)).not.toBeInTheDocument()
  })

  it('shows an error state when the API answers with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )

    renderSelector()

    expect(await screen.findByText(/failed to load requesters/i)).toBeInTheDocument()
  })

  it('disables Continue until a requester is chosen, then navigates to My Tickets', async () => {
    const user = userEvent.setup()
    renderSelector()

    const continueButton = await screen.findByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()

    await user.selectOptions(
      screen.getByLabelText(/development requester/i),
      ACTIVE_REQUESTERS[1].id,
    )
    expect(continueButton).toBeEnabled()

    await user.click(continueButton)

    expect(await screen.findByRole('heading', { name: /^my tickets$/i })).toBeInTheDocument()
  })

  it('persists the chosen requester for the session', async () => {
    const user = userEvent.setup()
    renderSelector()

    await user.selectOptions(
      await screen.findByLabelText(/development requester/i),
      ACTIVE_REQUESTERS[1].id,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      const stored = window.sessionStorage.getItem(REQUESTER_STORAGE_KEY)
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored as string)).toEqual(ACTIVE_REQUESTERS[1])
    })
  })

  it('returns the user to the screen the guard bounced them from', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/tickets/new']}>
        <RequesterProvider>
          <App />
        </RequesterProvider>
      </MemoryRouter>,
    )

    await user.selectOptions(
      await screen.findByLabelText(/development requester/i),
      ACTIVE_REQUESTERS[1].id,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: /create ticket/i })).toBeInTheDocument()
  })

  it('shows a no-active-requesters message rather than an error on an empty list', async () => {
    vi.stubGlobal('fetch', mockRequestersResponse([]))

    renderSelector()

    expect(await screen.findByText(/no active requesters are available/i)).toBeInTheDocument()
    expect(screen.queryByText(/failed to load requesters/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })
})
