import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { apiFetch, apiJson, readApiError } from '../../apiClient'
import { useAuth } from '../../context/auth'
import { useMediaQuery } from '../../useMediaQuery'
import { FollowUpBadge } from '../Badges'
import {
  defaultActionInput,
  formatBangkok,
  maxActionInput,
  minActionInput,
  toBangkokInput,
  toUtcIso,
} from './dates'

/**
 * Actions Taken (Lab 4 ui-spec.md §3.3, §3.6; api-spec.md §3.1 – §3.4;
 * FR-01 … FR-04, BR-03 … BR-11, AC-03 … AC-11).
 *
 * One component, two modes:
 *
 * - `staff` — the first tab of the Staff Ticket Detail. IT Staff and
 *   Administrators (AD-02) list, record, view, edit, and complete or cancel
 *   follow-ups.
 * - `requester` — "Work done by IT" on the Requester's own Ticket Detail: the
 *   same entries, read-only, with no controls at all (BR-04).
 *
 * The server owns every rule. The form mirrors the BR-05 / BR-06 checks only
 * so an obvious mistake does not need a round trip; whatever the server says
 * is what the user sees, under the field it names. Three server answers have
 * their own handling: `409 STALE_UPDATE` (someone else edited first — keep the
 * typed text, offer Reload), `409 TICKET_LOCKED` (the ticket was resolved
 * meanwhile — the parent reloads and the panel turns read-only), and a network
 * failure (keep everything, say so, let the user retry). `403` and `404` are
 * refusals, not outages (L3 ui-spec.md §2 Forbidden / Not found): they are
 * named as such, the server's message is shown, and no Retry is offered,
 * because trying again cannot change the answer.
 */

export interface ActionUser {
  id: string
  name: string
  role: string
}

export type FollowUpStatus = 'Open' | 'Completed' | 'Cancelled'

export interface Action {
  id: string
  ticketId: string
  actionAt: string
  description: string
  result: string
  attachmentNotes: string | null
  performedBy: ActionUser
  followUp: {
    required: boolean
    note: string | null
    assignee: (ActionUser & { isActive: boolean }) | null
    status: FollowUpStatus | null
    closedAt: string | null
    closedBy: ActionUser | null
  }
  version: number
  updatedBy: ActionUser | null
  createdAt: string
  updatedAt: string
}

interface Assignee {
  id: string
  name: string
}

export interface ActionsTakenProps {
  ticketId: string
  ticketStatus: string
  ticketCreatedAt: string
  /** The Ticket Owner, so a performer who also owns the ticket gets an "Owner" tag (BR-02). */
  ownerId: string | null
  mode: 'staff' | 'requester'
  /** Reports the number of Actions after every load, for the tab label. */
  onCountChange?: (count: number) => void
  /** The server said the ticket is locked: the parent should re-read the ticket. */
  onLocked?: () => void
  /**
   * An Action was recorded or edited, or a follow-up closed: the resolution
   * gate may have changed, so the parent should re-read the ticket (BR-14).
   */
  onChanged?: () => void
}

/** Limits from BR-05 / BR-06; the server repeats every one of them. */
export const DESCRIPTION_MAX = 2000
export const RESULT_MAX = 1000
export const FOLLOW_UP_NOTE_MAX = 1000
export const ATTACHMENT_NOTES_MAX = 500

/** BR-09: no Action is written while the ticket is in one of these. */
const LOCKED_STATUSES = ['Resolved', 'Closed', 'Cancelled']

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // RFC 4122 v4 shape from Math.random — only reached in an old test runtime.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

// ---------------------------------------------------------------------------
// The form (create and edit modes)
// ---------------------------------------------------------------------------

