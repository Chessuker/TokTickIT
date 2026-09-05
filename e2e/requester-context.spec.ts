import { expect, test } from '@playwright/test'
import { changeRequester, REQUESTER_A, REQUESTER_B, selectRequester } from './helpers'

/**
 * E2E-04 — the requester guard and the requester switch (AC-02, FR-06, BR-13).
 *
 * Two halves. First, that no application screen can be reached without a
 * selected requester. Second, that switching requester genuinely replaces the
 * visible data rather than leaving the previous requester's rows on screen.
 */

const A_ONLY_SUMMARY = 'E2E context — only Jennifer should see this'

test.describe('Requester guard (E2E-04, AC-02)', () => {
  for (const path of ['/tickets', '/tickets/new', '/system']) {
    test(`opening ${path} with no requester redirects to the selector`, async ({ page }) => {
      await page.goto(path)

      await page.waitForURL('**/select-requester')
      await expect(page.getByLabel(/development requester/i)).toBeVisible()
    })
  }

  test('the selector says plainly that it is not a real login', async ({ page }) => {
    await page.goto('/select-requester')

    await expect(page.getByText(/not a real login/i)).toBeVisible()
    // Continue stays disabled until something is actually chosen.
    await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  test('the selection survives a reload', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)

    await page.reload()

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.locator('.zg-requester-name')).toContainText(REQUESTER_A)
  })
})

test.describe('Change Requester (E2E-04, FR-06, BR-13)', () => {
  test('switching requester swaps the visible ticket set', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)

    // A ticket that only Requester A owns, so its absence after the switch is
    // meaningful rather than a coincidence of paging.
    await page.goto('/tickets/new')
    await page.getByLabel(/summary/i).fill(A_ONLY_SUMMARY)
    await page.getByLabel(/description/i).fill('Created by the requester-context end-to-end test.')
    await page.getByLabel(/^category/i).selectOption({ index: 1 })
    await page.getByLabel(/related system/i).selectOption({ index: 1 })
    await page.getByRole('radio', { name: 'Low' }).check()
    await page.getByRole('button', { name: /^create ticket$/i }).click()

    const ticketNumber = (await page.locator('.zg-ticket-number').first().innerText()).trim()

    await page.getByRole('link', { name: /go to my tickets/i }).click()
    await page.waitForURL('**/tickets')
    await page.getByLabel(/^search$/i).fill(ticketNumber)
    await expect(page.getByText(ticketNumber).first()).toBeVisible()

    // --- Switch to Requester B --------------------------------------------
    await changeRequester(page, REQUESTER_B)
    await expect(page.locator('.zg-requester-name')).toContainText(REQUESTER_B)

    // The search box is cleared by the remount, so search again as B.
    await page.getByLabel(/^search$/i).fill(ticketNumber)
    await expect(page.getByText(ticketNumber)).toHaveCount(0)
    await expect(page.getByText(A_ONLY_SUMMARY)).toHaveCount(0)
    await expect(page.getByTestId('no-results-state')).toBeVisible()

    // --- And back ----------------------------------------------------------
    await changeRequester(page, REQUESTER_A)
    await page.getByLabel(/^search$/i).fill(ticketNumber)
    await expect(page.getByText(ticketNumber).first()).toBeVisible()
  })

  test('the header shows the selected requester on every screen', async ({ page }) => {
    await selectRequester(page, REQUESTER_B)

    for (const path of ['/tickets', '/tickets/new', '/system']) {
      await page.goto(path)
      await expect(page.locator('.zg-requester-name')).toContainText(REQUESTER_B)
      await expect(page.getByRole('button', { name: /change requester/i }).first()).toBeVisible()
    }
  })
})
