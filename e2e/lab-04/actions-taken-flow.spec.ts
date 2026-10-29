import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import path from 'node:path'
import { IT_STAFF, REQUESTER_A, createTicket, loginAs, switchUser } from '../helpers'
import type { Account } from '../helpers'

/**
 * Actions Taken end to end (Lab 4 tests.md §2 "End-to-end").
 *
 *   E2E-01 — AC-04, AC-06, AC-09: validation under the fields, create, edit,
 *            a stale edit from a second browser recovered with Reload, and no
 *            Record control on a locked (Resolved) ticket.
 *   E2E-02 — AC-03, AC-05, AC-07, AC-11: several IT Staff on one ticket, a
 *            follow-up assigned and completed by someone else, an inactive
 *            assignee refused, and the Requester's read-only view.
 *
 * The flows create their own tickets, so the seeded data other suites rely on
 * is left alone. With `CAPTURE=1` the screenshot test also writes the
 * Answer Part 6 evidence into `artifacts/lab-04/screenshots/actions-taken/`.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

const API = 'http://localhost:5000'
const CAPTURE = process.env.CAPTURE === '1'
const SHOTS = path.join(process.cwd(), 'artifacts', 'lab-04', 'screenshots', 'actions-taken')

const CHEN: Account = { name: 'Chen Wei', email: 'chen.wei@kmutt.ac.th', password: 'Staff1!pass' }
const NATTAPONG: Account = { name: 'Nattapong Srisuk', email: 'nattapong.srisuk@kmutt.ac.th', password: 'Staff1!pass' }

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1100 },
  mobile: { width: 375, height: 812 },
} as const

/** V-03: the page never scrolls sideways. Checked before every capture. */
async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth)
}

async function shot(page: Page, file: string, options: { fullPage?: boolean } = {}) {
  await expectNoHorizontalOverflow(page)
  if (!CAPTURE) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: options.fullPage ?? true })
}

/** A seeded ticket's id, read through the staff API with the page's session. */
async function seededTicketId(page: Page, ticketNumber: string): Promise<string> {
  const res = await page.request.get(`${API}/api/staff/tickets?search=${ticketNumber}`)
  const body = await res.json()
  return body.data[0].id as string
}

async function openActions(page: Page, ticketId: string) {
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByTestId('ticket-fields')).toBeVisible()
  // Actions Taken is the first, default tab (ui-spec.md §3.3).
  await expect(page.getByRole('tab', { name: /actions taken/i })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('actions-taken')).toBeVisible()
  await expect(page.getByTestId('actions-taken').getByRole('status')).toHaveCount(0)
}

/** Fills and saves the create form. */
async function recordAction(
  page: Page,
  values: { description: string; result: string; followUp?: { note: string; assignee: string }; attachmentNotes?: string },
) {
  await page.getByRole('button', { name: /record action/i }).click()
  const form = page.getByTestId('action-form')
  await form.getByLabel(/^Action Description/).fill(values.description)
  await form.getByLabel(/^Result/).fill(values.result)
  if (values.attachmentNotes) await form.getByLabel(/^Attachment Notes/).fill(values.attachmentNotes)
  if (values.followUp) {
    await form.getByRole('switch', { name: /follow-up required/i }).click()
    await form.getByLabel(/^Follow-up Note/).fill(values.followUp.note)
    await form.getByLabel(/^Assign follow-up to/).selectOption({ label: values.followUp.assignee })
  }
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(page.getByText('Action recorded.')).toBeVisible()
  await expect(page.getByTestId('action-form')).toHaveCount(0)
}

/** A second, independent browser signed in as `account` (its own cookies). */
async function secondBrowser(browser: Browser, account: Account) {
  const context = await browser.newContext({ baseURL: 'http://localhost:5173' })
  const page = await context.newPage()
  await loginAs(page, account)
  return { context, page }
}

