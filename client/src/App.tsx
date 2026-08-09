import { useState, useEffect } from 'react'
import CategoryList from './components/CategoryList'

interface BackendHealth {
  status: string
  service?: string
  timestamp: string
  database: string
  message?: string
}

interface User {
  id: string
  email: string
  name: string | null
  createdAt: string
}

function App() {
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true)
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  const checkHealth = async () => {
    setLoadingHealth(true)
    try {
      const res = await fetch(`${API_URL}/api/health`)
      const data = await res.json()
      setHealth(data)
    } catch (err) {
      setHealth({
        status: 'offline',
        timestamp: new Date().toISOString(),
        database: 'UNREACHABLE',
        message: `Could not reach backend server at ${API_URL}.`
      })
    } finally {
      setLoadingHealth(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      if (res.ok) {
        setName('')
        setEmail('')
        fetchUsers()
      }
    } catch (err) {
      console.error('Failed to create user:', err)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    checkHealth()
    fetchUsers()
  }, [])

  return (
    <div className="min-vh-100 py-3">
      {/* 90s Marquee Ticker */}
      <div className="retro-marquee mb-3">
        <div className="retro-marquee-content">
          🌐 WELCOME TO TokTickIT CYBER PORTAL 2000! ★ BEST VIEWED IN NETSCAPE NAVIGATOR 4.0 AT 800x600 ★ SYSTEM ONLINE ★ POWERED BY EXPRESS + REACT + PRISMA ★
        </div>
      </div>

      {/* Main Window Frame */}
      <div className="retro-window">
        <div className="retro-window-header">
          <span>🖥️ TokTickIT_Cyber_Station_v1.0.exe</span>
          <div className="window-controls">
            <div className="window-btn">_</div>
            <div className="window-btn">□</div>
            <div className="window-btn">X</div>
          </div>
        </div>

        <div className="retro-window-body">
          {/* Cyber Hero Banner */}
          <div className="retro-hero mb-4">
            <span className="retro-badge badge-yellow blink">★ NEW 1999 EDITION ★</span>
            <span className="retro-badge badge-pink">HOT SOFTWARE! 🔥</span>
            <span className="retro-badge badge-cyan">CYBER APPROVED ⚡</span>

            <h1 className="retro-title">TokTickIT Platform</h1>
            <p className="font-monospace text-light fs-5 mb-3">
              === WELCOME TO THE LATE 90S INTERNET HIGHWAY ===
            </p>
            <p className="font-monospace text-warning small mb-3">
              React + TypeScript + Vite + Bootstrap 5 + Express + PostgreSQL + Prisma
            </p>

            <div className="d-flex justify-content-center align-items-center gap-3 flex-wrap">
              <div className="hit-counter">
                <span>0</span><span>0</span><span>4</span><span>8</span><span>9</span><span>2</span>
              </div>
              <button onClick={checkHealth} className="retro-btn retro-btn-primary" disabled={loadingHealth}>
                {loadingHealth ? '⌛ PINGING SERVER...' : '🔄 RE-PING API HEALTH'}
              </button>
            </div>
          </div>

          <div className="row g-4">
            {/* System Status Window */}
            <div className="col-md-6">
              <div className="retro-window mb-0 h-100">
                <div className="retro-window-header">
                  <span>📡 SYSTEM DIAGNOSTICS</span>
                </div>
                <div className="retro-window-body">
                  <div className="retro-well font-monospace">
                    {loadingHealth ? (
                      <div className="text-center py-4">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Connecting...</span>
                        </div>
                        <p className="mt-2 text-primary blink">DIAL-UP CONNECTING TO BACKEND...</p>
                      </div>
                    ) : (
                      <div>
                        {health?.status !== 'ok' && (
                          <div className="alert alert-danger mb-3 p-2 small" role="alert">
                            ⚠️ <strong>MODEM ERROR:</strong> {health?.message || 'Server Unreachable'}
                          </div>
                        )}
                        <table className="retro-table">
                          <tbody>
                            <tr>
                              <th>SERVICE</th>
                              <td>TokTickIT API</td>
                            </tr>
                            <tr>
                              <th>EXPRESS STATUS</th>
                              <td>
                                <span className={`retro-badge ${health?.status === 'ok' ? 'badge-green' : 'badge-pink'}`}>
                                  {health?.status === 'ok' ? 'ONLINE (200 OK)' : 'OFFLINE'}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <th>POSTGRES & PRISMA</th>
                              <td>
                                <span className={`retro-badge ${health?.database === 'CONNECTED' ? 'badge-green' : 'badge-pink'}`}>
                                  {health?.database || 'DISCONNECTED'}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <th>TIMESTAMP</th>
                              <td className="small">{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Guestbook / User Signup Form */}
            <div className="col-md-6">
              <div className="retro-window mb-0 h-100">
                <div className="retro-window-header">
                  <span>📝 SIGN THE CYBER GUESTBOOK</span>
                </div>
                <div className="retro-window-body">
                  <div className="retro-well">
                    <form onSubmit={createUser}>
                      <div className="mb-3">
                        <label htmlFor="userEmail" className="form-label font-monospace fw-bold">
                          📧 CYBER MAIL (EMAIL):
                        </label>
                        <input
                          type="email"
                          className="retro-input"
                          id="userEmail"
                          placeholder="admin@toktickit.xyz"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label htmlFor="userName" className="form-label font-monospace fw-bold">
                          👤 USER HANDLE (NAME):
                        </label>
                        <input
                          type="text"
                          className="retro-input"
                          id="userName"
                          placeholder="TokTickIT Admin"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="retro-btn retro-btn-success w-100" disabled={submitting}>
                        {submitting ? '💾 SAVING TO POSTGRES...' : '💾 SUBMIT TO GUESTBOOK'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            {/* Categories Window Component */}
            <div className="col-12">
              <CategoryList />
            </div>

            {/* User Directory Window */}
            <div className="col-12">
              <div className="retro-window mb-0">
                <div className="retro-window-header">
                  <span>👥 REGISTERED USERS DIRECTORY (POSTGRESQL)</span>
                  <button onClick={fetchUsers} className="window-btn px-2">🔄</button>
                </div>
                <div className="retro-window-body">
                  <div className="retro-well p-0">
                    {users.length === 0 ? (
                      <div className="p-4 text-center font-monospace text-muted">
                        📭 [GUESTBOOK IS EMPTY] Create the first user entry above!
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="retro-table mb-0">
                          <thead>
                            <tr>
                              <th>USER ID</th>
                              <th>HANDLE / NAME</th>
                              <th>EMAIL ADDRESS</th>
                              <th>TIMESTAMP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((u) => (
                              <tr key={u.id}>
                                <td className="font-monospace text-muted">{u.id.substring(0, 8)}...</td>
                                <td className="fw-bold text-primary">{u.name || 'ANONYMOUS'}</td>
                                <td>
                                  <span className="retro-badge badge-yellow">{u.email}</span>
                                </td>
                                <td className="font-monospace small">{new Date(u.createdAt).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 90s Footer */}
        <div className="p-3 bg-dark text-center font-monospace text-warning border-top border-secondary">
          <p className="mb-1">
            TokTickIT © 1999-2026 — CYBERNETICS DIVISION ★ NETSCAPE NAVIGATOR & IE 5 COMPATIBLE
          </p>
          <p className="small text-muted mb-0">
            [ REACT + VITE + BOOTSTRAP 5 + EXPRESS + PRISMA + POSTGRESQL ]
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
