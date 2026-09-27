import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch, apiJson, readApiError } from '../../apiClient'
import { useAuth } from '../../context/auth'
import type { Role } from '../../context/auth'
import { PASSWORD_RULES } from '../../passwordRules'
import { ROLE_LABELS } from '../../roles'
import { useMediaQuery } from '../../useMediaQuery'
import { ActiveBadge, RoleBadge } from '../Badges'
import PasswordField from './PasswordField'

/**
 * Administrator User Management (ui-spec.md §3.6, api-spec.md §3.18 – §3.22 —
 * FR-13, BR-24 … BR-27, AC-25 … AC-30).
 *
 * Three rules shape this screen:
 *
 * 1. Nobody is ever deleted (BR-27). There is no delete control anywhere, not
 *    a disabled one; deactivation is the whole retirement story, and it says
 *    out loud that the user is signed out immediately.
 * 2. The dangerous edits are guarded twice, on purpose. The self-deactivation
 *    and last-Administrator toggles are disabled with the reason written next
 *    to them, *and* the server's `409` is shown inline if it is reached
 *    anyway (AC-29) — the disabled control is feedback, the API is the rule.
 * 3. An initial password is a one-time credential, never a password the
 *    Administrator now shares: setting one forces a change and ends the
 *    user's sessions, and the panel says so after it succeeds (AC-28).
 */

