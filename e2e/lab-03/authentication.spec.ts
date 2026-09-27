import { expect, test } from '@playwright/test'
import {
  ADMIN,
  IT_STAFF,
  REQUESTER_A,
  REQUESTER_FIRST_LOGIN,
  REQUESTER_INACTIVE,
  loginAs,
  logout,
  submitLogin,
} from '../helpers'

/**
 * E2E-01, E2E-02, E2E-03 and MIG-02 — authentication through the real screens
 * (AC-01, AC-02, AC-05, AC-06, AC-08, AC-11, AC-12, AC-31).
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`. E2E-02 changes
 * Sarah's password; re-run the seed to reset her before running the suite
 * again (the seed restores every local account, tests.md §1).
 */

test.describe('Login, shell and logout (E2E-01)', () => {
  test('an unknown email and a wrong password show the same generic message', async ({ page }) => {
    // A fresh unknown email each run: failures for an email that never logs
    // in successfully are never reset, so a fixed one would trip BR-07's
    // throttle after five runs inside fifteen minutes.
    await submitLogin(page, { email: `nobody-${Date.now()}@kmutt.ac.th`, password: 'Whatever1!' })
    await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i)

    await submitLogin(page, { email: REQUESTER_A.email, password: 'WrongPassword1!' })
    await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i)
    // The password is cleared, the email kept (ui-spec.md §3.1).
    await expect(page.getByLabel(/^password/i)).toHaveValue('')
    await expect(page.getByLabel(/email address/i)).toHaveValue(REQUESTER_A.email)
  })

  test('an inactive account with the right password is told it is inactive', async ({ page }) => {
    await submitLogin(page, REQUESTER_INACTIVE)

    await expect(page.getByRole('alert')).toHaveText(/this account is inactive/i)
    await expect(page).toHaveURL(/\/login/)
  })

  test('a valid login shows the name and role in the shell and lands on My Tickets', async ({ page }) => {
    await loginAs(page, REQUESTER_A)

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('banner')).toContainText(REQUESTER_A.name)
    await expect(page.getByRole('banner')).toContainText('Requester')
    await expect(page.getByRole('navigation', { name: /main/i })).toContainText('My Tickets')
    // The Lab 2 Development Requester block is gone (FR-05).
    await expect(page.getByRole('button', { name: /change requester/i })).toHaveCount(0)
  })

  test('the session survives a reload', async ({ page }) => {
    await loginAs(page, REQUESTER_A)

    await page.reload()

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.locator('.zg-profile-name')).toContainText(REQUESTER_A.name)
  })

  test('visiting /login while signed in goes straight to the role home', async ({ page }) => {
    await loginAs(page, REQUESTER_A)

    await page.goto('/login')

    await expect(page).toHaveURL(/\/tickets$/)
  })

  test('logout ends the session: Back and direct URLs both land on Login', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await page.goto('/tickets/new')
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible()

    await logout(page)
    await expect(page).toHaveURL(/\/login$/)

    // The browser Back button re-runs the guard (a full reload here, since the
    // previous entry is another document), which asks /api/auth/me and is
    // told 401: the protected page never renders.
    await page.goBack()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /my tickets/i })).toHaveCount(0)

    // Direct URLs refuse too and offer the return path.

    for (const path of ['/tickets', '/tickets/new', '/change-password']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`/login\\?from=${encodeURIComponent(path)}`))
      await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible()
    }

    // And the API itself refuses the dead cookie (AC-08).
    const me = await page.request.get('http://localhost:5000/api/auth/me')
    expect(me.status()).toBe(401)
  })

  test('an anonymous visitor is sent to Login and returned after signing in', async ({ page }) => {
    await page.goto('/tickets/new')
    await expect(page).toHaveURL(/\/login\?from=%2Ftickets%2Fnew/)

    await page.getByLabel(/email address/i).fill(REQUESTER_A.email)
    await page.getByLabel(/^password/i).fill(REQUESTER_A.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/tickets\/new$/)
    await expect(page.getByRole('heading', { name: /create ticket/i })).toBeVisible()
  })
})

