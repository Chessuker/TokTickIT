import TicketDetailView from '../components/TicketDetail'

/**
 * Ticket Detail screen (ui-spec.md §3.4, Issue #6). A thin route wrapper, as on
 * the other screens: the component owns the fetch, the attachment lifecycle and
 * every error state, including access denied.
 */
function TicketDetail() {
  return <TicketDetailView />
}

export default TicketDetail