interface AdminUser {
  id: string
  name: string
  email: string
  department: string | null
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

const ROLES: Role[] = ['Requester', 'ITStaff', 'Administrator']

/** How long the search box waits after the last keystroke before re-fetching. */
export const SEARCH_DEBOUNCE_MS = 300

type Panel = { mode: 'create' } | { mode: 'edit'; user: AdminUser } | null

interface FormState {
  name: string
  email: string
  role: Role
  isActive: boolean
  initialPassword: string
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  role: 'Requester',
  isActive: true,
  initialPassword: '',
}

function UserManagement() {
  const { user: currentUser } = useAuth()
  const isMobile = useMediaQuery('(max-width: 767.98px)')

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const [panel, setPanel] = useState<Panel>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [panelError, setPanelError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetNotice, setResetNotice] = useState<string | null>(null)

  const [confirmDeactivate, setConfirmDeactivate] = useState<FormState | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // Only the newest request may write to state, so a slow answer for an old
  // filter cannot overwrite a fast one for the current search.
  const requestIdRef = useRef(0)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (roleFilter) params.set('role', roleFilter)

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setLoading(true)
    setLoadError(null)

    apiFetch(`/api/admin/users?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (requestIdRef.current !== requestId) return

        if (res.status === 403) {
          setForbidden(true)
          return
        }

        if (!res.ok) {
          setUsers([])
          setLoadError(body?.error?.message ?? 'The user list could not be loaded.')
          return
        }

        setUsers(Array.isArray(body?.data) ? body.data : [])
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setUsers([])
        setLoadError('Could not reach the server. Please check your connection and try again.')
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false)
      })
  }, [search, roleFilter, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  /**
   * How many active Administrators the list currently shows. Used only to
   * disable the toggle with a reason; the count the server trusts is its own
   * (BR-26), and a filtered list is deliberately not treated as authoritative.
   */
  const activeAdministrators = useMemo(
    () => users.filter((user) => user.role === 'Administrator' && user.isActive).length,
    [users],
  )

  const openCreate = () => {
    setPanel({ mode: 'create' })
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setPanelError(null)
    setNotice(null)
    setResetNotice(null)
  }

  const openEdit = (user: AdminUser) => {
    setPanel({ mode: 'edit', user })
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      initialPassword: '',
    })
    setFieldErrors({})
    setPanelError(null)
    setNotice(null)
    setResetPassword('')
    setResetError(null)
    setResetNotice(null)
  }

  const closePanel = () => {
    setPanel(null)
    setConfirmDeactivate(null)
    setFieldErrors({})
    setPanelError(null)
  }

  /** Reports a failed save against the field the server named, or the panel. */
  const reportFailure = async (res: Response, fallback: string) => {
    const error = await readApiError(res)
    if (error?.fields) {
      setFieldErrors(error.fields)
      // A 409 on email carries both a field and a message; the field wins.
      if (!error.fields.email && error.message) setPanelError(error.message)
    } else {
      setPanelError(error?.message ?? fallback)
    }
  }

  const createUser = async (values: FormState) => {
    setSaving(true)
    setFieldErrors({})
    setPanelError(null)

    try {
      const res = await apiJson('/api/admin/users', 'POST', {
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        isActive: values.isActive,
        initialPassword: values.initialPassword,
      })

      if (res.status === 201) {
        const created = (await res.json()) as AdminUser
        closePanel()
        setNotice(`${created.name} was created. They must change their password at first login.`)
        reload()
        return
      }

      await reportFailure(res, 'The user could not be created.')
    } catch {
      setPanelError('Could not reach the server. The user was not created.')
    } finally {
      setSaving(false)
    }
  }

  const saveUser = async (values: FormState) => {
    if (!panel || panel.mode !== 'edit') return

    setSaving(true)
    setFieldErrors({})
    setPanelError(null)

    try {
      const res = await apiJson(`/api/admin/users/${panel.user.id}`, 'PATCH', {
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        isActive: values.isActive,
      })

      if (res.ok) {
        const updated = (await res.json()) as AdminUser
        setConfirmDeactivate(null)
        closePanel()
        setNotice(`${updated.name} was updated.`)
        reload()
        return
      }

      setConfirmDeactivate(null)
      await reportFailure(res, 'The changes could not be saved.')
    } catch {
      setConfirmDeactivate(null)
      setPanelError('Could not reach the server. The changes were not saved.')
    } finally {
      setSaving(false)
    }
  }

  const submitPanel = (event: FormEvent) => {
    event.preventDefault()
    if (!panel) return

    if (panel.mode === 'create') {
      void createUser(form)
      return
    }

    // Turning the toggle off is the one edit that signs somebody out, so it
    // is confirmed before it is sent (ui-spec.md §3.6).
    if (panel.user.isActive && !form.isActive) {
      setConfirmDeactivate(form)
      return
    }

    void saveUser(form)
  }

  const setInitialPassword = async () => {
    if (!panel || panel.mode !== 'edit') return

    setResetting(true)
    setResetError(null)
    setResetNotice(null)

    try {
      const res = await apiJson(
        `/api/admin/users/${panel.user.id}/initial-password`,
        'POST',
        { initialPassword: resetPassword },
      )

      if (res.ok) {
        setResetPassword('')
        setResetNotice('Password set — the user must change it at next login.')
        reload()
        return
      }

      const error = await readApiError(res)
      setResetError(error?.fields?.initialPassword ?? error?.message ?? 'The password could not be set.')
    } catch {
      setResetError('Could not reach the server. The password was not set.')
    } finally {
      setResetting(false)
    }
  }

  if (forbidden) {
    return (
      <section className="zg-state zg-state-denied" role="alert" data-testid="users-forbidden">
        <span className="zg-state-icon" aria-hidden="true">
          <i className="bi bi-lock-fill" />
        </span>
        <h1 className="zg-state-title">You don&apos;t have access to this page</h1>
        <p className="zg-state-text">User management is available to administrators only.</p>
      </section>
    )
  }

  const editing = panel?.mode === 'edit' ? panel.user : null
  const isSelf = editing?.id === currentUser?.id
  // BR-26, as far as this screen can tell: the server counts for real.
  const isLastAdministrator =
    editing?.role === 'Administrator' && editing.isActive && activeAdministrators <= 1

  const hasFilters = Boolean(search || roleFilter)

  return (
    <section className="zg-users">
      <div className="zg-page-head">
        <div>
          <h1 className="zg-title">Users</h1>
          <p className="zg-subtitle mb-0">Accounts, roles and access for the whole system.</p>
        </div>
        <div className="zg-page-head-actions">
          <button type="button" className="zg-btn zg-btn-primary" onClick={openCreate}>
            Create User
          </button>
        </div>
      </div>

      {notice && (
        <div className="zg-callout zg-callout-success mb-3" role="status">
          {notice}
        </div>
      )}

      <div className="zg-filter-bar" role="search">
        <div className="zg-filter zg-filter-search">
          <label className="zg-label" htmlFor="user-search">
            Search
          </label>
          <input
            id="user-search"
            type="search"
            className="zg-input"
            placeholder="Name or email"
            value={searchInput}
            maxLength={150}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="zg-filter">
          <label className="zg-label" htmlFor="user-role">
            Role
          </label>
          <select
            id="user-role"
            className="zg-select"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Two columns only while the panel is open; the list owns the width otherwise. */}
      <div className={panel ? 'zg-users-layout has-panel' : 'zg-users-layout'}>
        <div className="zg-users-list">
          {loadError && (
            <div className="zg-callout zg-callout-error mb-3" role="alert">
              <span aria-hidden="true">⚠️</span>
              <div>
                {loadError}{' '}
                <button type="button" className="zg-link-button" onClick={reload}>
                  Retry
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="zg-loading" role="status">
              <span className="zg-spinner" aria-hidden="true" />
              Loading users...
            </div>
          )}

          {/*
           * There is no empty state: the signed-in Administrator is always in
           * the directory, so zero rows can only mean the filters matched
           * nothing (ui-spec.md §3.6 "States").
           */}
          {!loading && !loadError && users.length === 0 && (
            <div className="zg-state zg-state-no-results" data-testid="no-results-state" role="status">
              <span className="zg-state-icon" aria-hidden="true">
                <i className="bi bi-search" />
              </span>
              <h2 className="zg-state-title">No users match.</h2>
              {hasFilters && (
                <button
                  type="button"
                  className="zg-btn zg-btn-secondary"
                  onClick={() => {
                    setSearchInput('')
                    setRoleFilter('')
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!loading && !loadError && users.length > 0 && (
            isMobile ? (
              <ul className="zg-user-cards" data-testid="user-cards">
                {users.map((user) => (
                  <li key={user.id} className="zg-user-card">
                    <div className="zg-user-card-top">
                      <span className="zg-user-name">
                        {user.name}
                        {user.id === currentUser?.id && <span className="zg-muted"> (you)</span>}
                      </span>
                      <ActiveBadge active={user.isActive} />
                    </div>
                    <p className="zg-user-email">{user.email}</p>
                    <div className="zg-user-card-foot">
                      <RoleBadge role={user.role} />
                      <button
                        type="button"
                        className="zg-btn zg-btn-secondary zg-btn-sm"
                        onClick={() => openEdit(user)}
                        aria-label={`Edit ${user.name}`}
                      >
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="zg-table-wrap">
                <table className="zg-table zg-users-table" data-testid="user-table">
                  <caption className="visually-hidden">All user accounts</caption>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '9%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="visually-hidden">Edit</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          {user.name}
                          {user.id === currentUser?.id && <span className="zg-muted"> (you)</span>}
                        </td>
                        <td>{user.email}</td>
                        <td className="zg-cell-tight">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="zg-cell-tight">
                          <ActiveBadge active={user.isActive} />
                        </td>
                        <td className="zg-cell-tight">
                          <button
                            type="button"
                            className="zg-btn zg-btn-secondary zg-btn-sm"
                            onClick={() => openEdit(user)}
                            aria-label={`Edit ${user.name}`}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {panel && (
          <aside className="zg-users-panel" aria-labelledby="user-panel-title" data-testid="user-panel">
            <form onSubmit={submitPanel} noValidate>
              <h2 className="zg-section-title" id="user-panel-title">
                {panel.mode === 'create' ? 'Create New User' : 'Edit User'}
              </h2>

              {panelError && (
                <div className="zg-callout zg-callout-error mb-3" role="alert">
                  <span aria-hidden="true">⚠️</span>
                  <div>{panelError}</div>
                </div>
              )}

              <div className="zg-field">
                <label className="zg-label" htmlFor="user-name">
                  Full Name
                  <span className="zg-required" aria-hidden="true"> *</span>
                </label>
                <input
                  id="user-name"
                  className={fieldErrors.name ? 'zg-input is-invalid' : 'zg-input'}
                  value={form.name}
                  maxLength={100}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.name)}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
                {fieldErrors.name && (
                  <p className="zg-field-error" role="alert">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="user-email">
                  Email Address
                  <span className="zg-required" aria-hidden="true"> *</span>
                </label>
                <input
                  id="user-email"
                  type="email"
                  className={fieldErrors.email ? 'zg-input is-invalid' : 'zg-input'}
                  value={form.email}
                  maxLength={254}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.email)}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
                {fieldErrors.email && (
                  <p className="zg-field-error" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="user-role-select">
                  Role
                  <span className="zg-required" aria-hidden="true"> *</span>
                </label>
                <select
                  id="user-role-select"
                  className={fieldErrors.role ? 'zg-select is-invalid' : 'zg-select'}
                  value={form.role}
                  disabled={saving || isLastAdministrator}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value as Role }))
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {fieldErrors.role && (
                  <p className="zg-field-error" role="alert">
                    {fieldErrors.role}
                  </p>
                )}
              </div>

              <div className="zg-field">
                <label className="zg-label" htmlFor="user-active">
                  Active
                </label>
                <select
                  id="user-active"
                  className="zg-select"
                  value={form.isActive ? 'yes' : 'no'}
                  disabled={saving || isSelf || isLastAdministrator}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isActive: event.target.value === 'yes' }))
                  }
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                {/*
                 * The reason is written beside the disabled control rather
                 * than left to a failed save (AC-29); the server still
                 * answers 409 if the request is made anyway.
                 */}
                {isSelf && (
                  <p className="zg-hint" data-testid="self-deactivation-hint">
                    You cannot deactivate your own account.
                  </p>
                )}
                {isLastAdministrator && (
                  <p className="zg-hint" data-testid="last-admin-hint">
                    At least one active administrator is required.
                  </p>
                )}
                {fieldErrors.isActive && (
                  <p className="zg-field-error" role="alert">
                    {fieldErrors.isActive}
                  </p>
                )}
              </div>

              {panel.mode === 'create' && (
                <>
                  <PasswordField
                    id="user-initial-password"
                    label="Initial Password"
                    value={form.initialPassword}
                    autoComplete="new-password"
                    error={fieldErrors.initialPassword}
                    disabled={saving}
                    describedBy="create-password-rules"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, initialPassword: event.target.value }))
                    }
                  />
                  <ul
                    id="create-password-rules"
                    className="zg-rules-panel"
                    aria-live="polite"
                    aria-label="Password rules"
                  >
                    {PASSWORD_RULES.map((rule) => {
                      const met = form.initialPassword.length > 0 && rule.test(form.initialPassword)
                      return (
                        <li key={rule.id} className={met ? 'zg-rule is-met' : 'zg-rule'}>
                          <i className={met ? 'bi bi-check-circle-fill' : 'bi bi-circle'} aria-hidden="true" />
                          <span>{rule.label}</span>
                          <span className="visually-hidden">{met ? ' (met)' : ' (not met)'}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              <div className="zg-actions">
                <button type="submit" className="zg-btn zg-btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                    </>
                  ) : panel.mode === 'create' ? (
                    'Save User'
                  ) : (
                    'Save Changes'
                  )}
                </button>
                <button
                  type="button"
                  className="zg-btn zg-btn-secondary"
                  onClick={closePanel}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>

            {panel.mode === 'edit' && (
              <div className="zg-panel-section">
                <h3 className="zg-subsection-title">Set new initial password</h3>
                <p className="zg-hint">
                  The user is signed out everywhere and must change this password at their next
                  login.
                </p>

                {resetNotice && (
                  <div className="zg-callout zg-callout-success mb-3" role="status">
                    {resetNotice}
                  </div>
                )}

                <PasswordField
                  id="user-reset-password"
                  label="New initial password"
                  value={resetPassword}
                  autoComplete="new-password"
                  error={resetError ?? undefined}
                  disabled={resetting}
                  onChange={(event) => setResetPassword(event.target.value)}
                />

                <button
                  type="button"
                  className="zg-btn zg-btn-outline"
                  onClick={() => void setInitialPassword()}
                  disabled={resetting || resetPassword.length === 0}
                >
                  {resetting ? (
                    <>
                      <span className="zg-spinner-sm" aria-hidden="true" /> Setting...
                    </>
                  ) : (
                    'Set Initial Password'
                  )}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {confirmDeactivate && (
        <div className="zg-modal-backdrop" role="presentation">
          <div className="zg-modal" role="dialog" aria-modal="true" aria-labelledby="deactivate-title">
            <h2 className="zg-section-title" id="deactivate-title">
              Deactivate this user?
            </h2>
            <p className="zg-hint">They will be signed out immediately.</p>

            <div className="zg-actions">
              <button
                type="button"
                className="zg-btn zg-btn-danger"
                onClick={() => void saveUser(confirmDeactivate)}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="zg-spinner-sm" aria-hidden="true" /> Saving...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
              <button
                type="button"
                className="zg-btn zg-btn-secondary"
                onClick={() => setConfirmDeactivate(null)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default UserManagement
