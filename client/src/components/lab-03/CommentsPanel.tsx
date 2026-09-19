import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch, apiJson, readApiError } from '../../apiClient'
import type { Role } from '../../context/auth'
import { COMMENT_MAX_LENGTH, fullTimestamp, relativeTime } from '../../comments'
import { initials } from '../../roles'
import { RoleBadge } from '../Badges'

/**
 * Public Comments panel (ui-spec.md §2 "Public vs Internal", §3.3; FR-06,
 * BR-04, BR-22, BR-23, AC-14).
 *
 * The thread is what `GET /api/tickets/:id/comments` returns, newest first;
 * the panel never reorders or merges a posted comment into its own state —
 * after a `201` it re-reads the thread so the author and timestamp on screen
 * are the server's, not a guess. Bodies are rendered as text nodes with
 * `white-space: pre-wrap`; nothing here is ever `dangerouslySetInnerHTML`
 * (AD-09).
 *
 * The composer is offered only when `canComment` says so (Administrators
 * read but never write, BR-17); the server refuses anyway, this just avoids
 * offering a control that would be refused.
 */

export interface Comment {
  id: string
  body: string
  author: { id: string; name: string; role: Role }
  createdAt: string
}

interface CommentsPanelProps {
  ticketId: string
  canComment: boolean
  /** Called after a comment is posted so the parent can refresh `updatedAt`. */
  onPosted?: () => void
}

function CommentsPanel({ ticketId, canComment, onPosted }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)

    apiFetch(`/api/tickets/${ticketId}/comments`)
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const error = await readApiError(res)
          setLoadError(error?.message ?? 'Comments could not be loaded.')
          return
        }
        const payload = (await res.json()) as { data: Comment[] }
        if (!cancelled) setComments(payload.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach the server. Please try again.')
      })

    return () => {
      cancelled = true
    }
  }, [ticketId, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const trimmedLength = body.trim().length
  const overLimit = body.length > COMMENT_MAX_LENGTH

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitError(null)

    // The same rules the server enforces (BR-22), applied first so an
    // obvious rejection does not need a round trip. The server repeats them.
    if (trimmedLength === 0) {
      setBodyError('Comment cannot be empty.')
      return
    }
    if (overLimit) {
      setBodyError(`Comment must be at most ${COMMENT_MAX_LENGTH} characters.`)
      return
    }

    setPosting(true)
    try {
      const res = await apiJson(`/api/tickets/${ticketId}/comments`, 'POST', { body: body.trim() })

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
        setSubmitError(error?.message ?? 'The comment could not be posted. Please try again.')
      }
    } catch {
      setSubmitError('Could not reach the server. Your comment has not been posted.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="zg-card mt-3 zg-comments" aria-labelledby="public-comments-heading">
      <h2 className="zg-section-title" id="public-comments-heading">
        <i className="bi bi-chat-left-text" aria-hidden="true" /> Public Comments
        {comments && <span className="zg-muted"> ({comments.length})</span>}
      </h2>
      <p className="zg-hint">Visible to you and to the IT team working on this ticket.</p>

      {canComment && (
        <form className="zg-comment-composer" onSubmit={(event) => void submit(event)} noValidate>
          <div className="zg-field">
            <label className="zg-label" htmlFor="comment-body">
              Add public comment
            </label>
            <textarea
              id="comment-body"
              className={bodyError || overLimit ? 'zg-textarea is-invalid' : 'zg-textarea'}
              rows={3}
              value={body}
              placeholder="Reply to the requester…"
              disabled={posting}
              aria-invalid={Boolean(bodyError) || overLimit}
              aria-describedby={bodyError ? 'comment-body-error comment-counter' : 'comment-counter'}
              onChange={(event) => {
                setBody(event.target.value)
                if (bodyError) setBodyError(null)
              }}
            />
            <div className="zg-comment-composer-foot">
              {bodyError ? (
                <span className="zg-field-error" id="comment-body-error" role="alert">
                  {bodyError}
                </span>
              ) : (
                <span />
              )}
              <span
                className={overLimit ? 'zg-char-counter zg-char-counter-over' : 'zg-char-counter'}
                id="comment-counter"
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
              className="zg-btn zg-btn-primary"
              disabled={posting || overLimit}
            >
              {posting ? (
                <>
                  <span className="zg-spinner-sm" aria-hidden="true" /> Posting...
                </>
              ) : (
                'Post Comment'
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

      {!loadError && comments === null && (
        <div className="zg-loading" role="status">
          <span className="zg-spinner" aria-hidden="true" />
          Loading comments...
        </div>
      )}

      {comments && comments.length === 0 && (
        <p className="zg-muted" data-testid="no-comments">
          No comments yet.
        </p>
      )}

      {comments && comments.length > 0 && (
        <ol className="zg-comment-list" data-testid="comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="zg-comment">
              <span className="zg-avatar zg-comment-avatar" aria-hidden="true">
                {initials(comment.author.name)}
              </span>
              <div className="zg-comment-main">
                <div className="zg-comment-head">
                  <span className="zg-comment-author">{comment.author.name}</span>
                  <RoleBadge role={comment.author.role} />
                  <time
                    className="zg-comment-time"
                    dateTime={comment.createdAt}
                    title={fullTimestamp(comment.createdAt)}
                  >
                    {relativeTime(comment.createdAt)}
                  </time>
                </div>
                <p className="zg-comment-body">{comment.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default CommentsPanel
