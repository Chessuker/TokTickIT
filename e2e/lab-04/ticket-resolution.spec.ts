import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import path from 'node:path'
import { IT_STAFF, REQUESTER_A, REQUESTER_B, createTicket, loginAs, switchUser } from '../helpers'
import type { Account } from '../helpers'

/**
 * Ticket workflow end to end (Lab 4 tests.md §2 "End-to-end").
 *
 *   E2E-03 — AC-12 … AC-16, AC-18: the resolution gate blocks Resolve and
 *            says why; an Action and a completed follow-up open it; Resolve,
 *            Close, Reopen (blocked again until new work), the History tab,
 *            the Requester's advisory "appears resolved", and a Cancel that
 *            cancels the open follow-ups with it.
 *   E2E-04 — AC-17: two IT Staff on one ticket; the second acts from a stale
 *            page, is told so, reloads, and then applies their change on top.
 *
 * Every flow creates its own tickets, so the seeded data other suites rely on
 * is left alone. With `CAPTURE=1` it also writes the Answer Part 7 evidence
 * into `artifacts/lab-04/screenshots/workflow/`.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

const CAPTURE = process.env.CAPTURE === '1'
const SHOTS = path.join(process.cwd(), 'artifacts', 'lab-04', 'screenshots', 'workflow')

const CHEN: Account = { name: 'Chen Wei', email: 'chen.wei@kmutt.ac.th', password: 'Staff1!pass' }

/** V-03 on every call; with `CAPTURE=1` and a file name, also the evidence image. */
async function shot(page: Page, file?: string, fullPage = true) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth)
  if (!CAPTURE || !file) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, file), fullPage })
}

async function openDetail(page: Page, ticketId: string) {
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByTestId('ticket-fields')).toBeVisible()
  await expect(page.getByTestId('actions-taken').getByRole('status')).toHaveCount(0)
}

const status = (page: Page) => page.getByLabel('Current Status')

async function setStatus(page: Page, value: string, confirm = false) {
  await status(page).selectOption(value)
  if (confirm) await page.getByRole('dialog').getByRole('button', { name: /^confirm$/i }).click()
  await expect(status(page)).toHaveValue(value)
}

async function recordAction(page: Page, description: string, followUpTo?: string) {
  await page.getByRole('tab', { name: /actions taken/i }).click()
  await page.getByRole('button', { name: /record action/i }).click()
  const form = page.getByTestId('action-form')
  await form.getByLabel(/^Action Description/).fill(description)
  await form.getByLabel(/^Result/).fill('Done.')
  if (followUpTo) {
    await form.getByRole('switch', { name: /follow-up required/i }).click()
    await form.getByLabel(/^Follow-up Note/).fill('Check again tomorrow.')
    await form.getByLabel(/^Assign follow-up to/).selectOption({ label: followUpTo })
  }
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(page.getByText('Action recorded.')).toBeVisible()
}

async function secondBrowser(browser: Browser, account: Account) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  const page = await context.newPage()
  await loginAs(page, account)
  return { context, page }
}

const options = (page: Page) => status(page).locator('option')

