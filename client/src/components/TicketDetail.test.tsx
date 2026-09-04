import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TicketDetail from './TicketDetail'
import { RequesterProvider } from '../context/RequesterProvider'
import { REQUESTER_STORAGE_KEY } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * UI-05 (AC-05) and UI-06 (AC-09) — the Requester Ticket Detail screen.
 *
 * The stub below is a small fake of the four detail-screen endpoints rather
 * than a canned response: uploading and removing mutate the fake's attachment
 * list, so the assertions describe a screen that re-reads the ticket after a
 * write instead of one that patches its own state and hopes.
 */

const JENNIFER: Requester = {
  id: 'aaaaaaaa-1111-4222-8333-444455556666',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar',
}

const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666'

interface StubAttachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  isRemoved: boolean
  removedReason: string | null
  removedAt: string | null
}

function attachment(overrides: Partial<StubAttachment> = {}): StubAttachment {
  return {
    id: 'att-1',
    fileName: 'battery-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 184320,
    uploadedAt: '2026-08-23T04:20:00.000Z',
    isRemoved: false,
    removedReason: null,
    removedAt: null,
    ...overrides,
  }
}

const TICKET = {
  id: TICKET_ID,
  ticketNumber: 'TKT-2026-000042',
  summary: 'Laptop battery drains quickly',
  description: 'The battery drops from 100% to 20% within an hour of unplugging.',
  status: 'New',
  priority: 'High',
  category: { id: 'cat-1', name: 'Hardware' },
  relatedSystem: { id: 'sys-1', name: 'Corporate Laptop' },
  requester: JENNIFER,
  createdAt: '2026-08-23T04:15:00.000Z',
  updatedAt: '2026-08-24T09:30:00.000Z',
}

interface StubOptions {
  /** Answers every ticket read with this status instead of 200. */
  ticketStatus?: number
  attachments?: StubAttachment[]
  /** Status for `POST /api/tickets/:id/attachments`. */
  uploadStatus?: number
  uploadMessage?: string
  /** Status for `GET /api/attachments/:id/download`. */
  downloadStatus?: number
}

function stubApi(options: StubOptions = {}) {
  const files = [...(options.attachments ?? [])]

  const detailBody = () => ({
    ...TICKET,
    attachmentCount: files.filter((file) => !file.isRemoved).length,
    attachments: [...files]
      .sort((a, b) => Number(a.isRemoved) - Number(b.isRemoved))
      .map((file) => ({
        ...file,
        downloadUrl: file.isRemoved ? null : `/api/attachments/${file.id}/download`,
      })),
  })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.pathname === `/api/tickets/${TICKET_ID}` && method === 'GET') {
      const status = options.ticketStatus ?? 200

      if (status === 403) {
        return new Response(
          JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'This ticket belongs to another requester.' },
          }),
          { status: 403 },
        )
      }

      if (status !== 200) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } }),
          { status },
        )
      }

      return new Response(JSON.stringify(detailBody()), { status: 200 })
    }

    if (url.pathname === `/api/tickets/${TICKET_ID}/attachments` && method === 'POST') {
      const status = options.uploadStatus ?? 201

      if (status !== 201) {
        return new Response(
          JSON.stringify({
            error: { code: 'FILE_TOO_LARGE', message: options.uploadMessage ?? 'Rejected.' },
          }),
          { status },
        )
      }

      const form = init?.body as FormData | undefined
      const uploaded = form?.get('file') as File
      files.push(
        attachment({
          id: `att-${files.length + 1}`,
          fileName: uploaded.name,
          mimeType: uploaded.type,
          sizeBytes: uploaded.size,
        }),
      )
      return new Response(JSON.stringify({ ok: true }), { status: 201 })
    }

    const removeMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/remove$/)
    if (removeMatch && method === 'PATCH') {
      const { reason } = JSON.parse(String(init?.body ?? '{}')) as { reason?: string }

      if (!reason || reason.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: { code: 'VALIDATION_FAILED', fields: { reason: 'A reason is required.' } },
          }),
          { status: 400 },
        )
      }

      const target = files.find((file) => file.id === removeMatch[1])
      if (target) {
        target.isRemoved = true
        target.removedReason = reason.trim()
        target.removedAt = '2026-08-25T10:00:00.000Z'
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const downloadMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/)
    if (downloadMatch && method === 'GET') {
      const target = files.find((file) => file.id === downloadMatch[1])

      if (options.downloadStatus && options.downloadStatus !== 200) {
        return new Response(
          JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'This attachment has been removed.' },
          }),
          { status: options.downloadStatus },
        )
      }

      if (!target || target.isRemoved) {
        return new Response(
          JSON.stringify({
            error: { code: 'FORBIDDEN', message: 'This attachment has been removed.' },
          }),
          { status: 403 },
        )
      }

      return new Response('%PDF-1.7 bytes', { status: 200 })
    }

    return new Response('{}', { status: 404 })
  })

  return fetchMock
}

