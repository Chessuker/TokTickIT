import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { ROLE_HOMES, ROLE_NAV, initials } from '../roles'
import { RoleBadge } from './Badges'

/**
 * Application shell (Lab 3 ui-spec.md §3.0; FR-03, AC-11).
 *
 * The header shows who is signed in — name, role badge — and only that role's
 * navigation. The profile menu offers Change password and Log out. While a
 * password change is pending the shell collapses to the app name and Log out,
 * because nothing else is reachable (AC-02).
 *
 * The routed content is keyed by the user's id, so a change of identity
 * unmounts and remounts the whole subtree: no previously loaded ticket, list
 * page or form value can survive into another user's session.
 */
function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // Close the profile menu on an outside click or Escape.
  useEffect(() => {
    if (!profileOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileOpen])

  if (!user) return null

  const forced = user.mustChangePassword
  const home = ROLE_HOMES[user.role]
  const navItems = forced ? [] : ROLE_NAV[user.role]

  const handleLogout = async () => {
    setProfileOpen(false)
    setMenuOpen(false)
    setLoggingOut(true)
    await logout()
    // `replace`, so Back lands on /login again; every guarded route re-checks
    // the session anyway, so there is nothing to come back to (AC-08).
    navigate('/login', { replace: true })
  }

  const handleChangePassword = () => {
    setProfileOpen(false)
    setMenuOpen(false)
    navigate('/change-password')
  }

  const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'zg-nav-link is-active' : 'zg-nav-link')

  return (
    <div className="zg-app">
      <header className="zg-header">
        <div className="zg-header-bar">
          <Link to={forced ? '/change-password' : home} className="zg-brand">
            TokTickIT
          </Link>

          <button
            type="button"
            className="zg-header-toggle"
            aria-expanded={menuOpen}
            aria-controls="zg-header-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>

          <div id="zg-header-menu" className={menuOpen ? 'zg-header-menu is-open' : 'zg-header-menu'}>
            {navItems.length > 0 && (
              <nav className="zg-nav" aria-label="Main">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}

            <div className="zg-header-identity" ref={profileRef}>
              {forced ? (
                <>
                  <div className="zg-profile-summary">
                    <span className="zg-avatar" aria-hidden="true">
                      {initials(user.name)}
                    </span>
                    <span className="zg-profile-name">{user.name}</span>
                    <RoleBadge role={user.role} onPrimary />
                  </div>
                  <button
                    type="button"
                    className="zg-btn zg-btn-outline-light"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="zg-profile-button"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    aria-controls="zg-profile-menu"
                    onClick={() => setProfileOpen((open) => !open)}
                  >
                    <span className="zg-avatar" aria-hidden="true">
                      {initials(user.name)}
                    </span>
                    <span className="zg-profile-name">{user.name}</span>
                    <RoleBadge role={user.role} onPrimary />
                    <i className={profileOpen ? 'bi bi-chevron-up' : 'bi bi-chevron-down'} aria-hidden="true" />
                  </button>

                  <div
                    id="zg-profile-menu"
                    role="menu"
                    aria-label="Profile"
                    className={profileOpen ? 'zg-profile-menu is-open' : 'zg-profile-menu'}
                  >
                    <button type="button" role="menuitem" className="zg-profile-item" onClick={handleChangePassword}>
                      <i className="bi bi-key" aria-hidden="true" /> Change password
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="zg-profile-item"
                      onClick={() => void handleLogout()}
                      disabled={loggingOut}
                    >
                      <i className="bi bi-box-arrow-right" aria-hidden="true" /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="zg-container" key={user.id}>
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
