import { useRequester } from '../context/requester'

/**
 * Placeholder for the My Tickets list (Issue #5). It exists now so Issue #3
 * has a real destination after the requester is selected; the table, search,
 * filters and pagination described in ui-spec.md §3.3 land with Issue #5.
 */
function MyTickets() {
  const { requester } = useRequester()

  return (
    <section>
      <h1 className="zg-title">My Tickets</h1>
      <p className="zg-subtitle">
        Showing tickets for {requester?.name}.
      </p>
      <div className="zg-card">
        <p className="zg-muted mb-0">
          The ticket list arrives with Issue #5. Everything on this screen is scoped to the
          selected requester and is discarded when the requester changes.
        </p>
      </div>
    </section>
  )
}

export default MyTickets