function renderDetail(options: StubOptions = {}) {
  const fetchMock = stubApi(options)
  vi.stubGlobal('fetch', fetchMock)
  window.sessionStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(JENNIFER))

  render(
    <MemoryRouter initialEntries={[`/tickets/${TICKET_ID}`]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )

  return fetchMock
}

beforeEach(() => {
  window.sessionStorage.clear()
  // jsdom implements neither; the download path calls both.
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TicketDetail — read-only presentation (UI-05, AC-05)', () => {
  it('renders every ticket field as text', async () => {
    renderDetail()

    const fields = await screen.findByTestId('ticket-fields')

    expect(within(fields).getByText('TKT-2026-000042')).toBeInTheDocument()
    expect(within(fields).getByText('Hardware')).toBeInTheDocument()
    expect(within(fields).getByText('Corporate Laptop')).toBeInTheDocument()
    expect(within(fields).getByText(/Jennifer Anderson/)).toBeInTheDocument()
    expect(within(fields).getByText(TICKET.description)).toBeInTheDocument()
    expect(within(fields).getAllByText('High').length).toBeGreaterThan(0)
    expect(within(fields).getAllByText('New').length).toBeGreaterThan(0)
  })

  it('renders no editable control among the ticket fields', async () => {
    renderDetail()

    const fields = await screen.findByTestId('ticket-fields')

    expect(within(fields).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(fields).queryAllByRole('combobox')).toHaveLength(0)
    expect(within(fields).queryAllByRole('radio')).toHaveLength(0)
    expect(within(fields).queryAllByRole('button')).toHaveLength(0)
    expect(fields.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('offers no edit, save or status-change affordance anywhere on the screen', async () => {
    renderDetail()
    await screen.findByTestId('ticket-fields')

    for (const label of [/^edit/i, /^save/i, /change status/i, /assign/i, /add comment/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('shows the IT triage fields as an explicit Unassigned placeholder', async () => {
    renderDetail()

    const fields = await screen.findByTestId('ticket-fields')

    expect(within(fields).getAllByText('Unassigned')).toHaveLength(2)
  })
})

describe('TicketDetail — attachment list (BR-10, V-10)', () => {
  it('lists an active attachment with its size, upload date and both actions', async () => {
    renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')

    expect(within(list).getByText('battery-report.pdf')).toBeInTheDocument()
    expect(within(list).getByText('180 KB')).toBeInTheDocument()
    expect(within(list).getByText(/Uploaded/)).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /download battery-report\.pdf/i })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /remove battery-report\.pdf/i })).toBeInTheDocument()
  })

  it('shows a removed attachment with its reason and timestamp and no download button', async () => {
    renderDetail({
      attachments: [
        attachment({
          id: 'att-9',
          fileName: 'wrong-screenshot.png',
          isRemoved: true,
          removedReason: 'Uploaded the wrong screenshot',
          removedAt: '2026-08-25T10:00:00.000Z',
        }),
      ],
    })

    const removed = await screen.findByTestId('removed-attachments')

    expect(within(removed).getByText('wrong-screenshot.png')).toBeInTheDocument()
    expect(within(removed).getByText('Removed')).toBeInTheDocument()
    expect(within(removed).getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument()
    expect(within(removed).queryByRole('button', { name: /download/i })).toBeNull()
    expect(screen.queryByTestId('active-attachments')).toBeNull()
  })

  it('downloads an active attachment through the API with the requester header', async () => {
    const fetchMock = renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /download battery-report\.pdf/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).includes('/api/attachments/att-1/download'),
      )
      expect(call).toBeTruthy()
      const sent = (call?.[1]?.headers ?? {}) as Record<string, string>
      expect(sent['X-Requester-Id']).toBe(JENNIFER.id)
    })

    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('reports a refused download instead of failing silently', async () => {
    renderDetail({ attachments: [attachment()], downloadStatus: 403 })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /download battery-report\.pdf/i }))

    expect(await screen.findByText(/has been removed/i)).toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('TicketDetail — removal modal (UI-06, AC-09, BR-09)', () => {
  it('keeps Confirm disabled until a reason is typed', async () => {
    renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /remove battery-report\.pdf/i }))

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /confirm removal/i })

    expect(confirm).toBeDisabled()

    await userEvent.type(within(dialog).getByLabelText(/reason for removal/i), 'Wrong file')

    expect(confirm).toBeEnabled()
  })

  it('re-disables Confirm when the reason is cleared or is only whitespace', async () => {
    renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /remove battery-report\.pdf/i }))

    const dialog = await screen.findByRole('dialog')
    const reason = within(dialog).getByLabelText(/reason for removal/i)
    const confirm = within(dialog).getByRole('button', { name: /confirm removal/i })

    await userEvent.type(reason, 'Wrong file')
    expect(confirm).toBeEnabled()

    await userEvent.clear(reason)
    expect(confirm).toBeDisabled()

    await userEvent.type(reason, '   ')
    expect(confirm).toBeDisabled()
  })

  it('sends the reason and moves the file into the removed list', async () => {
    const fetchMock = renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /remove battery-report\.pdf/i }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(/reason for removal/i),
      '  Uploaded the wrong screenshot  ',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm removal/i }))

    const removed = await screen.findByTestId('removed-attachments')
    expect(within(removed).getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument()
    expect(screen.queryByTestId('active-attachments')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/api/attachments/att-1/remove'),
    )
    expect(call?.[1]?.method).toBe('PATCH')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ reason: 'Uploaded the wrong screenshot' })
  })

  it('closes without removing anything when Cancel is pressed', async () => {
    const fetchMock = renderDetail({ attachments: [attachment()] })

    const list = await screen.findByTestId('active-attachments')
    await userEvent.click(within(list).getByRole('button', { name: /remove battery-report\.pdf/i }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/reason for removal/i), 'Changed my mind')
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/remove')),
    ).toBe(false)
    expect(await screen.findByTestId('active-attachments')).toBeInTheDocument()
  })
})