interface FormValues {
  actionAt: string
  description: string
  result: string
  followUpRequired: boolean
  followUpNote: string
  followUpAssigneeId: string
  attachmentNotes: string
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

function valuesFrom(action: Action): FormValues {
  return {
    actionAt: toBangkokInput(action.actionAt),
    description: action.description,
    result: action.result,
    followUpRequired: action.followUp.required,
    followUpNote: action.followUp.note ?? '',
    followUpAssigneeId: action.followUp.assignee?.id ?? '',
    attachmentNotes: action.attachmentNotes ?? '',
  }
}

/** The BR-05 / BR-06 rules, applied before sending. */
/** The wording for a `403` / `404` on a write, or null for any other status. */
function refusalMessage(status: number, serverMessage: string | undefined): string | null {
  if (status === 403) {
    return `Access denied: ${serverMessage ?? "you don't have permission to change actions on this ticket."}`
  }
  if (status === 404) {
    return `Not found: ${serverMessage ?? 'this action or ticket no longer exists.'} Reload the page to see the latest list.`
  }
  return null
}

function validate(values: FormValues, min: string, max: string): FieldErrors {
  const errors: FieldErrors = {}
  const description = values.description.trim()
  const result = values.result.trim()

  if (!values.actionAt) errors.actionAt = 'Action date/time is required.'
  else if (values.actionAt < min) errors.actionAt = 'Action date/time cannot be before the ticket was created.'
  else if (values.actionAt > max) errors.actionAt = 'Action date/time cannot be in the future.'

  if (!description) errors.description = 'Action description is required.'
  else if (description.length > DESCRIPTION_MAX) errors.description = `Action description must be at most ${DESCRIPTION_MAX} characters.`

  if (!result) errors.result = 'Result is required.'
  else if (result.length > RESULT_MAX) errors.result = `Result must be at most ${RESULT_MAX} characters.`

  if (values.attachmentNotes.trim().length > ATTACHMENT_NOTES_MAX) {
    errors.attachmentNotes = `Attachment notes must be at most ${ATTACHMENT_NOTES_MAX} characters.`
  }

  if (values.followUpRequired) {
    const note = values.followUpNote.trim()
    if (!note) errors.followUpNote = 'A follow-up note is required when follow-up is needed.'
    else if (note.length > FOLLOW_UP_NOTE_MAX) errors.followUpNote = `Follow-up note must be at most ${FOLLOW_UP_NOTE_MAX} characters.`
    if (!values.followUpAssigneeId) errors.followUpAssigneeId = 'Choose who will do the follow-up.'
  }

  return errors
}

const SERVER_FIELDS: (keyof FormValues)[] = [
  'actionAt',
  'description',
  'result',
  'followUpRequired',
  'followUpNote',
  'followUpAssigneeId',
  'attachmentNotes',
]

interface ActionFormProps {
  kind: 'create' | 'edit'
  /** The Action being edited; its `version` is what the PATCH is based on. */
  existing?: Action
  ticketCreatedAt: string
  endpoint: string
  assignees: Assignee[]
  defaultAssigneeId: string
  performerName: string
  onSaved: (action: Action) => void
  onCancel: () => void
  onLocked?: () => void
  /** Re-reads the list and answers the latest copy of the Action being edited. */
  onReload: (actionId: string) => Promise<Action | null>
}

function ActionForm({
  kind,
  existing,
  ticketCreatedAt,
  endpoint,
  assignees,
  defaultAssigneeId,
  performerName,
  onSaved,
  onCancel,
  onLocked,
  onReload,
}: ActionFormProps) {
  const idPrefix = existing ? `action-${existing.id}` : 'action-new'
  const [baseline, setBaseline] = useState<Action | undefined>(existing)
  const [values, setValues] = useState<FormValues>(() =>
    existing
      ? valuesFrom(existing)
      : {
          actionAt: defaultActionInput(ticketCreatedAt),
          description: '',
          result: '',
          followUpRequired: false,
          followUpNote: '',
          followUpAssigneeId: defaultAssigneeId,
          attachmentNotes: '',
        },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // A ref as well as state: two clicks inside one frame both see `saving`
  // false, but only the first gets past the ref (AC-10).
  const savingRef = useRef(false)
  // One id per form, reused by every retry of it, so a retry after a lost
  // response is answered with the Action already created (BR-10).
  const requestIdRef = useRef(newRequestId())
  const calloutRef = useRef<HTMLDivElement | null>(null)

  const min = minActionInput(ticketCreatedAt)
  const max = maxActionInput()

  const initial = useRef(values)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial.current)

  const followUpLocked = baseline?.followUp.required === true
  const followUpClosed = baseline?.followUp.status === 'Completed' || baseline?.followUp.status === 'Cancelled'

  useEffect(() => {
    if (formError || stale) calloutRef.current?.focus()
  }, [formError, stale])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice(null)
  }

  /** Only what changed against the version being edited (api-spec.md §3.4). */
  const patchBody = (): Record<string, unknown> | null => {
    if (!baseline) return null
    const before = valuesFrom(baseline)
    const body: Record<string, unknown> = { version: baseline.version }

    if (values.actionAt !== before.actionAt) body.actionAt = toUtcIso(values.actionAt)
    if (values.description.trim() !== before.description) body.description = values.description.trim()
    if (values.result.trim() !== before.result) body.result = values.result.trim()
    if (values.attachmentNotes.trim() !== before.attachmentNotes) body.attachmentNotes = values.attachmentNotes.trim() || null

    if (!baseline.followUp.required && values.followUpRequired) {
      body.followUpRequired = true
      body.followUpNote = values.followUpNote.trim()
      body.followUpAssigneeId = values.followUpAssigneeId
    } else if (baseline.followUp.status === 'Open') {
      if (values.followUpNote.trim() !== before.followUpNote) body.followUpNote = values.followUpNote.trim()
      if (values.followUpAssigneeId !== before.followUpAssigneeId) body.followUpAssigneeId = values.followUpAssigneeId
    }

    return Object.keys(body).length > 1 ? body : null
  }

