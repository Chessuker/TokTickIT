import ThreadPanel from './ThreadPanel'
import type { ThreadEntry } from './ThreadPanel'

/**
 * Public Comments panel (ui-spec.md §2 "Public vs Internal", §3.3; FR-06,
 * BR-04, BR-22, BR-23, AC-14).
 *
 * The thread itself is `ThreadPanel`; this file fixes the endpoint and the
 * words. Separating them keeps the one thing that must never be confused — a
 * comment the Requester can read versus a note they must not — down to a
 * single line of URL per panel.
 *
 * The composer is offered only when `canComment` says so (Administrators read
 * but never write, BR-17); the server refuses anyway, this just avoids
 * offering a control that would be refused.
 */

export type Comment = ThreadEntry

interface CommentsPanelProps {
  ticketId: string
  canComment: boolean
  /** Called after a comment is posted so the parent can refresh its counts. */
  onPosted?: () => void
}

function CommentsPanel({ ticketId, canComment, onPosted }: CommentsPanelProps) {
  return (
    <ThreadPanel
      endpoint={`/api/tickets/${ticketId}/comments`}
      variant="comment"
      canPost={canComment}
      idPrefix="comment"
      heading="Public Comments"
      icon="bi bi-chat-left-text"
      caption="Visible to you and to the IT team working on this ticket."
      composerLabel="Add public comment"
      placeholder="Reply to the requester…"
      submitLabel="Post Comment"
      emptyText="No comments yet."
      noun="Comment"
      onPosted={onPosted}
    />
  )
}

export default CommentsPanel
