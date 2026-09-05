import { expect, test } from '@playwright/test'
import { REQUESTER_A, selectRequester } from './helpers'

/**
 * E2E-01 — the full create flow (AC-01, AC-05).
 *
 * Select a requester, fill the form, submit, read the generated ticket number
 * off the confirmation, then open the detail screen and find the same ticket
 * with the same values. The number is the thread through the whole test: it is
 * assigned by the server, so asserting that the same one appears on three
 * different screens is what proves the ticket was really persisted.
 */

const SUMMARY = 'E2E create flow — projector will not detect the laptop'
const DESCRIPTION =
  'The projector in room CB2-401 shows "no signal" with every cable, on two different laptops.'

test.describe('Create ticket (E2E-01)', () => {
  test('create a ticket, then open it and find the same data', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)

    await page.goto('/tickets/new')
    await page.getByLabel(/summary/i).fill(SUMMARY)
    await page.getByLabel(/description/i).fill(DESCRIPTION)
    await page.getByLabel(/^category/i).selectOption({ label: 'Hardware' })
    await page.getByLabel(/related system/i).selectOption({ label: 'Corporate Laptop' })
    await page.getByRole('radio', { name: 'High' }).check()

    await page.getByRole('button', { name: /^create ticket$/i }).click()

    // --- Confirmation ------------------------------------------------------
    const confirmation = page.getByText(/ticket created/i)
    await expect(confirmation).toBeVisible()

    const ticketNumber = (await page.locator('.zg-ticket-number').first().innerText()).trim()
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)

    // --- Detail screen -----------------------------------------------------
    await page.getByRole('link', { name: /view ticket/i }).click()
    await page.waitForURL(/\/tickets\/[0-9a-f-]{36}$/)

    const fields = page.getByTestId('ticket-fields')
    await expect(fields).toBeVisible()
    await expect(fields.getByText(ticketNumber)).toBeVisible()
    await expect(fields.getByText(SUMMARY)).toBeVisible()
    await expect(fields.getByText(DESCRIPTION)).toBeVisible()
    await expect(fields.getByText('Hardware')).toBeVisible()
    await expect(fields.getByText('Corporate Laptop')).toBeVisible()

    // Status and priority are server-owned: `New` is never sent by the form.
    await expect(fields.getByText('New', { exact: true })).toBeVisible()
    await expect(fields.getByText('High', { exact: true }).first()).toBeVisible()

    // AC-05 — the detail screen has no way to edit any of it.
    await expect(fields.locator('input, textarea, select')).toHaveCount(0)
  })

  test('the new ticket appears in My Tickets under its number', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)

    await page.goto('/tickets/new')
    await page.getByLabel(/summary/i).fill('E2E listed after create')
    await page.getByLabel(/description/i).fill('Raised to prove the list picks up a new ticket.')
    await page.getByLabel(/^category/i).selectOption({ index: 1 })
    await page.getByLabel(/related system/i).selectOption({ index: 1 })
    await page.getByRole('radio', { name: 'Medium' }).check()
    await page.getByRole('button', { name: /^create ticket$/i }).click()

    const ticketNumber = (await page.locator('.zg-ticket-number').first().innerText()).trim()

    await page.getByRole('link', { name: /go to my tickets/i }).click()
    await page.waitForURL('**/tickets')

    // Search by the number rather than trusting it to be on page one.
    await page.getByLabel(/^search$/i).fill(ticketNumber)
    await expect(page.getByText(ticketNumber).first()).toBeVisible()
    await expect(page.getByText('E2E listed after create').first()).toBeVisible()
  })

  test('an invalid form is refused with errors under the offending fields', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)
    await page.goto('/tickets/new')

    // Submitted empty: every required field should name its own problem, and
    // nothing should be created.
    await page.getByRole('button', { name: /^create ticket$/i }).click()

    await expect(page.getByText(/ticket created/i)).toHaveCount(0)
    await expect(page.locator('.zg-field-error')).not.toHaveCount(0)
    await expect(page).toHaveURL(/\/tickets\/new$/)
  })
})