  const createBody = () => ({
    actionAt: toUtcIso(values.actionAt),
    description: values.description.trim(),
    result: values.result.trim(),
    attachmentNotes: values.attachmentNotes.trim() || null,
    followUpRequired: values.followUpRequired,
    ...(values.followUpRequired
      ? { followUpNote: values.followUpNote.trim(), followUpAssigneeId: values.followUpAssigneeId }
      : {}),
    clientRequestId: requestIdRef.current,
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current) return

    setFormError(null)
    setNotice(null)

    const found = validate(values, min, max)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }

    const body = kind === 'create' ? createBody() : patchBody()
    if (!body) {
      setNotice('Nothing has changed, so there is nothing to save.')
      return
    }

    savingRef.current = true
    setSaving(true)

    try {
      const res =
        kind === 'create'
          ? await apiJson(endpoint, 'POST', body)
          : await apiJson(`${endpoint}/${baseline?.id}`, 'PATCH', body)

      if (res.ok) {
        setStale(false)
        onSaved((await res.json()) as Action)
        return
      }

      const error = await readApiError(res)

      if (res.status === 400 && error?.fields) {
        const mapped: FieldErrors = {}
        const other: string[] = []
        for (const [key, message] of Object.entries(error.fields)) {
          if ((SERVER_FIELDS as string[]).includes(key)) mapped[key as keyof FormValues] = message
          else other.push(message)
        }
        setErrors(mapped)
        if (other.length > 0) setFormError(other.join(' '))
        return
      }

      if (res.status === 409 && error?.code === 'STALE_UPDATE') {
        setStale(true)
        return
      }

      if (res.status === 409 && error?.code === 'TICKET_LOCKED') {
        setFormError(error.message)
        onLocked?.()
        return
      }

      setFormError(
        refusalMessage(res.status, error?.message) ??
          error?.message ??
          'The action could not be saved. Please try again.',
      )
    } catch {
      setFormError('Could not reach the server. Your action has not been saved — your text is still here, so you can try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const reloadLatest = async () => {
    if (!baseline) return
    const latest = await onReload(baseline.id)
    if (!latest) {
      setFormError('The latest version could not be loaded. Please try again.')
      return
    }
    // Keep what the user typed; only the version (and the follow-up state the
    // controls depend on) move to the latest copy (ui-spec.md §3.3).
    setBaseline(latest)
    setStale(false)
    setNotice('Reloaded the latest version. Your edits are still in the form — save again to apply them.')
  }

  const cancel = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    onCancel()
  }

