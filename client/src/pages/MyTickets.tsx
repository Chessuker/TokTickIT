import MyTicketsList from '../components/MyTickets'

/**
 * My Tickets screen (ui-spec.md §3.3, Issue #5). The page is a thin route
 * wrapper; the list component owns every piece of query state, matching how the
 * Create Ticket screen wraps its form.
 */
function MyTickets() {
  return <MyTicketsList />
}

export default MyTickets
