import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import type { Role } from '../../context/auth'
import { ROLE_HOMES } from '../../roles'

/**
 * Route guard (ui-spec.md §3.0 "Route guards", AC-02, AC-08, AC-11).
 *
 * - No session → `/login?from=<path>` so Login can return the user afterwards
 *   (a plain `/login` right after a deliberate logout, AC-08).
 * - `mustChangePassword` → `/change-password` from every route but that one.
 * - `roles` given and the user's role is not among them → the Forbidden state,
 *   rendered in place without loading any data.
 *
 * The guard only reflects what the server already enforces (FR-04): hiding a
 * screen here is feedback, the `401`/`403` from the API is the rule.
 */
function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading, loggedOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="zg-loading" role="status">
        <span className="zg-spinner" aria-hidden="true" />
        Loading…
      </div>
    )
  }

  if (!user) {
    if (loggedOut) return <Navigate to="/login" replace />
    const from = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?from=${from}`} replace />
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Forbidden role={user.role} />
  }

  return <Outlet />
}

/** The Forbidden feedback state (ui-spec.md §2 "Feedback states"). */
export function Forbidden({ role }: { role: Role }) {
  return (
    <section className="zg-state zg-state-denied" role="alert">
      <span className="zg-state-icon" aria-hidden="true">
        <i className="bi bi-lock-fill" />
      </span>
      <h1 className="zg-state-title">You don&apos;t have access to this page</h1>
      <p className="zg-state-text">This area is not available for your role.</p>
      <Link to={ROLE_HOMES[role]} className="zg-btn zg-btn-primary">
        Go to your home
      </Link>
    </section>
  )
}

export default RequireAuth
