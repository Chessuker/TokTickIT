import { useState } from 'react'
import type { ChangeEvent, Ref } from 'react'

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string
  disabled?: boolean
  required?: boolean
  inputRef?: Ref<HTMLInputElement>
  describedBy?: string
}

/**
 * A password input with the show/hide toggle every Lab 3 password field
 * carries (ui-spec.md §3.1, §3.2). The toggle is a real button with
 * `aria-pressed`, so a screen reader announces its state, and it never
 * submits the form.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  disabled = false,
  required = true,
  inputRef,
  describedBy,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  const described = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(' ') || undefined

  return (
    <div className="zg-field">
      <label htmlFor={id} className="zg-label">
        {label}
        {required && (
          <span className="zg-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <div className="zg-password-wrap">
        <input
          id={id}
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          className={error ? 'zg-input is-invalid' : 'zg-input'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
        />
        <button
          type="button"
          className="zg-password-toggle"
          aria-pressed={visible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
        >
          <i className={visible ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p id={errorId} className="zg-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default PasswordField
