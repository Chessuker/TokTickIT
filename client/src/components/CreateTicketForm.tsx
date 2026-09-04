import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_URL } from '../api'
import { useRequester } from '../context/requester'
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_TYPES_LABEL,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  addFiles,
  formatBytes,
} from '../attachments'
import type { RejectedFile } from '../attachments'

/**
 * Create Ticket form (ui-spec.md §3.2, FR-01, FR-07, AC-01, AC-12).
 *
 * Two rules shape the whole component:
 *
 * 1. The ticket number and the initial status are server-owned (BR-01, BR-02).
 *    Neither is an input here and neither is sent; the number shown on success
 *    is whatever the server put in the 201 response.
 * 2. A failed submit never costs the user their typing (AC-12). Every value
 *    lives in this component's state and nothing clears it except a successful
 *    create, so a 500 or a dropped connection leaves the form ready to retry.
 */

interface Option {
  id: string
  name: string
}

const PRIORITIES = ['Low', 'Medium', 'High'] as const
type Priority = (typeof PRIORITIES)[number]

const SUMMARY_MIN = 5
const SUMMARY_MAX = 150
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 5000

interface FormValues {
  summary: string
  description: string
  categoryId: string
  relatedSystemId: string
  priority: Priority
}

const INITIAL_VALUES: FormValues = {
  summary: '',
  description: '',
  categoryId: '',
  relatedSystemId: '',
  priority: 'Medium',
}

interface CreatedTicket {
  id: string
  ticketNumber: string
  status: string
  priority: string
}

