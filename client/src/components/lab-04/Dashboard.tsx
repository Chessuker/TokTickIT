import { useAuth } from '../../context/auth'
import RequesterDashboard from './RequesterDashboard'
import StaffDashboard from './StaffDashboard'

/**
 * `/dashboard`: every role's home (Lab 4 ui-spec.md §3.0, AD-09). One route,
 * the role's own variant; the two API endpoints stay separate, so a role bug
 * here can never widen what a Requester is sent (BR-23).
 */
function Dashboard() {
  const { user } = useAuth()
  if (!user) return null
  return user.role === 'Requester' ? <RequesterDashboard /> : <StaffDashboard />
}

export default Dashboard
