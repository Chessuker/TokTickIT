import { useState, useEffect } from 'react'

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
        message: `Could not reach the backend at ${API_URL}. Make sure the server is running.`
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
    <div className="min-vh-100 bg-light">
      {/* Navigation */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container">
          <a className="navbar-brand d-flex align-items-center gap-2 fw-bold" href="#">
            <span>TokTickIT Platform</span>
          </a>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary px-3 py-2 rounded-pill">
              <i className="bi bi-bootstrap-fill me-1"></i> Bootstrap 5
            </span>
            <span className="badge bg-info text-dark px-3 py-2 rounded-pill">
              <i className="bi bi-lightning-charge-fill me-1"></i> Vite + React
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container py-5">
        {/* Banner */}
        <div className="p-5 mb-4 bg-white rounded-3 shadow-sm border">
          <div className="container-fluid py-2">
            <h1 className="display-5 fw-bold text-dark mb-3">
              <i className="bi bi-rocket-takeoff text-primary me-2"></i>
              TokTickIT Stack Ready
            </h1>
            <p className="col-md-10 fs-5 text-muted">
              React + TypeScript + Vite frontend styled with Bootstrap 5, powered by Node.js + Express + Prisma backend connected to PostgreSQL.
            </p>
            <div className="d-flex flex-wrap align-items-center gap-3 pt-2">
              <button onClick={checkHealth} className="btn btn-outline-primary btn-lg" disabled={loadingHealth}>
                <i className={`bi ${loadingHealth ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'} me-2`}></i>
                Refresh API Health Check
              </button>
              {!loadingHealth && (
                <span className="text-muted">
                  System Status: <strong className={health?.status === 'ok' ? 'text-success' : 'text-danger'}>
                    {health?.status === 'ok' ? 'Online' : 'Offline'}
                  </strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* Backend & DB Status Card */}
          <div className="col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-primary text-white py-3 fw-bold">
                <i className="bi bi-server me-2"></i> Backend & PostgreSQL Status
              </div>
              <div className="card-body">
                {loadingHealth ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-2 text-muted">Connecting to backend server...</p>
                  </div>
                ) : (
                  <>
                    {health?.status !== 'ok' && (
                      <div className="alert alert-danger d-flex align-items-start gap-2" role="alert">
                        <i className="bi bi-exclamation-triangle-fill mt-1"></i>
                        <div>
                          <strong>Backend unavailable.</strong>{' '}
                          {health?.message || 'The API did not return a healthy status.'}
                        </div>
                      </div>
                    )}
                    <ul className="list-group list-group-flush fs-6">
                      <li className="list-group-item d-flex justify-content-between align-items-center py-3">
                        <span><i className="bi bi-hdd-network me-2 text-muted"></i>Express API Status</span>
                        <span className={`badge ${health?.status === 'ok' ? 'bg-success' : 'bg-danger'} px-3 py-2`}>
                          {health?.status === 'ok' ? 'Online' : 'Offline'}
                        </span>
                      </li>
                      <li className="list-group-item d-flex justify-content-between align-items-center py-3">
                        <span><i className="bi bi-tag me-2 text-muted"></i>Service</span>
                        <span className="text-muted">{health?.service || 'N/A'}</span>
                      </li>
                      <li className="list-group-item d-flex justify-content-between align-items-center py-3">
                        <span><i className="bi bi-database-check me-2 text-muted"></i>PostgreSQL & Prisma</span>
                        <span className={`badge ${health?.database === 'CONNECTED' ? 'bg-success' : 'bg-danger'} px-3 py-2`}>
                          {health?.database || 'DISCONNECTED'}
                        </span>
                      </li>
                      <li className="list-group-item d-flex justify-content-between align-items-center py-3">
                        <span><i className="bi bi-clock-history me-2 text-muted"></i>Last Health Check</span>
                        <small className="text-muted">{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}</small>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Add User Card */}
          <div className="col-md-6">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-dark text-white py-3 fw-bold">
                <i className="bi bi-person-plus-fill me-2"></i> Add Test User (Prisma DB)
              </div>
              <div className="card-body">
                <form onSubmit={createUser}>
                  <div className="mb-3">
                    <label htmlFor="userEmail" className="form-label font-monospace">Email address</label>
                    <input
                      type="email"
                      className="form-aria-input form-control"
                      id="userEmail"
                      placeholder="admin@toktickit.xyz"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="userName" className="form-label font-monospace">Name (Optional)</label>
                    <input
                      type="text"
                      className="form-aria-input form-control"
                      id="userName"
                      placeholder="TokTickIT Admin"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-success w-100 py-2 fw-semibold" disabled={submitting}>
                    {submitting ? (
                      <span><span className="spinner-border spinner-border-sm me-2"></span>Saving...</span>
                    ) : (
                      <span><i className="bi bi-plus-circle me-2"></i>Create User in Database</span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* User Table */}
          <div className="col-12">
            <div className="card shadow-sm border-0">
              <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold text-dark">
                  <i className="bi bi-people-fill text-primary me-2"></i> Registered Users in PostgreSQL
                </h5>
                <button onClick={fetchUsers} className="btn btn-sm btn-outline-secondary">
                  <i className="bi bi-arrow-clockwise me-1"></i> Refresh List
                </button>
              </div>
              <div className="card-body p-0">
                {users.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    <i className="bi bi-inbox fs-1 d-block mb-2 text-secondary"></i>
                    No users stored in PostgreSQL yet. Create one above!
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Created At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="font-monospace text-muted fs-7">{u.id.substring(0, 8)}...</td>
                            <td className="fw-semibold">{u.name || <span className="text-muted italic">No Name</span>}</td>
                            <td><span className="badge bg-light text-dark border">{u.email}</span></td>
                            <td className="text-muted fs-7">{new Date(u.createdAt).toLocaleString()}</td>
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
      </main>

      <footer className="footer mt-auto py-3 bg-dark text-white-50 text-center">
        <div className="container">
          <small>TokTickIT © 2026 — React + Vite + Bootstrap + Node.js + Express + Prisma + PostgreSQL</small>
        </div>
      </footer>
    </div>
  )
}

export default App
