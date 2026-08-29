import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CreateTicketForm from './CreateTicketForm'
import { RequesterContext } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * UI-03 (AC-01) — submitting an empty form renders an error under each
 * offending field and never reaches the API.
 * UI-08 (AC-12, FR-07) — a backend failure shows a callout and leaves every
 * entered value in place so the user can retry immediately.
 */

const REQUESTER: Requester = {
  id: '6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2',
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar',
}

const CATEGORIES = [
  { id: 'cat-hardware', name: 'Hardware' },
  { id: 'cat-network', name: 'Network' },
]

const RELATED_SYSTEMS = [
  { id: 'sys-laptop', name: 'Corporate Laptop' },
  { id: 'sys-wifi', name: 'Campus Wi-Fi' },
]

const SUMMARY = 'Laptop battery drains quickly'
const DESCRIPTION = 'The battery drops from 100% to 20% within an hour of unplugging.'

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/** Answers the two reference-data requests; POST behaviour is per-test. */
function createFetchMock(onCreate?: () => Promise<unknown>) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (!onCreate) throw new Error(`Unexpected POST to ${url}`)
      return onCreate()
    }
    if (url.endsWith('/api/categories')) {
      return Promise.resolve(jsonResponse(200, { data: CATEGORIES }))
    }
    if (url.endsWith('/api/related-systems')) {
      return Promise.resolve(jsonResponse(200, { data: RELATED_SYSTEMS }))
    }
    throw new Error(`Unexpected request to ${url}`)
  })
}

function renderForm() {
  const contextValue = {
    requester: REQUESTER,
    selectRequester: vi.fn(),
    clearRequester: vi.fn(),
  }

  return render(
    <MemoryRouter>
      <RequesterContext.Provider value={contextValue}>
        <CreateTicketForm />
      </RequesterContext.Provider>
    </MemoryRouter>,
  )
}

/** Waits for the master data to arrive so the dropdowns are enabled. */
async function renderLoadedForm() {
  const result = renderForm()
  await waitFor(() => expect(screen.getByLabelText(/^Category/)).toBeEnabled())
  return result
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Summary \/ Title/), SUMMARY)
  await user.type(screen.getByLabelText(/^Description/), DESCRIPTION)
  await user.selectOptions(screen.getByLabelText(/^Category/), 'cat-hardware')
  await user.selectOptions(screen.getByLabelText(/^Related System/), 'sys-laptop')
  await user.click(screen.getByRole('radio', { name: 'High' }))
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: /Create Ticket/i }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CreateTicketForm — master data (screen load)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchMock())
  })

  it('populates the Category and Related System dropdowns from the API', async () => {
    await renderLoadedForm()

    const category = screen.getByLabelText(/^Category/)
    expect(within(category).getByRole('option', { name: 'Hardware' })).toBeInTheDocument()
    expect(within(category).getByRole('option', { name: 'Network' })).toBeInTheDocument()

    const relatedSystem = screen.getByLabelText(/^Related System/)
    expect(within(relatedSystem).getByRole('option', { name: 'Corporate Laptop' })).toBeInTheDocument()
    expect(within(relatedSystem).getByRole('option', { name: 'Campus Wi-Fi' })).toBeInTheDocument()
  })

  it('offers the three requested priorities with no ticket number or status input', async () => {
    await renderLoadedForm()

    for (const priority of ['Low', 'Medium', 'High']) {
      expect(screen.getByRole('radio', { name: priority })).toBeInTheDocument()
    }
    // BR-01 / BR-02: both are server-owned and must not be enterable.
    expect(screen.queryByLabelText(/ticket number/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^status/i)).not.toBeInTheDocument()
  })
})