test.describe('Initial password change (E2E-02, MIG-02)', () => {
  test('a first login is forced through Change Password before the app opens', async ({ page }) => {
    await submitLogin(page, REQUESTER_FIRST_LOGIN)

    await expect(page).toHaveURL(/\/change-password$/)
    await expect(page.getByText(/you must change your password to continue/i)).toBeVisible()
    // Nothing else is reachable while the change is pending (AC-02).
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await page.goto('/tickets')
    await expect(page).toHaveURL(/\/change-password$/)
    const refused = await page.request.get('http://localhost:5000/api/tickets')
    expect(refused.status()).toBe(403)
    expect((await refused.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED')

    // A weak or mismatched password is refused with field errors (AC-09).
    await page.getByLabel(/^current/i).fill(REQUESTER_FIRST_LOGIN.password)
    await page.getByLabel(/^new password/i).fill('weak')
    await page.getByLabel(/^confirm new password/i).fill('weak2')
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByLabel(/^new password/i)).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel(/^confirm new password/i)).toHaveAttribute('aria-invalid', 'true')

    // A valid change opens the normal app (AC-10).
    const newPassword = `Changed${Date.now() % 100000}!a`
    await page.getByLabel(/^new password/i).fill(newPassword)
    await page.getByLabel(/^confirm new password/i).fill(newPassword)
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.locator('.zg-profile-name')).toContainText(REQUESTER_FIRST_LOGIN.name)
    await expect(page.getByRole('navigation', { name: /main/i })).toBeVisible()

    // The new password works on a fresh login and is no longer forced.
    await logout(page)
    await submitLogin(page, { email: REQUESTER_FIRST_LOGIN.email, password: newPassword })
    await expect(page).toHaveURL(/\/tickets$/)
  })
})

test.describe('Role navigation and forbidden pages (E2E-03)', () => {
  test('a Requester sees only Requester links and is refused the staff and admin areas', async ({ page }) => {
    await loginAs(page, REQUESTER_A)

    const nav = page.getByRole('navigation', { name: /main/i })
    await expect(nav.getByRole('link')).toHaveText(['My Tickets', 'Create Ticket'])

    for (const path of ['/staff/queue', '/admin/users']) {
      await page.goto(path)
      await expect(page.getByRole('alert')).toContainText(/you don't have access to this page/i)
    }

    // Direct fetch from the page as a Requester: the guard is the server's (AC-12).
    const status = await page.evaluate(async () => {
      const res = await fetch('http://localhost:5000/api/tickets/00000000-0000-4000-8000-000000000000', {
        credentials: 'include',
      })
      return res.status
    })
    expect(status).toBe(404)
  })

  test('IT Staff land on the queue, see the Queue link, and are refused /admin/users', async ({ page }) => {
    await loginAs(page, IT_STAFF)

    await expect(page).toHaveURL(/\/staff\/queue$/)
    await expect(page.getByRole('navigation', { name: /main/i }).getByRole('link')).toHaveText(['Queue'])
    await expect(page.getByRole('banner')).toContainText('IT Staff')

    await page.goto('/admin/users')
    await expect(page.getByRole('alert')).toContainText(/you don't have access to this page/i)

    await page.goto('/tickets')
    await expect(page.getByRole('alert')).toContainText(/you don't have access to this page/i)
    const refused = await page.request.post('http://localhost:5000/api/tickets', { data: {} })
    expect(refused.status()).toBe(403)
  })

  test('an Administrator lands on Users and sees Users and Queue', async ({ page }) => {
    await loginAs(page, ADMIN)

    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect(page.getByRole('navigation', { name: /main/i }).getByRole('link')).toHaveText(['Users', 'Queue'])
    await expect(page.getByRole('banner')).toContainText('Administrator')
  })
})
