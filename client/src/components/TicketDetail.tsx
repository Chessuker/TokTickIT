import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '../api'
import { useRequester } from '../context/requester'
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_TYPES_LABEL,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  formatBytes,
} from '../attachments'

/**
 * Requester Ticket Detail (ui-spec.md §3.4, api-spec.md §3.6 — FR-04, FR-05,
 * AC-03, AC-05, AC-09).
 *
 * Three rules shape this screen:
 *
 * 1. Read-only means no inputs (AC-05). Every ticket field is rendered as text
 *    in a definition list, and there is no Edit control anywhere — not disabled,
 *    absent. The only writable controls on the page belong to the attachment
 *    lifecycle, which is a separate capability from editing the ticket.
 * 2. Ownership is the server's answer, not this component's guess (BR-04). A
 *    `403` turns the whole screen into an access-denied panel; nothing here
 *    compares requester ids to decide what to show.
 * 3. A removed attachment keeps its metadata and loses its file (BR-09, BR-10).
 *    The Download button is driven by `downloadUrl` being null rather than by a
 *    rule restated on the client, so the two can never disagree.
 */

interface Attachment {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  isRemoved: boolean
  removedReason: string | null
  removedAt: string | null
  downloadUrl: string | null
}

interface Option {
  id: string
  name: string
}

interface TicketDetailData {
  id: string
  ticketNumber: string
  summary: string
  description: string
  status: string
  priority: string
  category: Option | null
  relatedSystem: Option | null
  requester: { id: string; name: string; email: string; department: string | null }
  attachmentCount: number
  attachments: Attachment[]
  createdAt: string
  updatedAt: string
}

/** What went wrong loading the ticket, kept apart so 403 can own a whole screen. */
interface LoadFailure {
  status: number
  message: string
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`zg-badge zg-badge-status-${status.toLowerCase()}`}>{status}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`zg-badge zg-badge-priority-${priority.toLowerCase()}`}>{priority}</span>
}

/** Matches the My Tickets list: IT triage fields have no column this sprint. */
function NotAssigned({ label }: { label: string }) {
  return (
    <span className="zg-not-assigned" title={`${label} is assigned during IT triage`}>
      Unassigned
    </span>
  )
}

/** One read-only row of the ticket. No input, no edit affordance (AC-05). */
function ReadOnlyField({
  label,
  children,
  wide = false,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? 'zg-detail-item zg-detail-item-wide' : 'zg-detail-item'}>
      <dt className="zg-detail-label">{label}</dt>
      <dd className="zg-detail-value">{children}</dd>
    </div>
  )
}