describe('CreateTicketForm — validation (UI-03, AC-01)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchMock())
  })

  it('renders an error under every required field when submitting an empty form', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await submit(user)

    expect(await screen.findByText('Summary is required.')).toBeInTheDocument()
    expect(screen.getByText('Description is required.')).toBeInTheDocument()
    expect(screen.getByText('Category is required.')).toBeInTheDocument()
    expect(screen.getByText('Related System is required.')).toBeInTheDocument()
  })

  it('blocks the submit — no ticket is posted while the form is invalid', async () => {
    const user = userEvent.setup()
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    await renderLoadedForm()

    await submit(user)

    const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(posts).toHaveLength(0)
  })

  it('marks the offending field invalid and links the message to it', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await submit(user)

    const summary = await screen.findByLabelText(/^Summary \/ Title/)
    expect(summary).toHaveAttribute('aria-invalid', 'true')
    expect(summary).toHaveAttribute('aria-describedby', 'summary-error')
    expect(screen.getByText('Summary is required.')).toHaveAttribute('id', 'summary-error')
  })

  it('rejects a summary that is too short', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await user.type(screen.getByLabelText(/^Summary \/ Title/), 'Wifi')
    await submit(user)

    expect(await screen.findByText(/Summary must be between 5 and 150 characters\./)).toBeInTheDocument()
  })

  it('clears a field error as soon as the field is corrected', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await submit(user)
    expect(await screen.findByText('Summary is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Summary \/ Title/), SUMMARY)

    expect(screen.queryByText('Summary is required.')).not.toBeInTheDocument()
  })

  it('shows server-supplied field errors under the matching fields', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      createFetchMock(async () =>
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'One or more fields are invalid.',
            fields: { categoryId: 'Category not found.' },
          },
        }),
      ),
    )
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)

    expect(await screen.findByText('Category not found.')).toBeInTheDocument()
  })
})

describe('CreateTicketForm — submitting state', () => {
  it('disables the button and shows a busy label while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      createFetchMock(() => new Promise((resolve) => {
        resolveCreate = resolve
      })),
    )
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)

    const button = screen.getByRole('button', { name: /Creating ticket/i })
    expect(button).toBeDisabled()

    resolveCreate(jsonResponse(201, { id: 't-1', ticketNumber: 'TKT-2026-000001', status: 'New', priority: 'High' }))
    await screen.findByText('TKT-2026-000001')
  })
})

describe('CreateTicketForm — success (AC-01)', () => {
  it('shows the ticket number returned by the server and a way onward', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      createFetchMock(async () =>
        jsonResponse(201, {
          id: 'c3d4e5f6-1111-4222-8333-444455556666',
          ticketNumber: 'TKT-2026-000042',
          status: 'New',
          priority: 'High',
        }),
      ),
    )
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)

    expect(await screen.findByText('TKT-2026-000042')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to My Tickets' })).toHaveAttribute('href', '/tickets')
    expect(screen.getByRole('link', { name: 'View ticket' })).toHaveAttribute(
      'href',
      '/tickets/c3d4e5f6-1111-4222-8333-444455556666',
    )
  })

  it('sends the requester in the header and never in the body', async () => {
    const user = userEvent.setup()
    const fetchMock = createFetchMock(async () =>
      jsonResponse(201, { id: 't-1', ticketNumber: 'TKT-2026-000001', status: 'New', priority: 'High' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)
    await screen.findByText('TKT-2026-000001')

    const [, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'POST')!
    const request = init as RequestInit
    expect((request.headers as Record<string, string>)['X-Requester-Id']).toBe(REQUESTER.id)

    const body = JSON.parse(request.body as string)
    expect(body).not.toHaveProperty('requesterId')
    expect(body).not.toHaveProperty('ticketNumber')
    expect(body).not.toHaveProperty('status')
    expect(body).toMatchObject({
      summary: SUMMARY,
      description: DESCRIPTION,
      categoryId: 'cat-hardware',
      relatedSystemId: 'sys-laptop',
      priority: 'High',
    })
  })
})

