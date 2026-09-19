import { expect, type Page } from '@playwright/test'

/**
 * Shared steps for the end-to-end suite.
 *
 * Everything here drives the real UI — Login screen, form, list — rather than
 * seeding through the API or writing a cookie. The point of these tests is
 * that the screens work together, so a shortcut through the backend would
 * hollow them out (tests.md §1).
 */

export interface Account {
  name: string
  email: string
  password: string
}

/** Seeded local accounts (specification.md §7, README "Local development accounts"). */
export const REQUESTER_A: Account = { name: 'Jennifer Anderson', email: 'jennifer.anderson@kmutt.ac.th', password: 'Requester1!' }
export const REQUESTER_B: Account = { name: 'David Lee', email: 'david.lee@kmutt.ac.th', password: 'Requester2!' }
/** Still on the initial password: logging in lands on Change Password. */
export const REQUESTER_FIRST_LOGIN: Account = { name: 'Sarah Johnson', email: 'sarah.johnson@kmutt.ac.th', password: 'Welcome123!' }
export const REQUESTER_INACTIVE: Account = { name: 'Alex Smith', email: 'alex.smith@kmutt.ac.th', password: 'Welcome123!' }
export const IT_STAFF: Account = { name: 'Priya Raman', email: 'priya.raman@kmutt.ac.th', password: 'Staff1!pass' }
export const ADMIN: Account = { name: 'System Administrator', email: 'admin@toktickit.xyz', password: 'Admin1!pass' }

/** Fills the Login form and submits it; makes no assumption about where it lands. */
export async function submitLogin(page: Page, account: Pick<Account, 'email' | 'password'>) {
  await page.goto('/login')
  await page.getByLabel(/email address/i).fill(account.email)
  await page.getByLabel(/^password/i).fill(account.password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

/** Signs in through the Login screen and waits for the shell to show the user. */
export async function loginAs(page: Page, account: Account) {
  await submitLogin(page, account)
  await expect(page.locator('.zg-profile-name')).toContainText(account.name)
}

/** Logs out through the profile menu, as a user would. */
export async function logout(page: Page) {
  // The full shell hides Log out behind the profile menu; the forced
  // change-password shell shows it directly.
  const trigger = page.locator('.zg-profile-button')
  if (await trigger.count()) {
    await trigger.click()
    await page.getByRole('menuitem', { name: /log out/i }).click()
  } else {
    await page.getByRole('button', { name: /log out/i }).click()
  }
  await page.waitForURL('**/login')
}

/** Switches identity through the UI: log out, then log in as somebody else. */
export async function switchUser(page: Page, account: Account) {
  await logout(page)
  await loginAs(page, account)
}

export interface CreatedTicket {
  ticketNumber: string
  url: string
  id: string
}

/**
 * Creates a ticket through the Create Ticket screen and opens its detail page.
 * Returns the ticket number and the detail URL, which is what the ownership
 * test needs in order to try the URL as somebody else.
 */
export async function createTicket(page: Page, summary: string): Promise<CreatedTicket> {
  await page.goto('/tickets/new')

  await page.getByLabel(/summary/i).fill(summary)
  await page.getByLabel(/description/i).fill(`${summary} — raised by the end-to-end suite.`)
  await page.getByLabel(/^category/i).selectOption({ index: 1 })
  await page.getByLabel(/related system/i).selectOption({ index: 1 })
  await page.getByRole('radio', { name: 'Medium' }).check()

  await page.getByRole('button', { name: /create ticket/i }).click()

  const ticketNumber = await page.locator('.zg-ticket-number').first().innerText()

  await page.getByRole('link', { name: /view ticket/i }).click()
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}$/)

  const url = page.url()
  return { ticketNumber: ticketNumber.trim(), url, id: url.split('/').pop() as string }
}
