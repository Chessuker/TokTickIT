import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ChangePassword from './components/lab-03/ChangePassword'
import Login from './components/lab-03/Login'
import RequireAuth from './components/lab-03/RequireAuth'
import StaffTicketDetail from './components/lab-03/StaffTicketDetail'
import StaffTicketQueue from './components/lab-03/StaffTicketQueue'
import UserManagement from './components/lab-03/UserManagement'
import { useAuth } from './context/auth'
import CreateTicket from './pages/CreateTicket'
import MyTickets from './pages/MyTickets'
import TicketDetail from './pages/TicketDetail'
import { ROLE_HOMES } from './roles'

/** `/` and unknown paths: the role's home when signed in, Login otherwise. */
function Home() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? ROLE_HOMES[user.role] : '/login'} replace />
}

/**
 * Route table (Lab 3 ui-spec.md §3.0).
 *
 * Login is the only screen outside the guard. Everything else sits behind
 * `RequireAuth`, which sends anonymous visitors to Login and users with a
 * pending password change to `/change-password`; the role-restricted groups
 * render the Forbidden state for the wrong role (AC-11).
 */
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/change-password" element={<ChangePassword />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['Requester']} />}>
        <Route element={<AppShell />}>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['ITStaff', 'Administrator']} />}>
        <Route element={<AppShell />}>
          <Route path="/staff/queue" element={<StaffTicketQueue />} />
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Route>
      </Route>

      <Route element={<RequireAuth roles={['Administrator']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin/users" element={<UserManagement />} />
        </Route>
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default App