test.describe('Actions Taken (E2E-01, AC-04, AC-06, AC-09)', () => {
  test('validate, create, edit; a stale edit is caught and recovered with Reload', async ({ page, browser }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E actions taken — edit and conflict')

    await switchUser(page, IT_STAFF)
    await openActions(page, ticket.id)
    await expect(page.getByTestId('no-actions')).toHaveText('No actions recorded yet.')

    // --- Validation sits under each field, nothing is sent ----------------
    await page.getByRole('button', { name: /record action/i }).click()
    const form = page.getByTestId('action-form')
    await expect(form.getByTestId('performed-by')).toHaveText(`You (${IT_STAFF.name})`)
    await form.getByRole('button', { name: 'Save action' }).click()
    await expect(form.getByText('Action description is required.')).toBeVisible()
    await expect(form.getByText('Result is required.')).toBeVisible()
    await form.getByRole('switch', { name: /follow-up required/i }).click()
    await form.getByLabel(/^Action Description/).fill('Checked the battery report.')
    await form.getByLabel(/^Result/).fill('Battery at 58% of design capacity.')
    await form.getByLabel(/^Assign follow-up to/).selectOption('')
    await form.getByRole('button', { name: 'Save action' }).click()
    await expect(form.getByText('A follow-up note is required when follow-up is needed.')).toBeVisible()
    await expect(form.getByText('Choose who will do the follow-up.')).toBeVisible()
    await shot(page, 'create-validation-desktop.png')

    // Turn follow-up back off and save the plain Action.
    await form.getByRole('switch', { name: /follow-up required/i }).click()
    await form.getByRole('button', { name: 'Save action' }).click()
    await expect(page.getByText('Action recorded.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Actions Taken (1)' })).toBeVisible()
    const row = page.getByTestId('action-row').first()
    await expect(row).toContainText('Checked the battery report.')
    await expect(row).toContainText(IT_STAFF.name)

    // --- Chen edits the same Action first, from another browser ------------
    const other = await secondBrowser(browser, CHEN)
    await openActions(other.page, ticket.id)
    await other.page.getByTestId('action-row').first().getByRole('button', { name: /view/i }).click()
    await other.page.getByRole('button', { name: 'Edit' }).click()
    await other.page.getByTestId('action-form').getByLabel(/^Result/).fill('Battery at 58%; replacement ordered.')
    await other.page.getByRole('button', { name: 'Save changes' }).click()
    await expect(other.page.getByText('Changes saved.')).toBeVisible()
    await other.context.close()

    // --- Priya's edit is based on the old version --------------------------
    // Her page still shows the copy she saved; the row stayed expanded after
    // that save, so Edit is already on screen.
    await expect(row.getByRole('button', { name: /hide/i })).toBeVisible()
    await page.getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByTestId('action-form')
    await edit.getByLabel(/^Result/).fill('Battery replaced; charge holds all day.')
    await edit.getByRole('button', { name: 'Save changes' }).click()

    const stale = edit.getByRole('alert')
    await expect(stale).toContainText('Someone else changed this action')
    await expect(edit.getByLabel(/^Result/)).toHaveValue('Battery replaced; charge holds all day.')
    await shot(page, 'stale-desktop.png')

    await stale.getByRole('button', { name: 'Reload' }).click()
    await expect(edit.getByText(/reloaded the latest version/i)).toBeVisible()
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()
    await expect(page.getByTestId('action-view')).toContainText('Battery replaced; charge holds all day.')
    await expect(page.getByTestId('action-view')).toContainText(`Edited`)
  })

  test('a Resolved ticket offers no Record or Edit control (AC-09)', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await openActions(page, await seededTicketId(page, 'TKT-2026-900014'))

    await expect(page.getByTestId('action-row')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /record action/i })).toHaveCount(0)
    await expect(page.getByTestId('actions-locked-hint')).toHaveText('This ticket is resolved. Reopen it to record more work.')
    await page.getByTestId('action-row').first().getByRole('button', { name: /view/i }).click()
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  })
})