/**
 * Mirrors the server rules in api-spec.md §3.4 so the common mistakes are
 * caught without a round trip. The server re-validates everything; a
 * disagreement between the two is resolved in the server's favour, because a
 * 400 response overwrites these messages field by field.
 */
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {}

  const summary = values.summary.trim()
  if (!summary) {
    errors.summary = 'Summary is required.'
  } else if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    errors.summary = `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`
  }

  const description = values.description.trim()
  if (!description) {
    errors.description = 'Description is required.'
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`
  }

  if (!values.categoryId) errors.categoryId = 'Category is required.'
  if (!values.relatedSystemId) errors.relatedSystemId = 'Related System is required.'
  if (!values.priority) errors.priority = 'Requested Priority is required.'

  return errors
}

function CreateTicketForm() {
  const { requester } = useRequester()

  const [values, setValues] = useState<FormValues>(INITIAL_VALUES)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedTicket | null>(null)

  const [categories, setCategories] = useState<Option[]>([])
  const [relatedSystems, setRelatedSystems] = useState<Option[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * What became of the staged files after the ticket was created. Attachments
   * are uploaded one request at a time *after* the ticket exists (api-spec.md
   * §3.7), so a rejected file can never cost the requester the ticket — the
   * compensation is "keep the ticket, report the files".
   */
  const [attachmentReport, setAttachmentReport] = useState<{
    uploaded: number
    failed: RejectedFile[]
  } | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState(false)

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    setOptionsError(null)
    try {
      const [categoryRes, systemRes] = await Promise.all([
        fetch(`${API_URL}/api/categories`),
        fetch(`${API_URL}/api/related-systems`),
      ])

      if (!categoryRes.ok || !systemRes.ok) {
        throw new Error('Reference data request failed')
      }

      const categoryBody = await categoryRes.json()
      const systemBody = await systemRes.json()

      setCategories(Array.isArray(categoryBody?.data) ? categoryBody.data : [])
      setRelatedSystems(Array.isArray(systemBody?.data) ? systemBody.data : [])
    } catch {
      setOptionsError('Failed to load categories and related systems. Please try again.')
      setCategories([])
      setRelatedSystems([])
    } finally {
      setLoadingOptions(false)
    }
  }, [])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  // Clearing a field's error as soon as it is edited keeps the red message
  // tied to the current value rather than to the last submit.
  const setField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleFiles = (picked: FileList | File[] | null) => {
    if (!picked) return
    const { accepted, rejected } = addFiles(files, Array.from(picked))
    setFiles(accepted)
    setRejectedFiles(rejected)
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  /**
   * Attaches the staged files to a ticket that already exists. Each file is its
   * own request, so one rejection names itself instead of taking the rest with
   * it, and the ticket stands either way (FR-07).
   */
  const uploadStagedFiles = async (ticketId: string) => {
    if (files.length === 0) return

    setUploadingFiles(true)

    const failed: RejectedFile[] = []
    let uploaded = 0

    for (const file of files) {
      const form = new FormData()
      form.append('file', file)

      try {
        const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          headers: { 'X-Requester-Id': requester?.id ?? '' },
          body: form,
        })

        if (res.status === 201) {
          uploaded += 1
          continue
        }

        const body = await res.json().catch(() => null)
        failed.push({ name: file.name, reason: body?.error?.message ?? 'The file could not be attached.' })
      } catch {
        failed.push({ name: file.name, reason: 'Could not reach the server.' })
      }
    }

    setUploadingFiles(false)
    setAttachmentReport({ uploaded, failed })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    setFormError(null)

    const errors = validate(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const res = await fetch(`${API_URL}/api/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Requester context travels in the header, never in the body
          // (api-spec.md §1.1), so the server decides who owns the ticket.
          'X-Requester-Id': requester?.id ?? '',
        },
        body: JSON.stringify({
          summary: values.summary.trim(),
          description: values.description.trim(),
          categoryId: values.categoryId,
          relatedSystemId: values.relatedSystemId,
          priority: values.priority,
        }),
      })

      if (res.status === 201) {
        const ticket = await res.json()
        setCreated(ticket)
        await uploadStagedFiles(ticket.id)
        return
      }

      const body = await res.json().catch(() => null)

      if (res.status === 400 && body?.error?.fields) {
        setFieldErrors(body.error.fields)
        setFormError('Some fields need attention before the ticket can be created.')
        return
      }

      setFormError(
        body?.error?.message ?? 'The ticket could not be created. Your details are unchanged — please try again.',
      )
    } catch {
      // Network failure or a server that is not answering at all (AC-12).
      setFormError(
        'Could not reach the server. Your details are still here — check your connection and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const startAgain = () => {
    setCreated(null)
    setValues(INITIAL_VALUES)
    setFieldErrors({})
    setFormError(null)
    setFiles([])
    setRejectedFiles([])
    setAttachmentReport(null)
  }

  const errorProps = (field: string) =>
    fieldErrors[field]
      ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` }
      : {}

  if (created) {
    return (
      <div className="zg-card">
        <div className="zg-callout zg-callout-success" role="status">
          <span aria-hidden="true">✅</span>
          <div>
            <strong>Ticket created.</strong>
            <p className="mb-1 mt-1">
              Your ticket number is{' '}
              <span className="zg-ticket-number">{created.ticketNumber}</span>
            </p>
            <p className="mb-0 zg-muted">
              Status <span className="zg-badge">{created.status}</span>{' '}
              Priority <span className="zg-badge">{created.priority}</span>
            </p>
          </div>
        </div>

        {uploadingFiles && (
          <p className="zg-hint mt-3" role="status">
            <span className="zg-spinner-sm" aria-hidden="true" /> Attaching {files.length} file
            {files.length === 1 ? '' : 's'}...
          </p>
        )}

        {attachmentReport && attachmentReport.uploaded > 0 && (
          <p className="zg-hint mt-3" role="status">
            {attachmentReport.uploaded} file{attachmentReport.uploaded === 1 ? '' : 's'} attached to
            this ticket.
          </p>
        )}

        {attachmentReport && attachmentReport.failed.length > 0 && (
          <div className="zg-callout zg-callout-warning mt-3" role="status">
            <span aria-hidden="true">⚠️</span>
            <div>
              The ticket is saved, but {attachmentReport.failed.length} file
              {attachmentReport.failed.length === 1 ? '' : 's'} could not be attached. Open the
              ticket to try again.
              <ul className="zg-rejected-list">
                {attachmentReport.failed.map((file) => (
                  <li key={file.name} className="zg-field-error">
                    {file.name}: {file.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="zg-actions">
          <Link className="zg-btn zg-btn-primary" to={`/tickets/${created.id}`}>
            View ticket
          </Link>
          <Link className="zg-btn zg-btn-secondary" to="/tickets">
            Go to My Tickets
          </Link>
          <button type="button" className="zg-btn zg-btn-secondary" onClick={startAgain}>
            Create another ticket
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="zg-card" onSubmit={handleSubmit} noValidate>
      {optionsError && (
        <div className="zg-callout zg-callout-error mb-3" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            {optionsError}{' '}
            <button type="button" className="zg-file-remove" onClick={loadOptions}>
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="zg-field">
        <label className="zg-label" htmlFor="summary">
          Summary / Title <span className="zg-required" aria-hidden="true">*</span>
        </label>
        <input
          id="summary"
          name="summary"
          type="text"
          className={fieldErrors.summary ? 'zg-input is-invalid' : 'zg-input'}
          value={values.summary}
          maxLength={SUMMARY_MAX}
          placeholder="Short description of the problem"
          onChange={(e) => setField('summary', e.target.value)}
          {...errorProps('summary')}
        />
        {fieldErrors.summary && (
          <span className="zg-field-error" id="summary-error" role="alert">
            {fieldErrors.summary}
          </span>
        )}
      </div>

      <div className="zg-field">
        <label className="zg-label" htmlFor="description">
          Description <span className="zg-required" aria-hidden="true">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          className={fieldErrors.description ? 'zg-textarea is-invalid' : 'zg-textarea'}
          value={values.description}
          maxLength={DESCRIPTION_MAX}
          placeholder="What happened, what you expected, and how to reproduce it"
          onChange={(e) => setField('description', e.target.value)}
          {...errorProps('description')}
        />
        {fieldErrors.description && (
          <span className="zg-field-error" id="description-error" role="alert">
            {fieldErrors.description}
          </span>
        )}
      </div>

      <div className="zg-field">
        <label className="zg-label" htmlFor="categoryId">
          Category <span className="zg-required" aria-hidden="true">*</span>
        </label>
        <select
          id="categoryId"
          name="categoryId"
          className={fieldErrors.categoryId ? 'zg-select is-invalid' : 'zg-select'}
          value={values.categoryId}
          disabled={loadingOptions}
          onChange={(e) => setField('categoryId', e.target.value)}
          {...errorProps('categoryId')}
        >
          <option value="">{loadingOptions ? 'Loading categories...' : 'Select a category...'}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {fieldErrors.categoryId && (
          <span className="zg-field-error" id="categoryId-error" role="alert">
            {fieldErrors.categoryId}
          </span>
        )}
      </div>

      <div className="zg-field">
        <label className="zg-label" htmlFor="relatedSystemId">
          Related System <span className="zg-required" aria-hidden="true">*</span>
        </label>
        <select
          id="relatedSystemId"
          name="relatedSystemId"
          className={fieldErrors.relatedSystemId ? 'zg-select is-invalid' : 'zg-select'}
          value={values.relatedSystemId}
          disabled={loadingOptions}
          onChange={(e) => setField('relatedSystemId', e.target.value)}
          {...errorProps('relatedSystemId')}
        >
          <option value="">{loadingOptions ? 'Loading related systems...' : 'Select a related system...'}</option>
          {relatedSystems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
        {fieldErrors.relatedSystemId && (
          <span className="zg-field-error" id="relatedSystemId-error" role="alert">
            {fieldErrors.relatedSystemId}
          </span>
        )}
      </div>

      <fieldset className="zg-field">
        <legend className="zg-fieldset-legend">
          Requested Priority <span className="zg-required" aria-hidden="true">*</span>
        </legend>
        <div className="zg-radio-group">
          {PRIORITIES.map((priority) => (
            <label className="zg-radio" key={priority}>
              <input
                type="radio"
                name="priority"
                value={priority}
                checked={values.priority === priority}
                onChange={() => setField('priority', priority)}
              />
              {priority}
            </label>
          ))}
        </div>
        {fieldErrors.priority && (
          <span className="zg-field-error" id="priority-error" role="alert">
            {fieldErrors.priority}
          </span>
        )}
      </fieldset>

      <div className="zg-field">
        <span className="zg-label" id="attachments-label">
          Attachments
        </span>
        <div
          className={dragging ? 'zg-dropzone is-dragging' : 'zg-dropzone'}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <span aria-hidden="true">📎</span>
          <span>Drag files here, or</span>
          <button
            type="button"
            className="zg-btn zg-btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            id="attachments"
            type="file"
            multiple
            aria-labelledby="attachments-label"
            accept={ALLOWED_MIME_TYPES.join(',')}
            className="visually-hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              // Reset so re-picking the same file still fires a change event.
              e.target.value = ''
            }}
          />
          <span className="zg-hint">
            {ALLOWED_TYPES_LABEL} · up to {formatBytes(MAX_FILE_BYTES)} each · at most {MAX_ATTACHMENTS} files
          </span>
        </div>

        {files.length > 0 && (
          <ul className="zg-file-list">
            {files.map((file, index) => (
              <li className="zg-file-row" key={`${file.name}-${file.size}`}>
                <span aria-hidden="true">{file.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                <span className="zg-file-name">{file.name}</span>
                <span className="zg-file-size">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className="zg-file-remove"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {rejectedFiles.length > 0 && (
          <div className="zg-callout zg-callout-error mt-2" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>These files were not added:</strong>
              <ul className="zg-rejected-list">
                {rejectedFiles.map((rejected) => (
                  <li key={`${rejected.name}-${rejected.reason}`}>
                    {rejected.name} — {rejected.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {formError && (
        <div className="zg-callout zg-callout-error" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>{formError}</div>
        </div>
      )}

      <div className="zg-form-actions">
        <Link className="zg-btn zg-btn-secondary" to="/tickets">
          Cancel
        </Link>
        <button type="submit" className="zg-btn zg-btn-primary" disabled={submitting}>
          {submitting ? (
            <>
              <span className="zg-spinner zg-spinner-sm" aria-hidden="true" />
              Creating ticket...
            </>
          ) : (
            'Create Ticket'
          )}
        </button>
      </div>
    </form>
  )
}

export default CreateTicketForm
