import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useRequester } from '../context/requester'

/**
 * Route guard for AC-02: any application screen opened without a selected
 * requester redirects to the Development Requester selector. The attempted
 * location travels in router state so the selector can return the user there
 * after they choose.
 */
function RequireRequester() {
  const { requester } = useRequester()
  const location = useLocation()

  if (!requester) {
    return <Navigate to="/select-requester" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}

export default RequireRequester