  const fieldId = (key: string) => `${idPrefix}-${key}`
  const describedBy = (key: keyof FormValues, extra?: string) =>
    [errors[key] ? `${fieldId(key)}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined

  const fieldError = (key: keyof FormValues) =>
    errors[key] ? (
      <span className="zg-field-error" id={`${fieldId(key)}-error`} role="alert">
        {errors[key]}
      </span>
    ) : null

  const counter = (key: keyof FormValues, max: number) => {
    const length = String(values[key]).length
    return (
      <span
        className={length > max ? 'zg-char-counter zg-char-counter-over' : 'zg-char-counter'}
        id={`${fieldId(key)}-counter`}
        aria-live="polite"
      >
        {length} / {max}
      </span>
    )
  }

  // An assignee who has since been deactivated stays visible as the current
  // value, flagged, so the select never silently shows someone else (BR-07).
  const currentAssignee = baseline?.followUp.assignee
  const assigneeOptions =
    currentAssignee && !assignees.some((entry) => entry.id === currentAssignee.id)
      ? [{ id: currentAssignee.id, name: `${currentAssignee.name}${currentAssignee.isActive ? '' : ' (inactive)'}` }, ...assignees]
      : assignees

  return (
    <form
      className="zg-action-form"
      data-testid="action-form"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby={`${idPrefix}-title`}
    >
      <h3 className="zg-subsection-title" id={`${idPrefix}-title`}>
        {kind === 'create' ? 'Record action' : 'Edit action'}
      </h3>

      {(formError || stale) && (
        <div
          className={stale ? 'zg-callout zg-callout-warning mb-3' : 'zg-callout zg-callout-error mb-3'}
          role="alert"
          tabIndex={-1}
          ref={calloutRef}
        >
          <span aria-hidden="true">⚠️</span>
          <div>
            {stale
              ? 'Someone else changed this action after you opened it. Reload to see the latest version — your edits stay in the form.'
              : formError}
            {stale && (
              <>
                {' '}
                <button type="button" className="zg-link-button" onClick={() => void reloadLatest()}>
                  Reload
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {notice && (
        <p className="zg-callout zg-callout-success mb-3" role="status">
          {notice}
        </p>
      )}

      <div className="zg-action-form-grid">
        <div className="zg-action-form-side">
          <div className="zg-field">
            <label className="zg-label" htmlFor={fieldId('actionAt')}>
              Action Date/Time<span className="zg-required" aria-hidden="true">*</span>
            </label>
            <input
              id={fieldId('actionAt')}
              type="datetime-local"
              className={errors.actionAt ? 'zg-input is-invalid' : 'zg-input'}
              value={values.actionAt}
              min={min}
              max={max}
              required
              disabled={saving}
              aria-invalid={Boolean(errors.actionAt)}
              aria-describedby={describedBy('actionAt', `${fieldId('actionAt')}-hint`)}
              onChange={(event) => set('actionAt', event.target.value)}
            />
            <span className="zg-hint" id={`${fieldId('actionAt')}-hint`}>
              Bangkok time. When the work was done.
            </span>
            {fieldError('actionAt')}
          </div>

          <div className="zg-field">
            <span className="zg-label">Performed by</span>
            <p className="zg-readonly-value" data-testid="performed-by">
              {kind === 'create' ? `You (${performerName})` : baseline?.performedBy.name}
            </p>
            {kind === 'edit' && baseline && (
              <span className="zg-hint">Recorded {formatBangkok(baseline.createdAt)}. Who did the work never changes.</span>
            )}
          </div>

          <div className="zg-field">
            <div className="zg-switch-row">
              <button
                type="button"
                id={fieldId('followUpRequired')}
                role="switch"
                aria-checked={values.followUpRequired}
                aria-describedby={followUpLocked ? `${fieldId('followUpRequired')}-hint` : undefined}
                className={values.followUpRequired ? 'zg-switch is-on' : 'zg-switch'}
                disabled={saving || followUpLocked}
                onClick={() => set('followUpRequired', !values.followUpRequired)}
              >
                <span className="zg-switch-thumb" aria-hidden="true" />
              </button>
              <label className="zg-label zg-switch-label" htmlFor={fieldId('followUpRequired')}>
                Follow-up required?
              </label>
            </div>
            {followUpLocked && (
              <span className="zg-hint" id={`${fieldId('followUpRequired')}-hint`}>
                {followUpClosed ? 'This follow-up is closed and can no longer be changed.' : 'To drop a follow-up, cancel it.'}
              </span>
            )}
            {fieldError('followUpRequired')}
          </div>

          {values.followUpRequired && (
            <>
              <div className="zg-field">
                <label className="zg-label" htmlFor={fieldId('followUpAssigneeId')}>
                  Assign follow-up to<span className="zg-required" aria-hidden="true">*</span>
                </label>
                <select
                  id={fieldId('followUpAssigneeId')}
                  className={errors.followUpAssigneeId ? 'zg-select is-invalid' : 'zg-select'}
                  value={values.followUpAssigneeId}
                  required
                  disabled={saving || followUpClosed}
                  aria-invalid={Boolean(errors.followUpAssigneeId)}
                  aria-describedby={describedBy('followUpAssigneeId')}
                  onChange={(event) => set('followUpAssigneeId', event.target.value)}
                >
                  <option value="">Choose IT Staff…</option>
                  {assigneeOptions.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
                {fieldError('followUpAssigneeId')}
              </div>
            </>
          )}
        </div>

        <div className="zg-action-form-main">
          <div className="zg-field">
            <label className="zg-label" htmlFor={fieldId('description')}>
              Action Description<span className="zg-required" aria-hidden="true">*</span>
            </label>
            <textarea
              id={fieldId('description')}
              className={errors.description ? 'zg-textarea zg-textarea-short is-invalid' : 'zg-textarea zg-textarea-short'}
              rows={3}
              value={values.description}
              required
              disabled={saving}
              placeholder="What was done?"
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy('description', `${fieldId('description')}-counter`)}
              onChange={(event) => set('description', event.target.value)}
            />
            <div className="zg-comment-composer-foot">
              {fieldError('description') ?? <span />}
              {counter('description', DESCRIPTION_MAX)}
            </div>
          </div>

          <div className="zg-field">
            <label className="zg-label" htmlFor={fieldId('result')}>
              Result<span className="zg-required" aria-hidden="true">*</span>
            </label>
            <textarea
              id={fieldId('result')}
              className={errors.result ? 'zg-textarea zg-textarea-short is-invalid' : 'zg-textarea zg-textarea-short'}
              rows={2}
              value={values.result}
              required
              disabled={saving}
              placeholder="What happened?"
              aria-invalid={Boolean(errors.result)}
              aria-describedby={describedBy('result', `${fieldId('result')}-counter`)}
              onChange={(event) => set('result', event.target.value)}
            />
            <div className="zg-comment-composer-foot">
              {fieldError('result') ?? <span />}
              {counter('result', RESULT_MAX)}
            </div>
          </div>

          {values.followUpRequired && (
            <div className="zg-field">
              <label className="zg-label" htmlFor={fieldId('followUpNote')}>
                Follow-up Note<span className="zg-required" aria-hidden="true">*</span>
              </label>
              <textarea
                id={fieldId('followUpNote')}
                className={errors.followUpNote ? 'zg-textarea zg-textarea-short is-invalid' : 'zg-textarea zg-textarea-short'}
                rows={2}
                value={values.followUpNote}
                required
                disabled={saving || followUpClosed}
                placeholder="What still needs to happen?"
                aria-invalid={Boolean(errors.followUpNote)}
                aria-describedby={describedBy('followUpNote', `${fieldId('followUpNote')}-counter`)}
                onChange={(event) => set('followUpNote', event.target.value)}
              />
              <div className="zg-comment-composer-foot">
                {fieldError('followUpNote') ?? <span />}
                {counter('followUpNote', FOLLOW_UP_NOTE_MAX)}
              </div>
            </div>
          )}

          <div className="zg-field">
            <label className="zg-label" htmlFor={fieldId('attachmentNotes')}>
              Attachment Notes
            </label>
            <input
              id={fieldId('attachmentNotes')}
              type="text"
              className={errors.attachmentNotes ? 'zg-input is-invalid' : 'zg-input'}
              value={values.attachmentNotes}
              disabled={saving}
              aria-invalid={Boolean(errors.attachmentNotes)}
              aria-describedby={describedBy('attachmentNotes', `${fieldId('attachmentNotes')}-hint`)}
              onChange={(event) => set('attachmentNotes', event.target.value)}
            />
            <span className="zg-hint" id={`${fieldId('attachmentNotes')}-hint`}>
              Name the file in Attachments to look at, e.g. error-log.png ({values.attachmentNotes.length} / {ATTACHMENT_NOTES_MAX})
            </span>
            {fieldError('attachmentNotes')}
          </div>
        </div>
      </div>

      {confirmDiscard && (
        <p className="zg-callout zg-callout-warning mb-3" role="alert">
          Discard what you typed? Click Cancel again to discard, or keep editing.
        </p>
      )}

      <div className="zg-actions zg-action-form-actions">
        <button type="submit" className="zg-btn zg-btn-primary" disabled={saving}>
          {saving ? (
            <>
              <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
            </>
          ) : kind === 'create' ? (
            'Save action'
          ) : (
            'Save changes'
          )}
        </button>
        <button type="button" className="zg-btn zg-btn-secondary" onClick={cancel} disabled={saving}>
          {confirmDiscard ? 'Discard' : 'Cancel'}
        </button>
        {confirmDiscard && (
          <button type="button" className="zg-btn zg-btn-secondary" onClick={() => setConfirmDiscard(false)}>
            Keep editing
          </button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// One Action, in view mode
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="zg-action-field">
      <dt className="zg-detail-label">{label}</dt>
      <dd className="zg-detail-value">{children}</dd>
    </div>
  )
}

function FollowUpSummary({ action, requesterView }: { action: Action; requesterView: boolean }) {
  const followUp = action.followUp
  if (!followUp.required) return <span className="zg-muted">None needed</span>

  return (
    <div className="zg-action-followup">
      <div>
        <FollowUpBadge status={followUp.status} />{' '}
        {followUp.assignee && (
          <span className="zg-action-assignee">
            {followUp.assignee.name}
            {!followUp.assignee.isActive && (
              <>
                {' '}
                <span className="zg-badge zg-badge-inactive">Inactive</span>
              </>
            )}
          </span>
        )}
      </div>
      {followUp.note && (
        <p className="zg-action-text">
          {requesterView ? 'Next step: ' : ''}
          {followUp.note}
        </p>
      )}
      {followUp.closedAt && followUp.closedBy && (
        <span className="zg-hint">
          {followUp.status === 'Completed' ? 'Done' : 'Cancelled'} by {followUp.closedBy.name}, {formatBangkok(followUp.closedAt)}
        </span>
      )}
    </div>
  )
}

function ActionView({
  action,
  ownerId,
  requesterView,
  actions,
}: {
  action: Action
  ownerId: string | null
  requesterView: boolean
  actions?: ReactNode
}) {
  return (
    <div className="zg-action-view" data-testid="action-view">
      <dl className="zg-action-fields">
        <Field label="Action Date/Time">{formatBangkok(action.actionAt)}</Field>
        <Field label="Performed by">
          {action.performedBy.name}
          {action.performedBy.id === ownerId && <span className="zg-you-tag zg-owner-tag">Owner</span>}
        </Field>
        <Field label="Action Description">
          <p className="zg-action-text">{action.description}</p>
        </Field>
        <Field label="Result">
          <p className="zg-action-text">{action.result}</p>
        </Field>
        <Field label="Follow-up">
          <FollowUpSummary action={action} requesterView={requesterView} />
        </Field>
        {action.attachmentNotes && (
          <Field label="Attachment Notes">
            <span className="zg-action-text">
              <i className="bi bi-paperclip" aria-hidden="true" /> {action.attachmentNotes}
            </span>
          </Field>
        )}
      </dl>
      {!requesterView && (
        <p className="zg-hint zg-action-meta">
          Recorded {formatBangkok(action.createdAt)} by {action.performedBy.name}
          {action.updatedBy && ` · Edited ${formatBangkok(action.updatedAt)} by ${action.updatedBy.name}`}
        </p>
      )}
      {actions}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

/** Why the list did not load; only `failed` is worth a Retry. */
interface LoadFailure {
  kind: 'forbidden' | 'not-found' | 'failed'
  message: string
}

interface PendingClose {
  action: Action
  status: 'Completed' | 'Cancelled'
}

function ActionsTaken({
  ticketId,
  ticketStatus,
  ticketCreatedAt,
  ownerId,
  mode,
  onCountChange,
  onLocked,
  onChanged,
}: ActionsTakenProps) {
  const { user } = useAuth()
  const wide = useMediaQuery('(min-width: 992px)')

  const requesterView = mode === 'requester'
  const canWrite = !requesterView && (user?.role === 'ITStaff' || user?.role === 'Administrator')
  const locked = LOCKED_STATUSES.includes(ticketStatus)
  const writable = canWrite && !locked

  const listEndpoint = requesterView ? `/api/tickets/${ticketId}/actions` : `/api/staff/tickets/${ticketId}/actions`
  const writeEndpoint = `/api/staff/tickets/${ticketId}/actions`

  const [actions, setActions] = useState<Action[] | null>(null)
  const [loadError, setLoadError] = useState<LoadFailure | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [assignees, setAssignees] = useState<Assignee[]>([])

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeTriggerRef = useRef<HTMLElement | null>(null)

  const countRef = useRef(onCountChange)
  countRef.current = onCountChange

  /** Reads the list; answers it too, so a stale form can pick its Action out. */
  const fetchActions = useCallback(async (): Promise<Action[] | null> => {
    try {
      const res = await apiFetch(listEndpoint)
      if (!res.ok) {
        const error = await readApiError(res)
        // A refusal also drops any list shown before it: nothing the server
        // now withholds stays on screen.
        if (res.status === 403 || res.status === 404) setActions(null)
        setLoadError(
          res.status === 403
            ? { kind: 'forbidden', message: error?.message ?? "You don't have access to the actions on this ticket." }
            : res.status === 404
              ? { kind: 'not-found', message: error?.message ?? 'This ticket could not be found.' }
              : { kind: 'failed', message: error?.message ?? 'Something went wrong. Please try again.' },
        )
        return null
      }
      const body = (await res.json()) as { data: Action[] }
      setActions(body.data)
      setLoadError(null)
      countRef.current?.(body.data.length)
      return body.data
    } catch {
      setLoadError({ kind: 'failed', message: 'Could not reach the server. Please check your connection and try again.' })
      return null
    }
  }, [listEndpoint])

  // A status change re-reads the list too: cancelling the ticket cancels its
  // open follow-ups on the server (BR-16), and this list must show that.
  useEffect(() => {
    void fetchActions()
  }, [fetchActions, reloadToken, ticketStatus])

  useEffect(() => {
    if (!writable) return
    let cancelled = false
    apiFetch('/api/staff/assignees')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setAssignees(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        if (!cancelled) setAssignees([])
      })
    return () => {
      cancelled = true
    }
  }, [writable])

  useEffect(() => {
    if (pendingClose) confirmButtonRef.current?.focus()
  }, [pendingClose])

  const reload = () => setReloadToken((token) => token + 1)

  const reloadOne = async (actionId: string) => {
    const latest = await fetchActions()
    return latest?.find((action) => action.id === actionId) ?? null
  }

  const afterSave = (message: string, action: Action) => {
    setCreating(false)
    setEditingId(null)
    setExpandedId(action.id)
    setSaved(message)
    void fetchActions()
    onChanged?.()
  }

  const defaultAssigneeId =
    (ownerId && assignees.some((entry) => entry.id === ownerId) && ownerId) ||
    (user?.role === 'ITStaff' && assignees.some((entry) => entry.id === user.id) ? user.id : '')

  const openClose = (action: Action, status: PendingClose['status'], trigger: HTMLElement) => {
    closeTriggerRef.current = trigger
    setCloseError(null)
    setPendingClose({ action, status })
  }

  const dismissClose = () => {
    setPendingClose(null)
    setCloseError(null)
    closeTriggerRef.current?.focus()
  }

  const confirmClose = async () => {
    if (!pendingClose || closing) return
    setClosing(true)
    setCloseError(null)

    try {
      const res = await apiJson(`${writeEndpoint}/${pendingClose.action.id}`, 'PATCH', {
        version: pendingClose.action.version,
        followUpStatus: pendingClose.status,
      })

      if (res.ok) {
        const action = (await res.json()) as Action
        setPendingClose(null)
        afterSave(pendingClose.status === 'Completed' ? 'Follow-up marked as done.' : 'Follow-up cancelled.', action)
        return
      }

      const error = await readApiError(res)
      if (error?.code === 'STALE_UPDATE') {
        setCloseError('Someone else changed this action after you opened it. The list has been reloaded — check it and try again.')
        const latest = await reloadOne(pendingClose.action.id)
        if (latest) setPendingClose({ ...pendingClose, action: latest })
        return
      }
      if (error?.code === 'TICKET_LOCKED') onLocked?.()
      setCloseError(
        refusalMessage(res.status, error?.message) ??
          error?.message ??
          'The follow-up could not be updated. Please try again.',
      )
    } catch {
      setCloseError('Could not reach the server. Nothing was changed.')
    } finally {
      setClosing(false)
    }
  }

  const openFollowUps = actions?.filter((action) => action.followUp.status === 'Open').length ?? 0
  const headingId = requesterView ? 'work-done-heading' : 'actions-heading'
  const refused = loadError !== null && loadError.kind !== 'failed'

  const viewButtons = (action: Action) =>
    writable ? (
      <div className="zg-actions zg-action-buttons">
        <button
          type="button"
          className="zg-btn zg-btn-secondary zg-btn-sm"
          onClick={() => {
            setSaved(null)
            setCreating(false)
            setEditingId(action.id)
          }}
        >
          Edit
        </button>
        {action.followUp.status === 'Open' && (
          <>
            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm"
              onClick={(event) => openClose(action, 'Completed', event.currentTarget)}
            >
              Mark follow-up done
            </button>
            <button
              type="button"
              className="zg-btn zg-btn-secondary zg-btn-sm zg-btn-danger-outline"
              onClick={(event) => openClose(action, 'Cancelled', event.currentTarget)}
            >
              Cancel follow-up
            </button>
          </>
        )}
      </div>
    ) : null

  const editForm = (action: Action) => (
    <ActionForm
      key={`edit-${action.id}`}
      kind="edit"
      existing={action}
      ticketCreatedAt={ticketCreatedAt}
      endpoint={writeEndpoint}
      assignees={assignees}
      defaultAssigneeId={defaultAssigneeId}
      performerName={user?.name ?? ''}
      onSaved={(updated) => afterSave('Changes saved.', updated)}
      onCancel={() => setEditingId(null)}
      onLocked={onLocked}
      onReload={reloadOne}
    />
  )

  const body = (action: Action) =>
    editingId === action.id ? (
      editForm(action)
    ) : (
      <ActionView action={action} ownerId={ownerId} requesterView={requesterView} actions={viewButtons(action)} />
    )

  return (
    <section
      className={requesterView ? 'zg-actions-panel zg-actions-panel-requester' : 'zg-actions-panel'}
      aria-labelledby={headingId}
      data-testid={requesterView ? 'work-done' : 'actions-taken'}
    >
      <div className="zg-actions-panel-head">
        <div>
          <h2 className="zg-section-title" id={headingId}>
            <i className="bi bi-tools" aria-hidden="true" /> {requesterView ? 'Work done by IT' : 'Actions Taken'}
            {actions && (
              <>
                {' '}
                <span className="zg-muted">({actions.length})</span>
              </>
            )}
          </h2>
          {!requesterView && (
            <p className="zg-hint zg-caption-shared">
              <i className="bi bi-eye" aria-hidden="true" /> Visible to the requester
              {openFollowUps > 0 && (
                <span className="zg-actions-open-count">
                  {' '}
                  · {openFollowUps} open follow-up{openFollowUps === 1 ? '' : 's'}
                </span>
              )}
            </p>
          )}
        </div>
        {writable && !creating && !refused && (
          <button
            type="button"
            className="zg-btn zg-btn-primary"
            onClick={() => {
              setSaved(null)
              setEditingId(null)
              setCreating(true)
            }}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" /> Record action
          </button>
        )}
      </div>

      {canWrite && locked && (
        <p className="zg-hint" data-testid="actions-locked-hint">
          This ticket is {ticketStatus.toLowerCase()}. Reopen it to record more work.
        </p>
      )}

      {saved && (
        <p className="zg-callout zg-callout-success mb-3" role="status">
          {saved}
        </p>
      )}

      {creating && writable && !refused && (
        <ActionForm
          kind="create"
          ticketCreatedAt={ticketCreatedAt}
          endpoint={writeEndpoint}
          assignees={assignees}
          defaultAssigneeId={defaultAssigneeId}
          performerName={user?.name ?? ''}
          onSaved={(action) => afterSave('Action recorded.', action)}
          onCancel={() => setCreating(false)}
          onLocked={onLocked}
          onReload={reloadOne}
        />
      )}

      {loadError && loadError.kind !== 'failed' && (
        <div
          className={loadError.kind === 'forbidden' ? 'zg-state zg-state-denied' : 'zg-state'}
          data-testid={loadError.kind === 'forbidden' ? 'actions-denied' : 'actions-not-found'}
          role="alert"
        >
          <span className="zg-state-icon" aria-hidden="true">
            {loadError.kind === 'forbidden' ? '🔒' : '🔍'}
          </span>
          <p className="zg-state-title">{loadError.kind === 'forbidden' ? 'Access denied' : 'Not found'}</p>
          <p className="zg-state-text">{loadError.message}</p>
        </div>
      )}

      {loadError?.kind === 'failed' && (
        <div className="zg-callout zg-callout-error" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            {loadError.message}{' '}
            <button type="button" className="zg-link-button" onClick={reload}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!loadError && actions === null && (
        <div className="zg-loading" role="status">
          <span className="zg-spinner" aria-hidden="true" />
          Loading actions...
        </div>
      )}

      {actions && actions.length === 0 && (
        <p className="zg-muted" data-testid="no-actions">
          {requesterView ? "IT Staff haven't recorded any work yet." : 'No actions recorded yet.'}
        </p>
      )}

      {actions && actions.length > 0 && !requesterView && wide && (
        <div className="zg-table-wrap">
          <table className="zg-table zg-actions-table" data-testid="actions-list">
            <thead>
              <tr>
                <th scope="col">Date/Time</th>
                <th scope="col">Description</th>
                <th scope="col">Result</th>
                <th scope="col">Performed by</th>
                <th scope="col">Follow-up</th>
                <th scope="col">
                  <span className="visually-hidden">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => {
                const expanded = expandedId === action.id || editingId === action.id
                return [
                  <tr key={action.id} data-testid="action-row" className={expanded ? 'is-expanded' : undefined}>
                    <td className="zg-cell-tight">{formatBangkok(action.actionAt)}</td>
                    <td>
                      <span className="zg-clamp-2">{action.description}</span>
                    </td>
                    <td>
                      <span className="zg-clamp-2">{action.result}</span>
                    </td>
                    <td>
                      {action.performedBy.name}
                      {action.performedBy.id === ownerId && <span className="zg-you-tag zg-owner-tag">Owner</span>}
                    </td>
                    <td>
                      {action.followUp.required ? (
                        <>
                          <FollowUpBadge status={action.followUp.status} />
                          {action.followUp.assignee && (
                            <span className="zg-action-assignee-inline">
                              {action.followUp.assignee.name}
                              {!action.followUp.assignee.isActive && (
                                <>
                                  {' '}
                                  <span className="zg-badge zg-badge-inactive">Inactive</span>
                                </>
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="zg-muted">—</span>
                      )}
                    </td>
                    <td className="zg-cell-tight">
                      <button
                        type="button"
                        className="zg-btn zg-btn-secondary zg-btn-sm"
                        aria-expanded={expanded}
                        aria-controls={`action-detail-${action.id}`}
                        onClick={() => {
                          if (editingId === action.id) return
                          setExpandedId(expanded ? null : action.id)
                        }}
                      >
                        {expanded ? 'Hide' : 'View'}
                        <span className="visually-hidden"> action from {formatBangkok(action.actionAt)}</span>
                      </button>
                    </td>
                  </tr>,
                  expanded ? (
                    <tr key={`${action.id}-detail`} className="zg-action-detail-row" id={`action-detail-${action.id}`}>
                      <td colSpan={6}>{body(action)}</td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {actions && actions.length > 0 && (requesterView || !wide) && (
        <ol className="zg-action-cards" data-testid="actions-list">
          {actions.map((action) => (
            <li key={action.id} className="zg-action-card" data-testid="action-card">
              {body(action)}
            </li>
          ))}
        </ol>
      )}

      {pendingClose && (
        <div className="zg-modal-backdrop" role="presentation">
          <div
            className="zg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="followup-confirm-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !closing) dismissClose()
            }}
          >
            <h2 className="zg-section-title" id="followup-confirm-title">
              {pendingClose.status === 'Completed' ? 'Mark this follow-up as done?' : 'Cancel this follow-up?'}
            </h2>
            <p className="zg-hint">“{pendingClose.action.followUp.note}”</p>
            <p className="zg-hint">
              {pendingClose.status === 'Completed'
                ? 'It will be recorded as done by you, now. This cannot be undone.'
                : 'It will be recorded as cancelled by you, now. This cannot be undone; a new need is a new action.'}
            </p>

            {closeError && (
              <p className="zg-field-error" role="alert">
                {closeError}
              </p>
            )}

            <div className="zg-actions">
              <button
                type="button"
                ref={confirmButtonRef}
                className={pendingClose.status === 'Cancelled' ? 'zg-btn zg-btn-danger' : 'zg-btn zg-btn-primary'}
                onClick={() => void confirmClose()}
                disabled={closing}
              >
                {closing ? (
                  <>
                    <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                  </>
                ) : pendingClose.status === 'Completed' ? (
                  'Mark as done'
                ) : (
                  'Cancel follow-up'
                )}
              </button>
              <button type="button" className="zg-btn zg-btn-secondary" onClick={dismissClose} disabled={closing}>
                Keep it open
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ActionsTaken
