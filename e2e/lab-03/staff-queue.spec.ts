import { expect, test } from '@playwright/test'
import { ADMIN, IT_STAFF, REQUESTER_A, loginAs } from '../helpers'

/**
 * E2E-05 (queue half) — the IT Staff Ticket Queue on the seeded database
 * (AC-16, AC-17, AC-33): search, filters, sort and pagination all round-trip
 * through the real API. The claim → status → comment → note journey that
 * completes E2E-05 lands with the staff detail screen (#40).
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`. The seeded
 * tickets are `TKT-2026-9000xx`; the search below scopes every assertion to
 * them so tickets created by other suites do not change the counts.
 */

const SEEDED = 'TKT-2026-9000'

test.describe('IT Staff Ticket Queue (E2E-05, AC-16, AC-17)', () => {
  test('lists tickets of every requester with the nine columns and pages them', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await expect(page).toHaveURL(/\/staff\/queue$/)

    await page.getByLabel('Search').fill(SEEDED)
    await expect(page.getByText('Showing 1 to 10 of 24 tickets')).toBeVisible()

    const headers = page.getByTestId('queue-table').getByRole('columnheader')
    await expect(headers).toHaveText(['Ticket No.', 'Created', 'Summary', 'Category', 'Req. Priority', 'IT Priority', 'Status', 'Owner', 'Updated', 'Open'])

    // Tickets from more than one requester are visible without any filter:
    // the queue is the whole system, not the caller's own list.
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Showing 11 to 20 of 24 tickets')).toBeVisible()
    await expect(page).toHaveURL(/page=2/)

    await page.getByLabel('Per page').selectOption('25')
    await expect(page.getByText('Showing 1 to 24 of 24 tickets')).toBeVisible()
  })

  test('filters by status chips, owner and IT priority, and sorts by status in workflow order', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.getByLabel('Search').fill(SEEDED)
    await expect(page.getByText(/of 24 tickets/)).toBeVisible()

    await page.getByRole('button', { name: /^filters/i }).click()
    await page.getByRole('button', { name: 'In Progress' }).click()
    await expect(page.getByText('Showing 1 to 4 of 4 tickets')).toBeVisible()

    await page.getByLabel('Owner').selectOption('me')
    await expect(page.getByText('Showing 1 to 1 of 1 ticket')).toBeVisible()
    await expect(page.getByTestId('queue-table')).toContainText('You')

    await page.getByLabel('Owner').selectOption('unassigned')
    await expect(page.getByTestId('no-results-state')).toBeVisible()

    await page.getByRole('button', { name: /clear filters/i }).first().click()
    await expect(page.getByLabel('Search')).toHaveValue('')

    await page.getByLabel('Search').fill(SEEDED)
    await page.getByLabel('Sort by').selectOption('status:asc')
    await page.getByLabel('Per page').selectOption('25')
    await expect(page.getByText('Showing 1 to 24 of 24 tickets')).toBeVisible()

    const statuses = await page.getByTestId('queue-table').locator('tbody tr').locator('.zg-badge[class*="zg-badge-status-"]').allInnerTexts()
    const order = ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened', 'Resolved', 'Closed', 'Cancelled']
    const ranks = statuses.map((label) => order.indexOf(label))
    expect(ranks).not.toContain(-1)
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  test('the requester-resolved icon shows on a flagged row and sortable headers set aria-sort', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.getByLabel('Search').fill('TKT-2026-900014')
    await expect(page.getByText('Showing 1 to 1 of 1 ticket')).toBeVisible()
    await expect(page.getByLabel('Requester reports resolved')).toBeVisible()

    await page.getByRole('columnheader', { name: /ticket no\./i }).getByRole('button').click()
    await expect(page.getByRole('columnheader', { name: /ticket no\./i })).toHaveAttribute('aria-sort', 'descending')
    await expect(page).toHaveURL(/sort=ticketNumber%3Adesc|sort=ticketNumber:desc/)
  })

  test('an Administrator sees the same queue; a Requester is refused', async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.goto('/staff/queue')
    await page.getByLabel('Search').fill(SEEDED)
    await expect(page.getByText(/of 24 tickets/)).toBeVisible()

    const api = await page.request.get('http://localhost:5000/api/staff/tickets?pageSize=5')
    expect(api.status()).toBe(200)
  })

  test('a Requester gets the Forbidden state and a 403 from the API', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await page.goto('/staff/queue')
    await expect(page.getByRole('alert')).toContainText(/don't have access/i)
    await expect(page.getByTestId('queue-table')).toHaveCount(0)

    const api = await page.request.get('http://localhost:5000/api/staff/tickets')
    expect(api.status()).toBe(403)
    expect(JSON.stringify(await api.json())).not.toContain('TKT-')
  })

  test('renders cards instead of a table at mobile width with no horizontal scroll (AC-33)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAs(page, IT_STAFF)
    await page.getByLabel('Search').fill(SEEDED)

    await expect(page.getByTestId('queue-cards')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, inner: window.innerWidth }))
    expect(widths.body).toBeLessThanOrEqual(widths.inner)
  })
})