describe('CreateTicketForm — backend failure (UI-08, AC-12, FR-07)', () => {
  it('shows an error callout and keeps every entered value after a 500', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      createFetchMock(async () =>
        jsonResponse(500, {
          error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
        }),
      ),
    )
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)

    const callout = await screen.findByRole('alert')
    expect(callout).toHaveTextContent('Something went wrong. Please try again.')

    expect(screen.getByLabelText(/^Summary \/ Title/)).toHaveValue(SUMMARY)
    expect(screen.getByLabelText(/^Description/)).toHaveValue(DESCRIPTION)
    expect(screen.getByLabelText(/^Category/)).toHaveValue('cat-hardware')
    expect(screen.getByLabelText(/^Related System/)).toHaveValue('sys-laptop')
    expect(screen.getByRole('radio', { name: 'High' })).toBeChecked()
  })

  it('keeps every entered value when the server cannot be reached at all', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      createFetchMock(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Summary \/ Title/)).toHaveValue(SUMMARY)
    expect(screen.getByLabelText(/^Description/)).toHaveValue(DESCRIPTION)
  })

  it('returns the submit button to its idle state so the user can retry', async () => {
    const user = userEvent.setup()
    const fetchMock = createFetchMock(() => Promise.reject(new TypeError('Failed to fetch')))
    vi.stubGlobal('fetch', fetchMock)
    await renderLoadedForm()

    await fillValidForm(user)
    await submit(user)
    await screen.findByText(/Could not reach the server/)

    const button = screen.getByRole('button', { name: 'Create Ticket' })
    expect(button).toBeEnabled()

    await submit(user)

    const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(posts).toHaveLength(2)
  })
})

describe('CreateTicketForm — attachments (BR-05, BR-06, BR-07)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchMock())
  })

  function makeFile(name: string, type: string, sizeBytes: number) {
    const file = new File(['x'], name, { type })
    Object.defineProperty(file, 'size', { value: sizeBytes })
    return file
  }

  it('accepts an allowed file and lists it with its size', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await user.upload(screen.getByLabelText('Attachments'), makeFile('screenshot.png', 'image/png', 120 * 1024))

    expect(await screen.findByText('screenshot.png')).toBeInTheDocument()
    expect(screen.getByText('120 KB')).toBeInTheDocument()
  })

  it('rejects a file over 5 MB and explains why', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await user.upload(
      screen.getByLabelText('Attachments'),
      makeFile('huge-scan.pdf', 'application/pdf', 6 * 1024 * 1024),
    )

    expect(await screen.findByText(/huge-scan\.pdf — File is 6\.0 MB\. The limit is 5\.0 MB\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove huge-scan.pdf' })).not.toBeInTheDocument()
  })

  // Dropped rather than picked: the file input carries an `accept` list, so the
  // browser (and userEvent) filters a disallowed type out before the component
  // ever sees it. A drag-and-drop bypasses `accept`, which is exactly why the
  // component re-checks the type itself.
  it('rejects a disallowed file type dropped onto the dropzone', async () => {
    const { container } = await renderLoadedForm()
    const dropzone = container.querySelector('.zg-dropzone')!

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('payload.exe', 'application/x-msdownload', 2048)] },
    })

    expect(await screen.findByText(/payload\.exe — Unsupported file type/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove payload.exe' })).not.toBeInTheDocument()
  })

  it('rejects a sixth file once five are staged', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    const input = screen.getByLabelText('Attachments')
    await user.upload(
      input,
      [1, 2, 3, 4, 5, 6].map((n) => makeFile(`shot-${n}.png`, 'image/png', 1024 * n)),
    )

    expect(await screen.findByText(/shot-6\.png — At most 5 files can be attached\./)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(5)
  })

  it('removes a staged file when its Remove control is used', async () => {
    const user = userEvent.setup()
    await renderLoadedForm()

    await user.upload(screen.getByLabelText('Attachments'), makeFile('screenshot.png', 'image/png', 4096))
    await user.click(await screen.findByRole('button', { name: 'Remove screenshot.png' }))

    expect(screen.queryByText('screenshot.png')).not.toBeInTheDocument()
  })
})
