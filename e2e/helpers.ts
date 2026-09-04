import { expect, type Page } from '@playwright/test'

/**
 * Shared steps for the end-to-end suite.
 *
 * Everything here drives the real UI — selector, form, list — rather than
 * seeding through the API. The point of these tests is that the screens work
 * together, so a shortcut through the backend would hollow them out. The one
 * exception is `readRequesterId`, which reads the id the app itself stored, so
 * a test can build a URL for a ticket it is not supposed to be able to open.
 */

export const REQUESTER_A = 'Jennifer Anderson'
export const REQUESTER_B = 'Sarah Johnson'

/**
 * Chooses the option whose text contains `name`. The option label carries the
 * department as well as the name, and it is built by the app rather than fixed
 * in the seed, so the value is read off the rendered option instead of being
 * guessed from a string the test would have to keep in step.
 */
async function chooseRequester(page: Page, name: string) {
  const dropdown = page.getByLabel(/development requester/i)
  await expect(dropdown).toBeVisible()
  await expect(dropdown.locator('option')).not.toHaveCount(1)

  const value = await dropdown
    .locator('option')
    .filter({ hasText: name })
    .first()
    .getAttribute('value')

  await dropdown.selectOption(value as string)
  await page.getByRole('button', { name: /continue/i }).click()

  // The selector returns to whichever screen the switch started from, so the
  // header — not the URL — is what tells us the new requester is in force.
  await expect(page.locator('.zg-requester-name')).toContainText(name)
}

/** Picks a Development Requester and lands on My Tickets. */
export async function selectRequester(page: Page, name: string) {
  await page.goto('/select-requester')
  await chooseRequester(page, name)
}

/** Switches requester through the header control, as a user would. */
export async function changeRequester(page: Page, name: string) {
  await page.getByRole('button', { name: /change requester/i }).first().click()
  await page.waitForURL('**/select-requester')
  await chooseRequester(page, name)
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