test.describe('Several IT Staff on one ticket (E2E-02, AC-03, AC-05, AC-07, AC-11)', () => {
  test('owner, performer and follow-up assignee are different people; the Requester sees it all read-only', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E actions taken — three IT Staff')

    // --- Chen claims the ticket: he is the owner ---------------------------
    await switchUser(page, CHEN)
    await openActions(page, ticket.id)
    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(page.getByLabel('Ticket Owner')).toHaveValue(/.+/)

    // --- Priya records work with a follow-up for Nattapong (AC-05, AC-01) --
    await switchUser(page, IT_STAFF)
    await openActions(page, ticket.id)
    await recordAction(page, {
      description: 'Ran a remote diagnostic on the laptop.',
      result: 'Power profile was forcing maximum performance.',
      attachmentNotes: 'diagnostic.html in Attachments.',
      followUp: { note: 'Re-check battery drain after one full day.', assignee: NATTAPONG.name },
    })
    const first = page.getByTestId('action-row').first()
    await expect(first).toContainText(IT_STAFF.name)
    await expect(first).toContainText('Follow-up open')
    await expect(first).toContainText(NATTAPONG.name)
    await expect(first.getByText('Owner')).toHaveCount(0)

    // --- An inactive assignee is refused by the server (BR-06) -------------
    // Robert is inactive, so the form never offers him; a direct call is the
    // only way to try, and it is refused.
    const seeded = await page.request.get(`${API}/api/staff/tickets/${await seededTicketId(page, 'TKT-2026-900008')}/actions`)
    const robertId = ((await seeded.json()).data as { followUp: { assignee: { id: string; name: string } | null } }[])
      .map((entry) => entry.followUp.assignee)
      .find((assignee) => assignee?.name === 'Robert Wilson')?.id
    expect(robertId).toBeTruthy()
    const refused = await page.request.post(`${API}/api/staff/tickets/${ticket.id}/actions`, {
      data: {
        actionAt: new Date().toISOString(),
        description: 'Try an inactive assignee',
        result: 'Should be refused',
        followUpRequired: true,
        followUpNote: 'n',
        followUpAssigneeId: robertId,
      },
    })
    expect(refused.status()).toBe(400)
    expect((await refused.json()).error.fields.followUpAssigneeId).toMatch(/active IT Staff/)

    // --- Nattapong completes the follow-up assigned to him (AC-07) ----------
    await switchUser(page, NATTAPONG)
    await openActions(page, ticket.id)
    await page.getByTestId('action-row').first().getByRole('button', { name: /view/i }).click()
    await page.getByRole('button', { name: 'Mark follow-up done' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Re-check battery drain after one full day.')
    await dialog.getByRole('button', { name: 'Mark as done' }).click()
    await expect(page.getByText('Follow-up marked as done.')).toBeVisible()
    await expect(page.getByTestId('action-view')).toContainText(`Done by ${NATTAPONG.name}`)

    // --- Chen, the owner, records the second Action -------------------------
    await switchUser(page, CHEN)
    await openActions(page, ticket.id)
    await recordAction(page, {
      description: 'Set the power profile back to Balanced.',
      result: 'Battery lasted a full day in testing.',
    })
    const rows = page.getByTestId('action-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Set the power profile back to Balanced.')
    await expect(rows.nth(0).getByText('Owner')).toBeVisible()
    await expect(rows.nth(1)).toContainText('Ran a remote diagnostic on the laptop.')
    await expect(rows.nth(1)).toContainText('Follow-up done')

    // --- The Requester sees both, in the same order, with no controls ------
    await switchUser(page, REQUESTER_A)
    await page.goto(ticket.url)
    const workDone = page.getByTestId('work-done')
    await expect(workDone.getByRole('heading', { name: 'Work done by IT (2)' })).toBeVisible()
    const cards = workDone.getByTestId('action-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Set the power profile back to Balanced.')
    await expect(cards.nth(1)).toContainText('Ran a remote diagnostic on the laptop.')
    await expect(cards.nth(1)).toContainText('Next step: Re-check battery drain after one full day.')
    await expect(cards.nth(1)).toContainText('diagnostic.html in Attachments.')
    await expect(workDone.getByRole('button')).toHaveCount(0)
  })
})

test.describe('Actions Taken screenshots (R-07 … R-10, V-03)', () => {
  for (const [width, viewport] of Object.entries(VIEWPORTS)) {
    test(`list and create form at ${width} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginAs(page, IT_STAFF)
      // TKT-…007: three Actions by three IT Staff, one open follow-up.
      await openActions(page, await seededTicketId(page, 'TKT-2026-900007'))
      await expect(page.getByTestId('actions-list')).toBeVisible()
      await shot(page, `list-${width}.png`, { fullPage: width === 'desktop' })

      // View mode of the Action with the follow-up.
      if (width === 'desktop') {
        await page.getByTestId('action-row').first().getByRole('button', { name: /view/i }).click()
        await expect(page.getByTestId('action-view')).toBeVisible()
        await shot(page, 'view-desktop.png')
        await page.getByRole('button', { name: 'Edit' }).click()
        await expect(page.getByTestId('action-form')).toBeVisible()
        await shot(page, 'edit-desktop.png')
        // Exact: the #55 gate hint has a "…completed or cancelled" link too.
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      }

      await page.getByRole('button', { name: /record action/i }).click()
      const form = page.getByTestId('action-form')
      await form.getByRole('switch', { name: /follow-up required/i }).click()
      await form.getByRole('button', { name: 'Save action' }).click()
      await expect(form.getByText('Action description is required.')).toBeVisible()
      await shot(page, `create-${width}.png`, { fullPage: width === 'desktop' })
    })

    test(`Requester "Work done by IT" at ${width} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await loginAs(page, IT_STAFF)
      // TKT-…010 belongs to Jennifer and carries an open follow-up.
      const ticketId = await seededTicketId(page, 'TKT-2026-900010')
      // Switch accounts without the profile menu, which sits behind the
      // hamburger at phone width.
      await page.context().clearCookies()
      await loginAs(page, REQUESTER_A)
      await page.goto(`/tickets/${ticketId}`)
      const workDone = page.getByTestId('work-done')
      await expect(workDone.getByTestId('action-card')).toHaveCount(1)
      await workDone.scrollIntoViewIfNeeded()
      await shot(page, `requester-${width}.png`, { fullPage: width === 'desktop' })
    })
  }
})
