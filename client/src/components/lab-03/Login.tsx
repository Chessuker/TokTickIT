import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { apiJson, readApiError } from '../../apiClient'
import { useAuth } from '../../context/auth'
import type { SessionUser } from '../../context/auth'
import { ROLE_HOMES, pathBelongsToRole } from '../../roles'
import PasswordField from './PasswordField'

/** How long the button stays disabled after a `429` (ui-spec.md §3.1). */
export const THROTTLE_COOLDOWN_MS = 30_000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Callout =
  | { tone: 'error'; message: string; retry?: boolean }
  | { tone: 'warning'; message: string }

/**
 * Login screen (ui-spec.md §3.1; FR-01, AC-01, AC-05 … AC-07).
 *
 * The screen never decides anything about identity: it posts the credentials
 * and hands whatever the server answers to the auth context. Where to go next
 * is the one client-side decision, and it follows the server's answer too —
 * `mustChangePassword` wins over everything else (AC-02).
 */
function Login() {
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [callout, setCallout] = useState<Callout | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // The throttled state releases the button by itself once the cooldown ends.
  useEffect(() => {
    if (cooldownUntil === null) return
    const remaining = cooldownUntil - Date.now()
    if (remaining <= 0) {
      setCooldownUntil(null)
      return
    }
    const timer = window.setTimeout(() => setCooldownUntil(null), remaining)
    return () => window.clearTimeout(timer)
  }, [cooldownUntil])

  const destinationFor = (signedIn: SessionUser): string => {
    if (signedIn.mustChangePassword) return '/change-password'
    const from = searchParams.get('from')
    if (from && from.startsWith('/') && pathBelongsToRole(from, signedIn.role)) return from
    return ROLE_HOMES[signedIn.role]
  }

  if (loading) {
    return (
      <div className="zg-loading" role="status">
        <span className="zg-spinner" aria-hidden="true" />
        Loading…
      </div>
    )
  }

  // Already signed in — including the moment right after a successful
  // submit, when `setUser` has landed but the navigate has not — so there is
  // nothing to do here but go where the user belongs (ui-spec.md §3.1). The
  // same `destinationFor` decides, so both paths agree.
  if (user) {
    return <Navigate to={destinationFor(user)} replace />
  }

  const throttled = cooldownUntil !== null

  const validate = () => {
    const errors: { email?: string; password?: string } = {}
    const trimmed = email.trim()
    if (!trimmed) errors.email = 'Email address is required.'
    else if (!EMAIL_PATTERN.test(trimmed)) errors.email = 'Enter a valid email address.'
    if (!password) errors.password = 'Password is required.'
    return errors
  }

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value)
    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }))
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }))
  }

  const submit = async () => {
    setCallout(null)
    setSubmitting(true)

    try {
      const res = await apiJson('/api/auth/login', 'POST', { email: email.trim(), password })

      if (res.ok) {
        const signedIn = (await res.json()) as SessionUser
        setUser(signedIn)
        navigate(destinationFor(signedIn), { replace: true })
        return
      }

      const error = await readApiError(res)

      if (res.status === 401) {
        setCallout({ tone: 'error', message: 'Invalid email or password. Please try again.' })
        setPassword('')
        // Focus after the state settles so the cleared field is what receives it.
        window.setTimeout(() => passwordRef.current?.focus(), 0)
        return
      }

      if (res.status === 403 && error?.code === 'ACCOUNT_INACTIVE') {
        setCallout({ tone: 'warning', message: 'This account is inactive. Please contact an administrator.' })
        return
      }

      if (res.status === 429) {
        setCallout({ tone: 'warning', message: 'Too many failed attempts. Try again in a few minutes.' })
        setCooldownUntil(Date.now() + THROTTLE_COOLDOWN_MS)
        return
      }

      if (res.status === 400 && error?.fields) {
        setFieldErrors({ email: error.fields.email, password: error.fields.password })
        return
      }

      setCallout({ tone: 'error', message: 'Something went wrong. Please try again.', retry: true })
    } catch {
      setCallout({ tone: 'error', message: 'Something went wrong. Please try again.', retry: true })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || throttled) return

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    await submit()
  }

  return (
    <main className="zg-center-page zg-auth-page">
      <div className="zg-card zg-auth-card">
        <div className="zg-auth-band">
          <i className="bi bi-clock-history" aria-hidden="true" />
          <span className="zg-auth-brand">TokTickIT</span>
        </div>

        <h1 className="zg-title">Sign in to your account</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="zg-field">
            <label htmlFor="login-email" className="zg-label">
              Email address
              <span className="zg-required" aria-hidden="true">
                {' '}
                *
              </span>
            </label>
            <input
              id="login-email"
              type="email"
              className={fieldErrors.email ? 'zg-input is-invalid' : 'zg-input'}
              value={email}
              onChange={handleEmailChange}
              autoComplete="username"
              disabled={submitting}
              required
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="zg-field-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={handlePasswordChange}
            autoComplete="current-password"
            error={fieldErrors.password}
            disabled={submitting}
            inputRef={passwordRef}
          />

          {callout && (
            <div
              className={callout.tone === 'error' ? 'zg-callout zg-callout-error' : 'zg-callout zg-callout-warning'}
              role="alert"
            >
              <span>{callout.message}</span>
              {callout.tone === 'error' && callout.retry && (
                <button type="button" className="zg-link-button" onClick={() => void submit()}>
                  Retry
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            className="zg-btn zg-btn-primary zg-btn-block"
            disabled={submitting || throttled}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <span className="zg-spinner-sm" aria-hidden="true" /> Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="zg-muted zg-auth-footnote">Contact an administrator to reset your password.</p>
      </div>
    </main>
  )
}

export default Login
