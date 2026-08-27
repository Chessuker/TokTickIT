import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import RequesterSelector from './components/RequesterSelector'
import RequireRequester from './components/RequireRequester'
import CreateTicket from './pages/CreateTicket'
import MyTickets from './pages/MyTickets'
import SystemStatus from './pages/SystemStatus'

/**
 * Route table. Every application screen sits behind RequireRequester, so
 * opening any of them without a selected requester redirects to the selector
 * (AC-02). The selector itself is deliberately outside the guard and outside
 * the shell — there is no requester to show in a header yet.
 */
function App() {
  return (
    <Routes>
      <Route path="/select-requester" element={<RequesterSelector />} />

      <Route element={<RequireRequester />}>
        <Route element={<AppShell />}>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/system" element={<SystemStatus />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

export default App
