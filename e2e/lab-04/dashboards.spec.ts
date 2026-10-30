import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import path from 'node:path'
import { ADMIN, IT_STAFF, REQUESTER_A, loginAs } from '../helpers'
import type { Account } from '../helpers'

/**
 * Dashboards end to end (Lab 4 tests.md §2 "End-to-end").
 *
 *   E2E-05 — AC-02, AC-19, AC-20, AC-22, AC-23: each role logs in and lands
 *            on /dashboard with Dashboard marked current; every card is
 *            followed and the list it opens has the card's total; list rows
 *            open the Ticket.
 *   E2E-06 — AC-21: Ploy's empty dashboard; a Requester calling the staff
 *            dashboard gets 403; the API failing gives the safe failure, and
 *            Retry recovers.
 *
 * Read-only, so it runs against whatever the seeded database holds. With
 * `CAPTURE=1` it writes the R-01 … R-06, R-13, R-14 evidence into
 * `artifacts/lab-04/screenshots/{requester-dashboard,staff-dashboard}/`.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

const API = 'http://localhost:5000'
const CAPTURE = process.env.CAPTURE === '1'
const SHOTS = path.join(process.cwd(), 'artifacts', 'lab-04', 'screenshots')

const PLOY: Account = { name: 'Ploy Charoen', email: 'ploy.charoen@kmutt.ac.th', password: 'Requester3!' }

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1100 },
  mobile: { width: 375, height: 812 },
} as const

/** V-03 every time; with `CAPTURE=1`, also the evidence image. */
async function shot(page: Page, file: string, fullPage = true) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth)
  if (!CAPTURE) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, file), fullPage })
}

/** The count in a card's accessible name: "Waiting for you: 1 ticket" → 1. */
function countOf(label: string): number {
  const match = /: (\d+) /.exec(label)
  if (!match) throw new Error(`no count in "${label}"`)
  return Number(match[1])
}

/** The total the list on screen reports: "Showing 1 to 3 of 3 tickets", or 0 on the no-results state. */
async function listTotal(page: Page): Promise<number> {
  const count = page.locator('.zg-result-count')
  const none = page.getByTestId('no-results-state')
  await expect(count.or(none).first()).toBeVisible()
  if (await none.isVisible()) return 0
  const match = /of (\d+) ticket/.exec(await count.innerText())
  if (!match) throw new Error('no total on the list')
  return Number(match[1])
}

async function openDashboard(page: Page, account: Account) {
  await loginAs(page, account)
  // AC-22: every role lands on the dashboard, with Dashboard marked current.
  await expect(page).toHaveURL(/\/dashboard$/)
  // Below 768 px the navigation sits behind the Menu button (L3 R-07).
  const width = page.viewportSize()?.width ?? 1280
  if (width < 768) await page.getByRole('button', { name: 'Menu' }).click()
  const nav = page.getByRole('navigation', { name: /main/i })
  await expect(nav.getByRole('link').first()).toHaveText('Dashboard')
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  if (width < 768) await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.locator('.zg-metric-card.is-loading')).toHaveCount(0)
}

/** Every metric card on the page: its accessible name and href. */
async function cards(page: Page) {
  const links = page.locator('a.zg-metric-card:not(.zg-metric-users)')
  const out: { label: string; href: string }[] = []
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index)
    out.push({ label: (await link.getAttribute('aria-label')) ?? '', href: (await link.getAttribute('href')) ?? '' })
  }
  return out
}

/** Follows every card and compares the list total with it (AC-20). */
async function followEveryCard(page: Page, followUpTicketCount?: number) {
  const all = await cards(page)
  expect(all.length).toBeGreaterThan(0)
  for (const card of all) {
    await page.goto(card.href)
    // "My open follow-ups: 3 follow-ups across 2 tickets": the Queue lists the 2 tickets.
    const expected = card.label.startsWith('My open follow-ups') ? followUpTicketCount : countOf(card.label)
    expect(await listTotal(page), `${card.label} → ${card.href}`).toBe(expected)
  }
}