describe('TicketDetail — upload zone (AC-06, AC-07, AC-08)', () => {
  it('uploads a picked file and shows it in the active list', async () => {
    const fetchMock = renderDetail()

    await screen.findByTestId('no-attachments')

    const file = new File(['%PDF-1.7'], 'evidence.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/add a file/i), file)

    const list = await screen.findByTestId('active-attachments')
    expect(within(list).getByText('evidence.pdf')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/api/tickets/${TICKET_ID}/attachments`) && init?.method === 'POST',
    )
    expect(call?.[1]?.body).toBeInstanceOf(FormData)
  })

  it('rejects a disallowed type in the browser without calling the API', async () => {
    const fetchMock = renderDetail()

    await screen.findByTestId('no-attachments')

    const file = new File(['not allowed'], 'notes.txt', { type: 'text/plain' })
    // `applyAccept: false` bypasses the `accept` attribute, which is the
    // browser's own filter — the assertion below is about the component's
    // check, which is what a drag-and-drop or a lying file type would hit.
    await userEvent.upload(screen.getByLabelText(/add a file/i), file, { applyAccept: false })

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false)
  })

  it('surfaces a server rejection under the upload control', async () => {
    renderDetail({ uploadStatus: 413, uploadMessage: 'The file is larger than the 5 MB limit.' })

    await screen.findByTestId('no-attachments')

    const file = new File(['%PDF-1.7'], 'huge.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/add a file/i), file)

    expect(await screen.findByText(/larger than the 5 MB limit/i)).toBeInTheDocument()
  })

  it('disables the picker once five files are active (AC-08)', async () => {
    renderDetail({
      attachments: Array.from({ length: 5 }, (_, index) =>
        attachment({ id: `att-${index}`, fileName: `file-${index}.pdf` }),
      ),
    })

    await screen.findByTestId('active-attachments')

    expect(screen.getByLabelText(/add a file/i)).toBeDisabled()
    expect(screen.getByText(/already has 5 active files/i)).toBeInTheDocument()
  })
})

describe('TicketDetail — ownership guard (AC-03, BR-04)', () => {
  it('shows access denied instead of ticket data on a 403', async () => {
    renderDetail({ ticketStatus: 403 })

    expect(await screen.findByTestId('access-denied')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-fields')).toBeNull()
    expect(screen.queryByText(TICKET.summary)).toBeNull()
    expect(screen.queryByText('TKT-2026-000042')).toBeNull()
  })

  it('shows a not-found screen for a ticket that does not exist', async () => {
    renderDetail({ ticketStatus: 404 })

    expect(await screen.findByTestId('ticket-not-found')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-fields')).toBeNull()
  })

  it('sends the selected requester in the header on every read', async () => {
    const fetchMock = renderDetail()

    await screen.findByTestId('ticket-fields')

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith(`/api/tickets/${TICKET_ID}`),
    )
    const sent = (call?.[1]?.headers ?? {}) as Record<string, string>
    expect(sent['X-Requester-Id']).toBe(JENNIFER.id)
  })
})
