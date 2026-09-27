import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch, apiJson, readApiError } from '../../apiClient'
import type { Role } from '../../context/auth'
import { COMMENT_MAX_LENGTH, fullTimestamp, relativeTime } from '../../comments'
import { initials } from '../../roles'
import { RoleBadge } from '../Badges'

/**
 * The append-only thread behind both Public Comments and Internal Notes
 * (ui-spec.md §2 "Public vs Internal", §3.3, §3.5; FR-06, FR-12, BR-04,
 * BR-22, BR-23).
 *
 * One component for both because the behaviour is identical — load newest
 * first, validate the body, post, re-read — and only the endpoint, the words
 * and the colour differ. What is *not* shared is the endpoint: a Public
 * Comment can never be fetched from the notes URL or the other way round, so
 * a mix-up would be a missing thread, never a leaked note (AD-03).
 *
 * After a `201` the thread is re-read rather than patched locally, so the
 * author and timestamp on screen are the server's, not a guess. Bodies are
 * rendered as text nodes with `white-space: pre-wrap`; nothing here is ever
 * `dangerouslySetInnerHTML` (AD-09).
 */

export interface ThreadEntry {
  id: string
  body: string
  author: { id: string; name: string; role: Role }
  createdAt: string
}

export interface ThreadPanelProps {
  /** Where the thread lives; `GET` lists it and `POST` appends to it. */
  endpoint: string
  /** `comment` is the white public panel; `note` is the amber internal one. */
  variant: 'comment' | 'note'
  /** False hides the composer entirely (Administrators read only, BR-17). */
  canPost: boolean
  /** Distinguishes the two panels' element ids when both are on one screen. */
  idPrefix: string
  heading: string
  icon: string
  caption: string
  composerLabel: string
  placeholder: string
  submitLabel: string
  emptyText: string
  /** The word used in validation and failure messages ("Comment", "Note"). */
  noun: string
  /** Called after a successful post, so a parent can refresh counts. */
  onPosted?: () => void
}

function ThreadPanel({
  endpoint,
  variant,
  canPost,
  idPrefix,
  heading,
  icon,
  caption,
  composerLabel,
  placeholder,
  submitLabel,
  emptyText,
  noun,
  onPosted,
}: ThreadPanelProps) {
  const [entries, setEntries] = useState<ThreadEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)

    apiFetch(endpoint)
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const error = await readApiError(res)
          setLoadError(error?.message ?? `${noun}s could not be loaded.`)
          return
        }
        const payload = (await res.json()) as { data: ThreadEntry[] }
        if (!cancelled) setEntries(payload.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach the server. Please try again.')
      })

    return () => {
      cancelled = true
    }
  }, [endpoint, noun, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const overLimit = body.length > COMMENT_MAX_LENGTH
  const bodyId = `${idPrefix}-body`
  const counterId = `${idPrefix}-counter`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitError(null)

    // The same rules the server enforces (BR-22), applied first so an
    // obvious rejection does not need a round trip. The server repeats them.
    if (body.trim().length === 0) {
      setBodyError(`${noun} cannot be empty.`)
      return
    }
    if (overLimit) {
      setBodyError(`${noun} must be at most ${COMMENT_MAX_LENGTH} characters.`)
      return
    }

    setPosting(true)
    try {
      const res = await apiJson(endpoint, 'POST', { body: body.trim() })

      if (res.status === 201) {
        setBody('')
        setBodyError(null)
        reload()
        onPosted?.()
        return
      }

      const error = await readApiError(res)
      if (error?.fields?.body) {
        setBodyError(error.fields.body)
      } else {
        // The typed text is kept on a failure (ui-spec.md §3.5 "Safe failure").
        setSubmitError(error?.message ?? `The ${noun.toLowerCase()} could not be posted. Please try again.`)
      }
    } catch {
      setSubmitError(`Could not reach the server. Your ${noun.toLowerCase()} has not been posted.`)
    } finally {
      setPosting(false)
    }
  }

  const isNote = variant === 'note'

  return (
    <section
      className={isNote ? 'zg-thread zg-thread-note' : 'zg-thread zg-thread-comment'}
      aria-labelledby={`${idPrefix}-heading`}
    >
      <h2 className="zg-section-title" id={`${idPrefix}-heading`}>
        <i className={icon} aria-hidden="true" /> {heading}
        {entries && <span className="zg-muted"> ({entries.length})</span>}
      </h2>
      <p className={isNote ? 'zg-hint zg-hint-internal' : 'zg-hint'}>{caption}</p>

      {canPost && (
        <form className="zg-comment-composer" onSubmit={(event) => void submit(event)} noValidate>
          <div className="zg-field">
            <label className="zg-label" htmlFor={bodyId}>
              {composerLabel}
            </label>
            <textarea
              id={bodyId}
              className={[
                'zg-textarea',
                isNote ? 'zg-textarea-internal' : '',
                bodyError || overLimit ? 'is-invalid' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              rows={3}
              value={body}
              placeholder={placeholder}
              disabled={posting}
              aria-invalid={Boolean(bodyError) || overLimit}
              aria-describedby={bodyError ? `${bodyId}-error ${counterId}` : counterId}
              onChange={(event) => {
                setBody(event.target.value)
                if (bodyError) setBodyError(null)
              }}
            />
            <div className="zg-comment-composer-foot">
              {bodyError ? (
                <span className="zg-field-error" id={`${bodyId}-error`} role="alert">
                  {bodyError}
                </span>
              ) : (
                <span />
              )}
              <span
                className={overLimit ? 'zg-char-counter zg-char-counter-over' : 'zg-char-counter'}
                id={counterId}
                aria-live="polite"
              >
                {body.length} / {COMMENT_MAX_LENGTH}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="zg-callout zg-callout-error mb-3" role="alert">
              <span aria-hidden="true">⚠️</span>
              <div>{submitError}</div>
            </div>
          )}

          <div className="zg-actions">
            <button
              type="submit"
              className={isNote ? 'zg-btn zg-btn-internal' : 'zg-btn zg-btn-primary'}
              disabled={posting || overLimit}
            >
              {posting ? (
                <>
                  <span className="zg-spinner-sm" aria-hidden="true" /> Posting...
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      )}

      {loadError && (
        <div className="zg-callout zg-callout-error" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            {loadError}{' '}
            <button type="button" className="zg-link-button" onClick={reload}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!loadError && entries === null && (
        <div className="zg-loading" role="status">
          <span className="zg-spinner" aria-hidden="true" />
          Loading {noun.toLowerCase()}s...
        </div>
      )}

      {entries && entries.length === 0 && (
        <p className="zg-muted" data-testid={`no-${idPrefix}s`}>
          {emptyText}
        </p>
      )}

      {entries && entries.length > 0 && (
        <ol className="zg-comment-list" data-testid={`${idPrefix}-list`}>
          {entries.map((entry) => (
            <li key={entry.id} className={isNote ? 'zg-comment zg-comment-internal' : 'zg-comment'}>
              <span className="zg-avatar zg-comment-avatar" aria-hidden="true">
                {initials(entry.author.name)}
              </span>
              <div className="zg-comment-main">
                <div className="zg-comment-head">
                  <span className="zg-comment-author">{entry.author.name}</span>
                  <RoleBadge role={entry.author.role} />
                  <time
                    className="zg-comment-time"
                    dateTime={entry.createdAt}
                    title={fullTimestamp(entry.createdAt)}
                  >
                    {relativeTime(entry.createdAt)}
                  </time>
                </div>
                <p className="zg-comment-body">{entry.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default ThreadPanel
