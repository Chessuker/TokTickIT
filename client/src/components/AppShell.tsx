import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useRequester } from '../context/requester'

const NAV_ITEMS = [
  { to: '/tickets', label: 'My Tickets' },
  { to: '/tickets/new', label: 'Create Ticket' },
  { to: '/system', label: 'System Status' },
]

/**
 * Application shell (ui-spec.md §3.0).
 *
 * The header carries the selected requester's name and a "Change Requester"
 * control on every screen (FR-06).
 *
 * BR-13 is enforced structurally: the routed content is keyed by the selected
 * requester's id, so switching requester unmounts the whole subtree and
 * remounts it fresh. No previously loaded ticket, list page, filter or form
 * value can survive the switch, whatever a child component happens to cache in
 * its own state.
 */
function AppShell() {
  const { requester, clearRequester } = useRequester()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleChangeRequester = () => {
    setMenuOpen(false)
    // Clearing first means the guard already considers the app requester-less
    // by the time the selector renders.
    clearRequester()
    navigate('/select-requester', { replace: true })
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'zg-nav-link is-active' : 'zg-nav-link'

  return (
    <div className="zg-app">
      <header className="zg-header">
        <div className="zg-header-bar">
          <NavLink to="/tickets" className="zg-brand">
            TokTickIT
          </NavLink>

          <button
            type="button"
            className="zg-header-toggle"
            aria-expanded={menuOpen}
            aria-controls="zg-header-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>

          <div
            id="zg-header-menu"
            className={menuOpen ? 'zg-header-menu is-open' : 'zg-header-menu'}
          >
            <nav className="zg-nav" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/tickets'}
                  className={navClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="zg-header-identity">
              <div className="zg-requester">
                <span className="zg-requester-label">Requester</span>
                <span className="zg-requester-name">{requester?.name}</span>
              </div>
              <button
                type="button"
                className="zg-btn zg-btn-outline-light"
                onClick={handleChangeRequester}
              >
                Change Requester
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="zg-container" key={requester?.id}>
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