test.describe('Resolution gate and history (E2E-03, AC-12 … AC-16, AC-18)', () => {
  test('blocked → work recorded → Resolved → Closed → Reopened → blocked until new work → Resolved', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E resolution gate journey')

    await switchUser(page, IT_STAFF)
    await openDetail(page, ticket.id)
    await page.getByRole('button', { name: 'Claim' }).click()
    await setStatus(page, 'InProgress')

    // --- No Action yet: Resolved is not offered, and the hint says why -------
    const hint = page.getByTestId('resolution-gate-hint')
    await expect(options(page)).toHaveText(['In Progress', 'Waiting for Requester', 'Cancelled'])
    await expect(hint).toContainText('Resolve is unavailable until:')
    await expect(hint.getByRole('listitem')).toHaveText(['at least one action is recorded'])

    // The server is the real guard (AC-12).
    const blocked = await page.request.patch(`http://localhost:5000/api/staff/tickets/${ticket.id}/status`, {
      data: { status: 'Resolved' },
    })
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).error).toMatchObject({ code: 'RESOLUTION_BLOCKED', unmet: ['ACTION_SINCE_REOPEN'] })

    // --- An Action with an open follow-up: still blocked, for the other reason
    await recordAction(page, 'Re-created the Outlook profile.', IT_STAFF.name)
    await expect(hint.getByRole('listitem')).toHaveText(['1 open follow-up is completed or cancelled'])
    await shot(page)

    // --- The follow-up is done: Resolved appears, without a reload ----------
    await page.getByRole('button', { name: 'Mark follow-up done' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mark as done' }).click()
    await expect(hint).toHaveCount(0)
    await expect(options(page)).toHaveText(['In Progress', 'Waiting for Requester', 'Resolved', 'Cancelled'])

    await setStatus(page, 'Resolved', true)
    const headline = page.locator('.zg-detail-headline')
    await expect(headline).toContainText('Resolved')
    await setStatus(page, 'Closed', true)
    await setStatus(page, 'Reopened')

    // --- Reopened: the old Action no longer counts (AC-13) ------------------
    await expect(hint.getByRole('listitem')).toHaveText([
      'at least one action is recorded since the ticket was reopened',
    ])
    await expect(options(page)).not.toContainText(['Resolved'])
    await recordAction(page, 'Replaced the mail profile cache.')
    await expect(hint).toHaveCount(0)
    await setStatus(page, 'Resolved', true)

    // --- History: every change, oldest first, including the automatic one ---
    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('history-created')).toContainText(`Created by ${REQUESTER_A.name}`)
    const rows = page.getByTestId('history-row')
    await expect(rows).toHaveCount(6)
    const transitions = [
      ['New', 'Open'],
      ['Open', 'In Progress'],
      ['In Progress', 'Resolved'],
      ['Resolved', 'Closed'],
      ['Closed', 'Reopened'],
      ['Reopened', 'Resolved'],
    ]
    for (const [index, [from, to]] of transitions.entries()) {
      await expect(rows.nth(index)).toContainText(from)
      await expect(rows.nth(index)).toContainText(to)
      await expect(rows.nth(index)).toContainText(IT_STAFF.name)
    }
    await expect(page.getByTestId('ticket-history').getByRole('button')).toHaveCount(0)
    await shot(page)

    // --- The Requester sees the same history, read-only (AD-12) -------------
    await switchUser(page, REQUESTER_A)
    await page.goto(`/tickets/${ticket.id}`)
    await page.getByRole('button', { name: /status history/i }).click()
    await expect(page.getByTestId('history-row')).toHaveCount(6)
  })

  test("the Requester's indication is advisory; a Cancel cancels the open follow-ups (AC-15, AC-18)", async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E cancel with follow-ups')

    await switchUser(page, IT_STAFF)
    await openDetail(page, ticket.id)
    await page.getByRole('button', { name: 'Claim' }).click()
    await recordAction(page, 'Checked the VPN client.', IT_STAFF.name)
    await recordAction(page, 'Asked the network team.', CHEN.name)

    // --- The Requester says it looks fixed: status does not move -----------
    await switchUser(page, REQUESTER_A)
    await page.goto(`/tickets/${ticket.id}`)
    await page.getByRole('button', { name: /problem appears resolved/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByTestId('ticket-fields')).toContainText('Open')

    const refused = await page.request.patch(`http://localhost:5000/api/staff/tickets/${ticket.id}/status`, {
      data: { status: 'Resolved' },
    })
    expect(refused.status()).toBe(403)

    // --- IT Staff see it as advisory, then cancel the ticket ---------------
    await switchUser(page, IT_STAFF)
    await openDetail(page, ticket.id)
    await expect(page.getByTestId('requester-resolved-note')).toContainText('review the actions before resolving')
    await expect(status(page)).toHaveValue('Open')

    await status(page).selectOption('Cancelled')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('2 open follow-ups will be cancelled.')
    await shot(page)
    await dialog.getByRole('button', { name: /^confirm$/i }).click()
    await expect(status(page)).toHaveValue('Cancelled')

    await page.getByRole('tab', { name: /actions taken/i }).click()
    await expect(page.getByText('Follow-up cancelled')).toHaveCount(2)
    await expect(page.getByText('Follow-up open')).toHaveCount(0)
  })
})

