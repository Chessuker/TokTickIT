import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { API_URL } from '../api'
import { useRequester } from '../context/requester'
import type { Requester } from '../context/requester'

/**
 * Development Requester Selection screen (ui-spec.md §3.1).
 *
 * BR-03: this is a testing mechanism, not a login. The amber callout below
 * says so, and nothing here verifies a credential.
 * BR-11 / AC-14: the dropdown lists whatever `GET /api/requesters` returns,
 * and that endpoint returns active requesters only.
 */
function RequesterSelector() {
  const [requesters, setRequesters] = useState<Requester[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const { selectRequester } = useRequester()
  const navigate = useNavigate()
  const location = useLocation()

  // Where the guard bounced the user away from, if anywhere.
  const from = (location.state as { from?: string } | null)?.from

  const fetchRequesters = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/requesters`)
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`)
      }
      const body = await res.json()
      setRequesters(Array.isArray(body?.data) ? body.data : [])
    } catch {
      setError('Failed to load requesters. Please try again.')
      setRequesters([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRequesters()
  }, [fetchRequesters])

  // A selection made before a refresh must not survive a list that no longer
  // contains it.
  useEffect(() => {
    if (selectedId && !requesters.some((r) => r.id === selectedId)) {
      setSelectedId('')
    }
  }, [requesters, selectedId])

  const handleContinue = () => {
    const chosen = requesters.find((r) => r.id === selectedId)
    if (!chosen) return
    selectRequester(chosen)
    navigate(from && from !== '/select-requester' ? from : '/tickets', { replace: true })
  }

  const describe = (requester: Requester) =>
    requester.department ? `${requester.name} — ${requester.department}` : requester.name

  return (
    <div className="zg-app">
      <main className="zg-center-page">
        <div className="zg-card zg-center-card">
          <h1 className="zg-title">Development Requester Selection</h1>
          <p className="zg-subtitle">
            Choose the requester whose tickets you want to work with in this session.
          </p>

          <div className="zg-callout zg-callout-warning mb-3" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>Testing mechanism only, not a real login screen.</strong>{' '}
              No password is checked and no session is created. Authentication coming in Lab 3.
            </div>
          </div>

          <div className="mb-3">
            <label className="zg-label" htmlFor="requester-select">
              Development Requester
            </label>

            {loading ? (
              <div className="zg-loading" role="status">
                <span className="zg-spinner" aria-hidden="true" />
                <span>Loading requesters...</span>
              </div>
            ) : error ? (
              <div className="zg-callout zg-callout-error" role="alert">
                <span aria-hidden="true">⚠️</span>
                <div>{error}</div>
              </div>
            ) : (
              <>
                <select
                  id="requester-select"
                  className="zg-select"
                  value={selectedId}
                  disabled={requesters.length === 0}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">Select a requester...</option>
                  {requesters.map((requester) => (
                    <option key={requester.id} value={requester.id}>
                      {describe(requester)}
                    </option>
                  ))}
                </select>
                {requesters.length === 0 && (
                  <p className="zg-subtitle mt-2 mb-0">
                    No active requesters are available. Seed the database and try again.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="zg-actions">
            {error ? (
              <button type="button" className="zg-btn zg-btn-secondary" onClick={fetchRequesters}>
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="zg-btn zg-btn-primary"
              disabled={loading || !selectedId}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default RequesterSelector