test.describe('Landing and drill-down (E2E-05, AC-02, AC-19, AC-20, AC-22, AC-23)', () => {
  test('Requester: cards open My Tickets with the same totals; rows open the ticket', async ({ page }) => {
    await openDashboard(page, REQUESTER_A)
    await expect(page.getByRole('heading', { name: 'Welcome, Jennifer!' })).toBeVisible()
    await shot(page, 'requester-dashboard/dashboard-desktop.png')

    const recent = page.getByTestId('list-recently-updated').locator('a.zg-dash-row').first()
    const label = (await recent.getAttribute('aria-label')) ?? ''
    await recent.click()
    await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(label.split(': ').slice(1).join(': '))

    await page.goto('/dashboard')
    await expect(page.locator('.zg-metric-card.is-loading')).toHaveCount(0)
    await followEveryCard(page)

    // R-13: the drilled-down list shows the chips that the link set.
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^My open tickets/ }).click()
    await expect(page.getByTestId('status-chips').getByRole('button', { pressed: true })).toHaveCount(5)
    await shot(page, 'requester-dashboard/drilldown-desktop.png')
  })

  test('IT Staff: every card opens the Queue with the same total, including follow-ups', async ({ page }) => {
    await openDashboard(page, IT_STAFF)
    await expect(page.getByRole('heading', { name: 'Welcome back, Priya!' })).toBeVisible()
    await shot(page, 'staff-dashboard/dashboard-desktop.png')

    const followUps = await page.getByTestId('metric-follow-ups').getAttribute('aria-label')
    const ticketCount = Number(/across (\d+) ticket/.exec(followUps ?? '')?.[1])
    await followEveryCard(page, ticketCount)

    // R-14 and "my recent actions" → the Actions Taken tab.
    await page.goto('/staff/queue?followUp=mine')
    await expect(page.getByTestId('drilldown-chips')).toContainText('My open follow-ups')
    await shot(page, 'staff-dashboard/drilldown-desktop.png')

    await page.goto('/dashboard')
    const action = page.getByTestId('list-my-actions').locator('a.zg-dash-row').first()
    await action.click()
    await expect(page).toHaveURL(/\/staff\/tickets\/[0-9a-f-]{36}#actions$/)
    await expect(page.getByRole('tab', { name: /actions taken/i })).toHaveAttribute('aria-selected', 'true')
  })

  test('Administrator: no "my" cards, a Users card, and the same drill-down totals', async ({ page }) => {
    await openDashboard(page, ADMIN)
    await expect(page.getByTestId('metric-mine')).toHaveCount(0)
    await expect(page.getByTestId('metric-follow-ups')).toHaveCount(0)
    await expect(page.getByTestId('metric-users')).toHaveAttribute('href', '/admin/users')
    await shot(page, 'staff-dashboard/admin-desktop.png')
    await followEveryCard(page)
  })
})

test.describe('Empty, forbidden and failure (E2E-06, AC-21)', () => {
  test("Ploy, with no tickets, gets the empty panel and a way to create one", async ({ page }) => {
    await openDashboard(page, PLOY)
    const empty = page.getByTestId('dashboard-empty')
    await expect(empty).toContainText("You haven't raised any tickets yet.")
    await expect(empty.getByRole('link', { name: 'Create Ticket' })).toHaveAttribute('href', '/tickets/new')
    await shot(page, 'requester-dashboard/empty-desktop.png')
  })

  test('a Requester asking for the staff dashboard gets 403 and no numbers', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const res = await page.request.get(`${API}/api/staff/dashboard`)
    expect(res.status()).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('metrics')
  })

  test('the API failing shows the safe failure with Retry; Retry recovers', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await page.route('**/api/dashboard/requester', (route) => route.abort('connectionrefused'))
    await page.goto('/dashboard')

    const failure = page.getByTestId('dashboard-failure')
    await expect(failure).toContainText('Could not reach the server')
    await expect(page.getByRole('link', { name: 'View My Tickets' })).toBeVisible()
    await shot(page, 'requester-dashboard/failure.png')

    await page.unroute('**/api/dashboard/requester')
    await failure.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('link', { name: /^My open tickets/ })).toBeVisible()
  })
})

test.describe('Dashboard screenshots (R-01 … R-06, V-03)', () => {
  for (const [width, viewport] of Object.entries(VIEWPORTS)) {
    test(`both dashboards at ${width} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)

      await openDashboard(page, REQUESTER_A)
      await shot(page, `requester-dashboard/dashboard-${width}.png`)

      await page.context().clearCookies()
      await openDashboard(page, IT_STAFF)
      await shot(page, `staff-dashboard/dashboard-${width}.png`)

      if (width === 'mobile') {
        await page.context().clearCookies()
        await openDashboard(page, ADMIN)
        await shot(page, 'staff-dashboard/admin-mobile.png')

        await page.context().clearCookies()
        await loginAs(page, PLOY)
        await expect(page.getByTestId('dashboard-empty')).toBeVisible()
        await shot(page, 'requester-dashboard/empty-mobile.png')

        await page.goto('/tickets?status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened')
        await expect(page.getByTestId('status-chips')).toBeVisible()
      }
    })
  }

  test('loading, staff failure and the forbidden URL (R-03, R-06)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    // Delayed, so the skeleton is what is on screen when captured. A fixed
    // delay rather than a hand-released promise: the dev build mounts effects
    // twice, so there can be two requests in flight.
    await page.route('**/api/dashboard/requester', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue().catch(() => undefined)
    })
    await page.goto('/dashboard')
    await expect(page.locator('.zg-metric-card.is-loading').first()).toBeVisible()
    await shot(page, 'requester-dashboard/loading.png', false)
    await expect(page.getByRole('link', { name: /^My open tickets/ })).toBeVisible()
    await page.unroute('**/api/dashboard/requester')

    await page.context().clearCookies()
    await loginAs(page, IT_STAFF)
    await page.route('**/api/staff/dashboard', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }) }),
    )
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-failure')).toBeVisible()
    await shot(page, 'staff-dashboard/failure.png')
    await page.unroute('**/api/staff/dashboard')

    // A Requester typing a staff URL gets the Lab 3 Forbidden state.
    await page.context().clearCookies()
    await loginAs(page, REQUESTER_A)
    await page.goto('/staff/queue')
    await expect(page.getByText(/don.t have access/i)).toBeVisible()
    await shot(page, 'staff-dashboard/forbidden.png')
  })
})