test.describe('Stale ticket operation (E2E-04, AC-17)', () => {
  test('B changes IT Priority from a stale page, is told so, reloads, and applies on top', async ({ page, browser }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E stale ticket operation')

    await switchUser(page, IT_STAFF)
    await openDetail(page, ticket.id)
    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(status(page)).toHaveValue('Open')

    // B opens the same ticket now, then A moves it on.
    const chen = await secondBrowser(browser, CHEN)
    await openDetail(chen.page, ticket.id)
    await setStatus(page, 'InProgress')

    // B's page still shows Open. Their IT Priority change is refused.
    await expect(status(chen.page)).toHaveValue('Open')
    await chen.page.getByLabel('IT Priority').selectOption('High')
    const callout = chen.page.getByTestId('stale-callout')
    await expect(callout).toContainText('Someone else changed this ticket after you opened it.')
    await expect(chen.page.getByLabel('IT Priority')).toHaveValue('High')
    await expect(chen.page.getByLabel('IT Priority')).toHaveClass(/is-stale/)
    await shot(chen.page, 'stale-desktop.png')

    // Reload shows A's change; B applies theirs on top; nothing is lost.
    await callout.getByRole('button', { name: 'Reload' }).click()
    await expect(callout).toHaveCount(0)
    await expect(status(chen.page)).toHaveValue('InProgress')
    await chen.page.getByLabel('IT Priority').selectOption('High')
    await expect(chen.page.getByLabel('IT Priority')).toHaveValue('High')
    await expect(chen.page.getByTestId('stale-callout')).toHaveCount(0)
    await chen.context.close()

    await page.reload()
    await expect(status(page)).toHaveValue('InProgress')
    await expect(page.getByLabel('IT Priority')).toHaveValue('High')
  })
})

test.describe('Workflow screenshots (R-11, R-12, V-03)', () => {
  const VIEWPORTS = {
    desktop: { width: 1280, height: 900 },
    mobile: { width: 375, height: 812 },
  } as const

  /** A seeded ticket's id, read through the staff API with the page's session. */
  async function seededTicketId(page: Page, ticketNumber: string): Promise<string> {
    const res = await page.request.get(`http://localhost:5000/api/staff/tickets?search=${ticketNumber}`)
    return (await res.json()).data[0].id as string
  }

  for (const [width, viewport] of Object.entries(VIEWPORTS)) {
    test(`gate hint, Cancel dialog and History at ${width} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginAs(page, IT_STAFF)

      // TKT-…012: Reopened, its only Action predates the reopen (BR-17).
      const reopened = await seededTicketId(page, 'TKT-2026-900012')
      await openDetail(page, reopened)
      await expect(page.getByTestId('resolution-gate-hint')).toContainText('since the ticket was reopened')
      await page.getByTestId('resolution-gate-hint').scrollIntoViewIfNeeded()
      await shot(page, `gate-hint-${width}.png`, width === 'desktop')

      await page.getByRole('tab', { name: 'History' }).click()
      await expect(page.getByTestId('history-row')).toHaveCount(4)
      await page.getByTestId('ticket-history').scrollIntoViewIfNeeded()
      await shot(page, `history-${width}.png`, width === 'desktop')

      // TKT-…007: In Progress with one open follow-up. Dismissed, so it stays as seeded.
      await openDetail(page, await seededTicketId(page, 'TKT-2026-900007'))
      await status(page).selectOption('Cancelled')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('1 open follow-up will be cancelled.')
      await shot(page, `cancel-dialog-${width}.png`, false)
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(status(page)).toHaveValue('InProgress')

      // The Requester's collapsible status history: David on TKT-…013.
      const davids = await seededTicketId(page, 'TKT-2026-900013')
      await page.context().clearCookies()
      await loginAs(page, REQUESTER_B)
      await page.goto(`/tickets/${davids}`)
      await page.getByRole('button', { name: /status history/i }).click()
      await expect(page.getByTestId('history-row')).toHaveCount(4)
      await page.getByTestId('ticket-history').scrollIntoViewIfNeeded()
      await shot(page, `requester-history-${width}.png`, width === 'desktop')
    })
  }
})
