import CreateTicketForm from '../components/CreateTicketForm'

/**
 * Create Ticket screen (ui-spec.md §3.2, Issue #4). The page owns the heading;
 * the form owns every piece of state, so nothing here can reset it.
 */
function CreateTicket() {
  return (
    <section>
      <h1 className="zg-title">Create Ticket</h1>
      <p className="zg-subtitle">
        Raise a new ticket in your name. The ticket number and status are assigned by the server.
      </p>
      <CreateTicketForm />
    </section>
  )
}

export default CreateTicket
