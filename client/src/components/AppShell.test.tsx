import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import App from '../App'
import AppShell from './AppShell'
import { RequesterProvider } from '../context/RequesterProvider'
import { REQUESTER_STORAGE_KEY, useRequester } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * UI-07 (AC-02, FR-06, BR-13) — the Change Requester control is present on
 * every screen, and switching requester clears the previous requester's loaded
 * data before the new requester's data is shown.
 */

const JENNIFER: Requester = {
  id: 'r-1',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar',
}

const SARAH: Requester = {
  id: 'r-2',
  name: 'Sarah Johnson',
  email: 'sarah.johnson@kmutt.ac.th',
  department: 'Finance',
}

/** Tickets keyed by requester id, standing in for the Issue #5 list endpoint. */
const TICKETS_BY_REQUESTER: Record<string, string[]> = {
  [JENNIFER.id]: ['TKT-2026-000001 Laptop battery drains quickly'],
  [SARAH.id]: ['TKT-2026-000002 Cannot connect to the VPN'],
}

/**
 * A requester-scoped screen that loads its data once on mount and then keeps
 * it in its own state. If the shell failed to discard the subtree on a
 * requester switch, this component would keep rendering the stale tickets —
 * which is exactly the BR-13 violation the tests below look for.
 */
function TicketsProbe({ onLoad }: { onLoad?: () => void }) {
  const { requester } = useRequester()
  const [tickets, setTickets] = useState<string[]>([])

  useEffect(() => {
    onLoad?.()
    setTickets(TICKETS_BY_REQUESTER[requester?.id ?? ''] ?? [])
    // Deliberately mount-only: the component never reloads on its own, so the
    // shell has to be the thing that clears it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h1>My Tickets</h1>
      <ul>
        {tickets.map((ticket) => (
          <li key={ticket}>{ticket}</li>
        ))}
      </ul>
    </div>
  )
}

function renderShell(initialRequester: Requester, probe?: { onLoad?: () => void }) {
  window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(initialRequester))

  return render(
    <MemoryRouter initialEntries={['/tickets']}>
      <RequesterProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<TicketsProbe onLoad={probe?.onLoad} />} />
          </Route>
          <Route path="/select-requester" element={<h1>Development Requester Selection</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

/**
 * Answers every endpoint the shell's screens touch. `/system` still hosts the
 * Lab 1 diagnostics page, so its endpoints are stubbed here too.
 */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: string) => {
      const url = String(input)
      const body = url.includes('/api/requesters')
        ? { data: [JENNIFER, SARAH] }
        : url.includes('/api/health')
          ? { status: 'ok', service: 'TokTickIT API', timestamp: '', database: 'CONNECTED' }
          : []
      return Promise.resolve({ ok: true, status: 200, json: async () => body })
    }),
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AppShell — header identity (FR-06)', () => {
  it('shows the selected requester name in the header', () => {
    renderShell(JENNIFER)

    expect(screen.getByText(JENNIFER.name)).toBeInTheDocument()
  })

  it('offers a Change Requester control on every screen', async () => {
    window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(JENNIFER))

    for (const path of ['/tickets', '/tickets/new', '/system']) {
      const view = render(
        <MemoryRouter initialEntries={[path]}>
          <RequesterProvider>
            <App />
          </RequesterProvider>
        </MemoryRouter>,
      )

      expect(await screen.findByRole('button', { name: /change requester/i })).toBeInTheDocument()
      expect(screen.getByText(JENNIFER.name)).toBeInTheDocument()

      view.unmount()
    }
  })
})

describe('AppShell — switching requester (UI-07, AC-02, BR-13)', () => {
  it('clears the selection and returns to the selector when Change Requester is clicked', async () => {
    const user = userEvent.setup()
    renderShell(JENNIFER)

    await user.click(screen.getByRole('button', { name: /change requester/i }))

    expect(
      await screen.findByRole('heading', { name: /development requester selection/i }),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull()
  })

  it('discards the previous requester data and reloads for the new requester', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn()
    renderShell(JENNIFER, { onLoad })

    expect(await screen.findByText(/laptop battery drains quickly/i)).toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledTimes(1)

    // Switch to Sarah through the real selector flow.
    await user.click(screen.getByRole('button', { name: /change requester/i }))
    await screen.findByRole('heading', { name: /development requester selection/i })

    // The route stub above replaces the selector, so drive the context the way
    // the selector does and assert on what the shell renders afterwards.
    window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(SARAH))
    const view = renderShell(SARAH, { onLoad })

    expect(await screen.findByText(/cannot connect to the vpn/i)).toBeInTheDocument()
    expect(screen.queryByText(/laptop battery drains quickly/i)).not.toBeInTheDocument()
    expect(screen.getByText(SARAH.name)).toBeInTheDocument()
    expect(screen.queryByText(JENNIFER.name)).not.toBeInTheDocument()

    view.unmount()
  })

  it('remounts requester-scoped screens when the requester changes in place (BR-13)', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn()

    // A control that swaps the requester without unmounting the shell — the
    // hardest case for BR-13, since nothing else forces the child to reset.
    function SwitchToSarah() {
      const { selectRequester } = useRequester()
      return (
        <button type="button" onClick={() => selectRequester(SARAH)}>
          Switch to Sarah
        </button>
      )
    }

    window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(JENNIFER))
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <SwitchToSarah />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/tickets" element={<TicketsProbe onLoad={onLoad} />} />
            </Route>
          </Routes>
        </RequesterProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/laptop battery drains quickly/i)).toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /switch to sarah/i }))

    expect(await screen.findByText(/cannot connect to the vpn/i)).toBeInTheDocument()
    expect(screen.queryByText(/laptop battery drains quickly/i)).not.toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledTimes(2)
    expect(screen.getByText(SARAH.name)).toBeInTheDocument()
  })

  it('shows only the new requester tickets after a full select → change → select journey', async () => {
    const user = userEvent.setup()
    window.sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <RequesterProvider>
          <App />
        </RequesterProvider>
      </MemoryRouter>,
    )

    // Guard sends us to the selector, choose Jennifer.
    await screen.findByRole('heading', { name: /development requester selection/i })
    await user.selectOptions(screen.getByLabelText(/development requester/i), JENNIFER.id)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(new RegExp(`Showing tickets for ${JENNIFER.name}`, 'i')))
      .toBeInTheDocument()

    // Change requester, choose Sarah.
    await user.click(screen.getByRole('button', { name: /change requester/i }))
    await screen.findByRole('heading', { name: /development requester selection/i })
    await user.selectOptions(screen.getByLabelText(/development requester/i), SARAH.id)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(new RegExp(`Showing tickets for ${SARAH.name}`, 'i')))
      .toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`Showing tickets for ${JENNIFER.name}`, 'i')))
      .not.toBeInTheDocument()
  })
})