function TicketDetail() {
  const { id = '' } = useParams()
  const { requester } = useRequester()
  const requesterId = requester?.id ?? ''

  const [ticket, setTicket] = useState<TicketDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [removeTarget, setRemoveTarget] = useState<Attachment | null>(null)
  const [reason, setReason] = useState('')
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const headers = useCallback(() => ({ 'X-Requester-Id': requesterId }), [requesterId])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setFailure(null)

    fetch(`${API_URL}/api/tickets/${id}`, { headers: { 'X-Requester-Id': requesterId } })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (cancelled) return

        if (!res.ok) {
          setTicket(null)
          setFailure({
            status: res.status,
            message: body?.error?.message ?? 'The ticket could not be loaded.',
          })
          return
        }

        setTicket(body as TicketDetailData)
      })
      .catch(() => {
        if (cancelled) return
        setTicket(null)
        setFailure({
          status: 0,
          message: 'Could not reach the server. Please check your connection and try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, requesterId, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const activeAttachments = ticket?.attachments.filter((file) => !file.isRemoved) ?? []
  const removedAttachments = ticket?.attachments.filter((file) => file.isRemoved) ?? []
  const atAttachmentLimit = activeAttachments.length >= MAX_ATTACHMENTS

  /**
   * Uploads one file at a time. The requester context lives in a header, so a
   * plain form post will not do — and one request per file means a rejected
   * file names itself instead of failing the whole batch.
   */
  const uploadFiles = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return

    setUploadError(null)
    setUploadNotice(null)

    const files = Array.from(picked)
    const failures: string[] = []
    let uploaded = 0

    setUploading(true)

    for (const file of files) {
      if (activeAttachments.length + uploaded >= MAX_ATTACHMENTS) {
        failures.push(`${file.name}: at most ${MAX_ATTACHMENTS} active files can be attached.`)
        continue
      }

      // The same rules the server enforces, applied here first so an obvious
      // rejection does not need a round trip (BR-05, BR-06). The server repeats
      // every check — this is convenience, never enforcement.
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        failures.push(`${file.name}: unsupported file type. Allowed: ${ALLOWED_TYPES_LABEL}.`)
        continue
      }

      if (file.size > MAX_FILE_BYTES) {
        failures.push(
          `${file.name}: the file is ${formatBytes(file.size)}, over the ${formatBytes(MAX_FILE_BYTES)} limit.`,
        )
        continue
      }

      const form = new FormData()
      form.append('file', file)

      try {
        const res = await fetch(`${API_URL}/api/tickets/${id}/attachments`, {
          method: 'POST',
          headers: headers(),
          body: form,
        })

        if (res.status === 201) {
          uploaded += 1
          continue
        }

        const body = await res.json().catch(() => null)
        failures.push(`${file.name}: ${body?.error?.message ?? 'the file could not be attached.'}`)
      } catch {
        failures.push(`${file.name}: could not reach the server.`)
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (failures.length > 0) setUploadError(failures.join(' '))
    if (uploaded > 0) {
      setUploadNotice(`${uploaded} file${uploaded === 1 ? '' : 's'} attached.`)
      reload()
    }
  }

  /**
   * Downloads through `fetch` rather than a bare link: the requester context
   * travels in a header, which an `<a href>` cannot carry. The blob is handed
   * to a temporary anchor so the browser saves it under its original name.
   */
  const download = async (attachment: Attachment) => {
    setDownloadError(null)
    setDownloadingId(attachment.id)

    try {
      const res = await fetch(`${API_URL}/api/attachments/${attachment.id}/download`, {
        headers: headers(),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDownloadError(body?.error?.message ?? `${attachment.fileName} could not be downloaded.`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachment.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Could not reach the server. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  const openRemoveModal = (attachment: Attachment) => {
    setRemoveTarget(attachment)
    setReason('')
    setRemoveError(null)
  }

  const closeRemoveModal = () => {
    setRemoveTarget(null)
    setReason('')
    setRemoveError(null)
  }

  const confirmRemoval = async () => {
    if (!removeTarget || reason.trim().length === 0) return

    setRemoving(true)
    setRemoveError(null)

    try {
      const res = await fetch(`${API_URL}/api/attachments/${removeTarget.id}/remove`, {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (res.ok) {
        closeRemoveModal()
        reload()
        return
      }

      const body = await res.json().catch(() => null)
      setRemoveError(
        body?.error?.fields?.reason ?? body?.error?.message ?? 'The file could not be removed.',
      )
    } catch {
      setRemoveError('Could not reach the server. Please try again.')
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return (
      <div className="zg-loading" role="status">
        <span className="zg-spinner" aria-hidden="true" />
        Loading ticket...
      </div>
    )
  }

  // AC-03 — someone else's ticket is a screen, not a toast. Nothing about the
  // ticket is rendered, because nothing about it was returned.
  if (failure?.status === 403) {
    return (
      <div className="zg-card zg-state zg-state-denied" data-testid="access-denied" role="alert">
        <span className="zg-state-icon" aria-hidden="true">
          🔒
        </span>
        <h1 className="zg-state-title">Access denied</h1>
        <p className="zg-state-text">
          This ticket belongs to another requester. You can only open tickets raised by{' '}
          {requester?.name ?? 'the selected requester'}.
        </p>
        <Link className="zg-btn zg-btn-primary" to="/tickets">
          Back to My Tickets
        </Link>
      </div>
    )
  }

  if (failure?.status === 404) {
    return (
      <div className="zg-card zg-state" data-testid="ticket-not-found" role="alert">
        <span className="zg-state-icon" aria-hidden="true">
          🔍
        </span>
        <h1 className="zg-state-title">Ticket not found</h1>
        <p className="zg-state-text">
          No ticket exists with this reference. It may have been opened from an old link.
        </p>
        <Link className="zg-btn zg-btn-primary" to="/tickets">
          Back to My Tickets
        </Link>
      </div>
    )
  }

  if (failure || !ticket) {
    return (
      <div className="zg-callout zg-callout-error" role="alert">
        <span aria-hidden="true">⚠️</span>
        <div>
          {failure?.message ?? 'The ticket could not be loaded.'}{' '}
          <button type="button" className="zg-link-button" onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <section>
      <div className="zg-page-head">
        <div>
          <p className="zg-breadcrumb">
            <Link to="/tickets">My Tickets</Link> / {ticket.ticketNumber}
          </p>
          <h1 className="zg-title">{ticket.summary}</h1>
          <div className="zg-detail-headline">
            <span className="zg-ticket-number">{ticket.ticketNumber}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="zg-muted">Created {formatDateTime(ticket.createdAt)}</span>
          </div>
        </div>
      </div>

      {/*
       * Read-only presentation (AC-05). A definition list rather than a form:
       * there is no control to disable because there is no control at all.
       */}
      <div className="zg-card">
        <h2 className="zg-section-title">Ticket details</h2>
        <p className="zg-hint">
          This view is read-only. Ticket fields are set when the ticket is created and are changed
          by the IT team, not here.
        </p>

        <dl className="zg-detail-grid" data-testid="ticket-fields">
          <ReadOnlyField label="Ticket No.">
            <span className="zg-ticket-number">{ticket.ticketNumber}</span>
          </ReadOnlyField>
          <ReadOnlyField label="Created Date">{formatDateTime(ticket.createdAt)}</ReadOnlyField>
          <ReadOnlyField label="Category">{ticket.category?.name ?? 'Uncategorised'}</ReadOnlyField>
          <ReadOnlyField label="Related System">
            {ticket.relatedSystem?.name ?? 'Not specified'}
          </ReadOnlyField>
          <ReadOnlyField label="Requester">
            {ticket.requester.name}
            {ticket.requester.department ? ` · ${ticket.requester.department}` : ''}
          </ReadOnlyField>
          <ReadOnlyField label="Requested Priority">
            <PriorityBadge priority={ticket.priority} />
          </ReadOnlyField>
          <ReadOnlyField label="IT Priority">
            <NotAssigned label="IT Priority" />
          </ReadOnlyField>
          <ReadOnlyField label="Current Status">
            <StatusBadge status={ticket.status} />
          </ReadOnlyField>
          <ReadOnlyField label="Ticket Owner">
            <NotAssigned label="Ticket Owner" />
          </ReadOnlyField>
          <ReadOnlyField label="Last Updated">{formatDateTime(ticket.updatedAt)}</ReadOnlyField>
          <ReadOnlyField label="Summary" wide>
            {ticket.summary}
          </ReadOnlyField>
          <ReadOnlyField label="Description" wide>
            <p className="zg-detail-description">{ticket.description}</p>
          </ReadOnlyField>
        </dl>
      </div>

      <div className="zg-card mt-3">
        <h2 className="zg-section-title">
          Attachments{' '}
          <span className="zg-muted">
            ({activeAttachments.length} of {MAX_ATTACHMENTS} active)
          </span>
        </h2>

        {downloadError && (
          <div className="zg-callout zg-callout-error mb-3" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div>{downloadError}</div>
          </div>
        )}

        {activeAttachments.length === 0 && removedAttachments.length === 0 && (
          <p className="zg-muted" data-testid="no-attachments">
            No files are attached to this ticket yet.
          </p>
        )}

        {activeAttachments.length > 0 && (
          <ul className="zg-file-list" data-testid="active-attachments">
            {activeAttachments.map((file) => (
              <li key={file.id} className="zg-file-row">
                <span className="zg-file-name">{file.fileName}</span>
                <span className="zg-file-size">{formatBytes(file.sizeBytes)}</span>
                <span className="zg-file-size">Uploaded {formatDateTime(file.uploadedAt)}</span>
                <span className="zg-file-actions">
                  <button
                    type="button"
                    className="zg-btn zg-btn-secondary zg-btn-sm"
                    onClick={() => download(file)}
                    disabled={downloadingId === file.id}
                    // The label tracks the state as well as the file: a screen
                    // reader user gets "Downloading …" rather than a button
                    // that still says Download while it is busy.
                    aria-label={
                      downloadingId === file.id
                        ? `Downloading ${file.fileName}`
                        : `Download ${file.fileName}`
                    }
                  >
                    {downloadingId === file.id ? 'Downloading...' : 'Download'}
                  </button>
                  <button
                    type="button"
                    className="zg-file-remove"
                    onClick={() => openRemoveModal(file)}
                    aria-label={`Remove ${file.fileName}`}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/*
         * Removed files stay on the page (BR-10). They are muted, carry the
         * reason and the timestamp, and have no Download button — the record of
         * what was attached survives the file becoming unreachable.
         */}
        {removedAttachments.length > 0 && (
          <>
            <h3 className="zg-subsection-title">Removed files</h3>
            <ul className="zg-file-list" data-testid="removed-attachments">
              {removedAttachments.map((file) => (
                <li key={file.id} className="zg-file-row zg-file-row-removed">
                  <span className="zg-file-name">{file.fileName}</span>
                  <span className="zg-badge zg-badge-removed">Removed</span>
                  <span className="zg-file-size">{formatBytes(file.sizeBytes)}</span>
                  <span className="zg-file-removed-meta">
                    Removed {formatDateTime(file.removedAt)} — {file.removedReason}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="zg-upload-zone">
          <span className="zg-label" id="add-attachment-label">
            Add a file
          </span>
          <p className="zg-hint">
            {ALLOWED_TYPES_LABEL} up to {formatBytes(MAX_FILE_BYTES)}. A ticket can hold{' '}
            {MAX_ATTACHMENTS} active files; removing one frees a slot.
          </p>

          <input
            ref={fileInputRef}
            id="add-attachment"
            className="zg-file-input"
            type="file"
            multiple
            accept={ALLOWED_MIME_TYPES.join(',')}
            aria-labelledby="add-attachment-label"
            disabled={uploading || atAttachmentLimit}
            onChange={(event) => void uploadFiles(event.target.files)}
          />

          {uploading && (
            <p className="zg-hint" role="status">
              <span className="zg-spinner-sm" aria-hidden="true" /> Uploading...
            </p>
          )}

          {atAttachmentLimit && (
            <p className="zg-field-error" role="status">
              This ticket already has {MAX_ATTACHMENTS} active files. Remove one before adding
              another.
            </p>
          )}

          {uploadError && (
            <p className="zg-field-error" role="alert">
              {uploadError}
            </p>
          )}

          {uploadNotice && (
            <p className="zg-hint" role="status">
              {uploadNotice}
            </p>
          )}
        </div>
      </div>

      {/*
       * Soft-removal modal (AC-09, BR-09). Confirm stays disabled until a
       * reason is typed: the reason is the record of why the file went away,
       * so a removal without one is not offered rather than merely rejected.
       */}
      {removeTarget && (
        <div className="zg-modal-backdrop" role="presentation">
          <div
            className="zg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-modal-title"
          >
            <h2 className="zg-section-title" id="remove-modal-title">
              Remove attachment
            </h2>
            <p className="zg-hint">
              <strong>{removeTarget.fileName}</strong> stays on the ticket as a record. It can no
              longer be downloaded, and the reason below is shown beside it.
            </p>

            <div className="zg-field">
              <label className="zg-label" htmlFor="removal-reason">
                Reason for removal <span className="zg-required" aria-hidden="true">*</span>
              </label>
              <textarea
                id="removal-reason"
                className="zg-textarea"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Uploaded the wrong screenshot"
              />
            </div>

            {removeError && (
              <p className="zg-field-error" role="alert">
                {removeError}
              </p>
            )}

            <div className="zg-actions">
              <button
                type="button"
                className="zg-btn zg-btn-primary"
                onClick={() => void confirmRemoval()}
                disabled={reason.trim().length === 0 || removing}
              >
                {removing ? (
                  <>
                    <span className="zg-spinner-sm" aria-hidden="true" /> Removing...
                  </>
                ) : (
                  'Confirm removal'
                )}
              </button>
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={closeRemoveModal}
                disabled={removing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default TicketDetail
