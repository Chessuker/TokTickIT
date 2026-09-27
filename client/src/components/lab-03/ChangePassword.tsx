import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson, readApiError } from '../../apiClient'
import { useAuth } from '../../context/auth'
import type { SessionUser } from '../../context/auth'
import { PASSWORD_RULES, passwordSatisfiesRules } from '../../passwordRules'
import { ROLE_HOMES } from '../../roles'
import PasswordField from './PasswordField'

interface Fields {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type FieldErrors = Partial<Record<keyof Fields, string>>

const EMPTY: Fields = { currentPassword: '', newPassword: '', confirmPassword: '' }

/**
 * Change Password screen (ui-spec.md §3.2; FR-02, AC-02, AC-09, AC-10).
 *
 * Two modes, decided by the server's `mustChangePassword` flag rather than by
 * how the user got here: *forced* (the only screen reachable until a new
 * password is saved) and *voluntary* (opened from the profile menu). The form
 * is the same; what differs is the wording, the Cancel action and where
 * success leads.
 */
function ChangePassword() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()

  const [fields, setFields] = useState<Fields>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const forced = user?.mustChangePassword ?? false

  const update = (key: keyof Fields) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setFields((current) => ({ ...current, [key]: value }))
    if (fieldErrors[key]) setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setSaved(false)
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!fields.currentPassword) errors.currentPassword = 'Current password is required.'

    if (!fields.newPassword) errors.newPassword = 'New password is required.'
    else if (!passwordSatisfiesRules(fields.newPassword)) errors.newPassword = 'New password does not meet the rules below.'
    else if (fields.newPassword === fields.currentPassword)
      errors.newPassword = 'New password must differ from the current password.'

    if (!fields.confirmPassword) errors.confirmPassword = 'Please confirm the new password.'
    else if (fields.confirmPassword !== fields.newPassword) errors.confirmPassword = 'Passwords do not match.'

    return errors
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setFormError(null)
    setSaved(false)

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const res = await apiJson('/api/auth/change-password', 'POST', fields)

      if (res.ok) {
        const updated = (await res.json()) as SessionUser
        setUser(updated)
        if (forced) {
          navigate(ROLE_HOMES[updated.role], { replace: true })
          return
        }
        setFields(EMPTY)
        setSaved(true)
        return
      }

      const error = await readApiError(res)

      if (res.status === 400 && error?.fields) {
        setFieldErrors({
          currentPassword: error.fields.currentPassword,
          newPassword: error.fields.newPassword,
          confirmPassword: error.fields.confirmPassword,
        })
        return
      }

      if (res.status === 401) {
        // The session died underneath us; the guard sends the user to Login.
        setUser(null)
        return
      }

      setFormError('Something went wrong. Please try again.')
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="zg-center-page zg-auth-page">
      <div className="zg-card zg-auth-card">
        <div className="zg-auth-band">
          <i className="bi bi-shield-lock" aria-hidden="true" />
          <span className="zg-auth-brand">TokTickIT</span>
        </div>

        <h1 className="zg-title">Change Your Password</h1>
        <p className="zg-subtitle">
          {forced ? 'You must change your password to continue.' : 'Choose a new password.'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <PasswordField
            id="current-password"
            label={forced ? 'Current (temporary) password' : 'Current password'}
            value={fields.currentPassword}
            onChange={update('currentPassword')}
            autoComplete="current-password"
            error={fieldErrors.currentPassword}
            disabled={submitting}
          />

          <PasswordField
            id="new-password"
            label="New password"
            value={fields.newPassword}
            onChange={update('newPassword')}
            autoComplete="new-password"
            error={fieldErrors.newPassword}
            disabled={submitting}
            describedBy="password-rules"
          />

          <ul id="password-rules" className="zg-rules-panel" aria-live="polite" aria-label="Password rules">
            {PASSWORD_RULES.map((rule) => {
              const met = fields.newPassword.length > 0 && rule.test(fields.newPassword)
              return (
                <li key={rule.id} className={met ? 'zg-rule is-met' : 'zg-rule'}>
                  <i className={met ? 'bi bi-check-circle-fill' : 'bi bi-circle'} aria-hidden="true" />
                  <span>{rule.label}</span>
                  <span className="visually-hidden">{met ? ' (met)' : ' (not met)'}</span>
                </li>
              )
            })}
          </ul>

          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={fields.confirmPassword}
            onChange={update('confirmPassword')}
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
            disabled={submitting}
          />

          {formError && (
            <div className="zg-callout zg-callout-error" role="alert">
              <span>{formError}</span>
            </div>
          )}

          {saved && (
            <div className="zg-callout zg-callout-success" role="status">
              <span>Your password has been changed.</span>
            </div>
          )}

          <div className="zg-form-actions">
            <button type="submit" className="zg-btn zg-btn-primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? (
                <>
                  <span className="zg-spinner-sm" aria-hidden="true" /> Saving…
                </>
              ) : forced ? (
                'Continue'
              ) : (
                'Save password'
              )}
            </button>
            {!forced && (
              <button type="button" className="zg-btn zg-btn-secondary" onClick={() => navigate(-1)} disabled={submitting}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default ChangePassword
