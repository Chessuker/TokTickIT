import { expect, test } from '@playwright/test'
import { ADMIN, IT_STAFF, REQUESTER_A, loginAs, logout, submitLogin, switchUser } from '../helpers'

/**
 * E2E-06 — Administrator user management through the real screens
 * (AC-25 … AC-30).
 *
 * Every account this suite creates is new on each run (the email carries a
 * timestamp), because users are never deleted (BR-27): a fixed address would
 * collide with the account the previous run left behind.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

const PASSWORD = 'Welcome123!'
const NEXT_PASSWORD = 'Changed123!pass'
const RESET_PASSWORD = 'Reset123!pass'

/**
 * A fresh account per run. Users are never deleted (BR-27), so every run adds
 * to the directory: a fixed name would make "Edit E2E Role Change" ambiguous
 * the second time the suite runs, and a fixed email would collide outright.
 */
function uniqueAccount(prefix: string, label: string) {
  const stamp = Date.now().toString(36)
  return { email: `${prefix}.${stamp}@kmutt.ac.th`, name: `${label} ${stamp}` }
}

test.describe('Administrator user management (E2E-06)', () => {
  test('search and filter the directory (AC-25)', async ({ page }) => {
    await loginAs(page, ADMIN)
    await expect(page).toHaveURL(/\/admin\/users$/)

    const table = page.getByTestId('user-table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Status', 'Edit'])
    // The signed-in administrator is always in the list.
    await expect(table).toContainText('(you)')

    await page.getByLabel('Search').fill('priya')
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table).toContainText('Priya Raman')

    await page.getByLabel('Search').fill('')
    await page.getByLabel('Role').selectOption('ITStaff')
    await expect(table).toContainText('Priya Raman')
    await expect(table).not.toContainText('Jennifer Anderson')
    // Both an active and an inactive member of that role are listed.
    await expect(table.getByText('Inactive').first()).toBeVisible()

    await page.getByLabel('Search').fill('nobody at all')
    await expect(page.getByTestId('no-results-state')).toContainText('No users match.')
  })

  test('create an IT Staff account; the new user is forced to change the password at first login (AC-26, AC-28)', async ({ page }) => {
    const { email, name } = uniqueAccount('e2e.newstaff', 'E2E New Staff')

    await loginAs(page, ADMIN)
    await page.getByRole('button', { name: 'Create User' }).click()

    const panel = page.getByTestId('user-panel')
    await expect(panel).toContainText('Create New User')
    await panel.getByLabel(/full name/i).fill(name)
    await panel.getByLabel(/email address/i).fill(email)
    await panel.getByLabel(/^role/i).selectOption('ITStaff')
    await panel.getByLabel(/^initial password/i).fill(PASSWORD)
    await panel.getByRole('button', { name: 'Save User' }).click()

    await expect(page.getByTestId('user-panel')).toHaveCount(0)
    await page.getByLabel('Search').fill(email)
    await expect(page.getByTestId('user-table')).toContainText(name)
    await expect(page.getByTestId('user-table')).toContainText('IT Staff')

    // A second account with the same email is refused under the Email field.
    await page.getByRole('button', { name: 'Create User' }).click()
    const duplicate = page.getByTestId('user-panel')
    await duplicate.getByLabel(/full name/i).fill(`${name} duplicate`)
    await duplicate.getByLabel(/email address/i).fill(email.toUpperCase())
    await duplicate.getByLabel(/^initial password/i).fill(PASSWORD)
    await duplicate.getByRole('button', { name: 'Save User' }).click()
    await expect(duplicate.getByRole('alert')).toContainText(/already in use/i)
    await duplicate.getByRole('button', { name: 'Cancel' }).click()

    // The new account signs in and is sent straight to Change Password (AC-02).
    await logout(page)
    await submitLogin(page, { email, password: PASSWORD })
    await expect(page).toHaveURL(/\/change-password$/)
    await expect(page.getByRole('navigation')).toHaveCount(0)

    await page.getByLabel(/^current/i).fill(PASSWORD)
    await page.getByLabel(/^new password/i).fill(NEXT_PASSWORD)
    await page.getByLabel(/^confirm new password/i).fill(NEXT_PASSWORD)
    await page.getByRole('button', { name: /continue/i }).click()

    // IT Staff land on the queue once the change is done.
    await expect(page).toHaveURL(/\/staff\/queue$/)
  })

  test('edit a role, and the guards on self and the last administrator (AC-27, AC-29)', async ({ page }) => {
    const { email, name } = uniqueAccount('e2e.rolechange', 'E2E Role Change')

    await loginAs(page, ADMIN)

    // A throwaway account to promote and demote.
    await page.getByRole('button', { name: 'Create User' }).click()
    let panel = page.getByTestId('user-panel')
    await panel.getByLabel(/full name/i).fill(name)
    await panel.getByLabel(/email address/i).fill(email)
    await panel.getByLabel(/^initial password/i).fill(PASSWORD)
    await panel.getByRole('button', { name: 'Save User' }).click()
    await expect(page.getByTestId('user-panel')).toHaveCount(0)

    await page.getByLabel('Search').fill(email)
    await page.getByRole('button', { name: `Edit ${name}` }).click()
    panel = page.getByTestId('user-panel')
    await expect(panel.getByLabel(/full name/i)).toHaveValue(name)
    await panel.getByLabel(/^role/i).selectOption('ITStaff')
    await panel.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.getByTestId('user-panel')).toHaveCount(0)
    await expect(page.getByTestId('user-table')).toContainText('IT Staff')

    // The administrator's own account: the Active toggle is disabled with the
    // reason, and the server refuses the same change if it is made directly.
    await page.getByLabel('Search').fill('admin@toktickit.xyz')
    await page.getByRole('button', { name: /^Edit System Administrator/ }).click()
    panel = page.getByTestId('user-panel')
    await expect(panel.getByLabel('Active')).toBeDisabled()
    await expect(page.getByTestId('self-deactivation-hint')).toBeVisible()
    // The only seeded Administrator is also the last one.
    await expect(panel.getByLabel(/^role/i)).toBeDisabled()
    await expect(page.getByTestId('last-admin-hint')).toBeVisible()

    const me = await page.request.get('http://localhost:5000/api/auth/me')
    const myId = (await me.json()).id
    const selfDeactivate = await page.request.patch(`http://localhost:5000/api/admin/users/${myId}`, {
      data: { isActive: false },
    })
    expect(selfDeactivate.status()).toBe(409)
    expect((await selfDeactivate.json()).error.message).toMatch(/your own account/i)

    const demoteSelf = await page.request.patch(`http://localhost:5000/api/admin/users/${myId}`, {
      data: { role: 'ITStaff' },
    })
    expect(demoteSelf.status()).toBe(409)
    expect((await demoteSelf.json()).error.message).toMatch(/at least one active administrator/i)

    // Still an Administrator, still active.
    await page.reload()
    await expect(page.getByTestId('user-table')).toContainText('Administrator')
  })

  test('deactivating a user signs them out immediately (AC-27, BR-27)', async ({ page }) => {
    const { email, name } = uniqueAccount('e2e.deactivate', 'E2E Deactivate Me')

    await loginAs(page, ADMIN)
    await page.getByRole('button', { name: 'Create User' }).click()
    const panel = page.getByTestId('user-panel')
    await panel.getByLabel(/full name/i).fill(name)
    await panel.getByLabel(/email address/i).fill(email)
    await panel.getByLabel(/^initial password/i).fill(PASSWORD)
    await panel.getByRole('button', { name: 'Save User' }).click()
    await expect(page.getByTestId('user-panel')).toHaveCount(0)

    await page.getByLabel('Search').fill(email)
    await page.getByRole('button', { name: `Edit ${name}` }).click()
    await page.getByTestId('user-panel').getByLabel('Active').selectOption('no')
    await page.getByTestId('user-panel').getByRole('button', { name: 'Save Changes' }).click()

    const dialog = page.getByRole('dialog', { name: /deactivate this user/i })
    await expect(dialog).toContainText(/signed out immediately/i)
    await dialog.getByRole('button', { name: /^confirm$/i }).click()

    await expect(page.getByTestId('user-table')).toContainText('Inactive')

    // The deactivated account can no longer sign in (BR-01, AC-06).
    await logout(page)
    await submitLogin(page, { email, password: PASSWORD })
    await expect(page.getByRole('alert')).toContainText(/this account is inactive/i)
  })

  test('setting a new initial password forces another change at the next login (AC-28)', async ({ page }) => {
    const { email, name } = uniqueAccount('e2e.resetme', 'E2E Reset Me')

    await loginAs(page, ADMIN)
    await page.getByRole('button', { name: 'Create User' }).click()
    let panel = page.getByTestId('user-panel')
    await panel.getByLabel(/full name/i).fill(name)
    await panel.getByLabel(/email address/i).fill(email)
    await panel.getByLabel(/^initial password/i).fill(PASSWORD)
    await panel.getByRole('button', { name: 'Save User' }).click()
    await expect(page.getByTestId('user-panel')).toHaveCount(0)

    // The user changes their password, so they are no longer forced.
    await logout(page)
    await submitLogin(page, { email, password: PASSWORD })
    await page.getByLabel(/^current/i).fill(PASSWORD)
    await page.getByLabel(/^new password/i).fill(NEXT_PASSWORD)
    await page.getByLabel(/^confirm new password/i).fill(NEXT_PASSWORD)
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page).toHaveURL(/\/tickets$/)

    // The administrator hands out a new initial password.
    await switchUser(page, ADMIN)
    await page.getByLabel('Search').fill(email)
    await page.getByRole('button', { name: `Edit ${name}` }).click()
    panel = page.getByTestId('user-panel')
    await panel.getByLabel(/^new initial password/i).fill(RESET_PASSWORD)
    await panel.getByRole('button', { name: 'Set Initial Password' }).click()
    await expect(panel.getByRole('status')).toContainText(/must change it at next login/i)

    // The old password no longer works; the new one forces a change.
    await logout(page)
    await submitLogin(page, { email, password: NEXT_PASSWORD })
    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i)

    await submitLogin(page, { email, password: RESET_PASSWORD })
    await expect(page).toHaveURL(/\/change-password$/)
  })

  test('a Requester and IT Staff are refused the screen and the API (AC-30)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await page.goto('/admin/users')
    await expect(page.getByRole('alert')).toContainText(/don't have access/i)
    await expect(page.getByTestId('user-table')).toHaveCount(0)

    const asRequester = await page.request.get('http://localhost:5000/api/admin/users')
    expect(asRequester.status()).toBe(403)
    expect(JSON.stringify(await asRequester.json())).not.toContain('@kmutt.ac.th')

    // The role guard renders Forbidden in place of the shell, so the profile
    // menu is only back on a screen this role may open (its "Go to your home"
    // link goes to the same place).
    await page.goto('/tickets')
    await switchUser(page, IT_STAFF)
    await page.goto('/admin/users')
    await expect(page.getByRole('alert')).toContainText(/don't have access/i)
    await expect(page.getByTestId('user-table')).toHaveCount(0)

    const asStaff = await page.request.get('http://localhost:5000/api/admin/users')
    expect(asStaff.status()).toBe(403)
    expect(JSON.stringify(await asStaff.json())).not.toContain('admin@toktickit.xyz')

    // The nav never offers the link to either role (AC-11).
    await page.goto('/staff/queue')
    await expect(page.getByRole('navigation', { name: /main/i })).not.toContainText('Users')
  })
})
