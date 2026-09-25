import ThreadPanel from './ThreadPanel'

/**
 * Internal Notes panel (ui-spec.md §2 "Public vs Internal", §3.5; FR-12,
 * BR-04, BR-22, BR-23, AC-23).
 *
 * Everything about this panel says "not the requester's": the amber card, the
 * lock icon, the caption, the amber composer and the outlined button
 * (ui-spec.md §2). The visual difference is the point — the two composers are
 * never on screen together (they live in separate tabs), and the one that is
 * on screen must be unmistakable.
 *
 * `canPost` is false for an Administrator, who reads notes but never writes
 * them (BR-17, BR-23). A Requester never renders this panel at all, and the
 * endpoint answers them `403` before the ticket is even looked up.
 */

interface InternalNotesPanelProps {
  ticketId: string
  canPost: boolean
  onPosted?: () => void
}

function InternalNotesPanel({ ticketId, canPost, onPosted }: InternalNotesPanelProps) {
  return (
    <ThreadPanel
      endpoint={`/api/staff/tickets/${ticketId}/internal-notes`}
      variant="note"
      canPost={canPost}
      idPrefix="note"
      heading="Internal Notes"
      icon="bi bi-lock-fill"
      caption="Internal — not visible to the requester."
      composerLabel="Add internal note"
      placeholder="Private note for IT Staff…"
      submitLabel="Add Internal Note"
      emptyText="No internal notes yet."
      noun="Note"
      onPosted={onPosted}
    />
  )
}

export default InternalNotesPanel
