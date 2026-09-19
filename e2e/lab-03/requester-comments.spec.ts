import { expect, test } from '@playwright/test'
import { ADMIN, IT_STAFF, REQUESTER_A, REQUESTER_B, createTicket, loginAs, switchUser } from '../helpers'

/**
 * E2E-04 (Requester half) — Public Comments and "Problem appears resolved"
 * on the Requester Ticket Detail (AC-13, AC-14, AC-15, BR-04, BR-21, BR-23).
 *
 * The Lab 2 journeys (create ticket, My Tickets, attachments, ownership)
 * already run on the authenticated identity in `e2e/*.spec.ts`; this file
 * covers what Lab 3 adds to the same screen. The staff half of E2E-04 — the
 * IT Staff seeing the comment and the indicator in their own detail — lands
 * with the staff screens in `staff-ticket-flow.spec.ts`.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

test.describe('Public Comments on the Requester Ticket Detail (E2E-04, AC-14)', () => {
  test('a requester posts a comment and sees it newest-first with name, role and time', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await createTicket(page, 'E2E public comment')

    await expect(page.getByTestId('no-comments')).toHaveText('No comments yet.')

    await page.getByLabel(/add public comment/i).fill('Still happening after the restart.')
    await page.getByRole('button', { name: /post comment/i }).click()

    const list = page.getByTestId('comment-list')
    const first = list.getByRole('listitem').first()
    await expect(first).toContainText('Still happening after the restart.')
    await expect(first).toContainText(REQUESTER_A.name)
    await expect(first).toContainText('Requester')
    await expect(first.locator('time')).toHaveAttribute('title', /.+/)
    await expect(page.getByLabel(/add public comment/i)).toHaveValue('')

    await page.getByLabel(/add public comment/i).fill('Second note: it also affects the docking station.')
    await page.getByRole('button', { name: /post comment/i }).click()

    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByRole('listitem').first()).toContainText('Second note')
  })

  test('an empty comment is refused under the textarea and nothing is posted', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await createTicket(page, 'E2E empty comment')

    await page.getByLabel(/add public comment/i).fill('   ')
    await page.getByRole('button', { name: /post comment/i }).click()

    await expect(page.getByText('Comment cannot be empty.')).toBeVisible()
    await expect(page.getByTestId('no-comments')).toBeVisible()
  })

  test('a comment body is rendered as text, never as markup', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await createTicket(page, 'E2E comment markup')

    const markup = '<b>bold</b> <img src=x onerror="document.title=\'pwned\'">'
    await page.getByLabel(/add public comment/i).fill(markup)
    await page.getByRole('button', { name: /post comment/i }).click()

    const first = page.getByTestId('comment-list').getByRole('listitem').first()
    await expect(first).toContainText(markup)
    await expect(first.locator('b, img')).toHaveCount(0)
    await expect(page).not.toHaveTitle('pwned')
  })

  test('the thread is visible to IT Staff and the Administrator through the same detail', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E comment visibility')

    await page.getByLabel(/add public comment/i).fill('Visible to the IT team?')
    await page.getByRole('button', { name: /post comment/i }).click()
    await expect(page.getByTestId('comment-list')).toContainText('Visible to the IT team?')

    // The staff screens arrive with #39/#40; until then the API is the read
    // path the matrix (specification.md §5 "Authorization") promises.
    await switchUser(page, IT_STAFF)
    const staffThread = await page.request.get(`http://localhost:5000/api/tickets/${ticket.id}/comments`)
    expect(staffThread.status()).toBe(200)
    expect((await staffThread.json()).data[0].body).toBe('Visible to the IT team?')

    await switchUser(page, ADMIN)
    const adminThread = await page.request.get(`http://localhost:5000/api/tickets/${ticket.id}/comments`)
    expect(adminThread.status()).toBe(200)
    expect((await adminThread.json()).data[0].body).toBe('Visible to the IT team?')

    // Another Requester gets neither the ticket nor its thread (BR-23).
    await switchUser(page, REQUESTER_B)
    const otherThread = await page.request.get(`http://localhost:5000/api/tickets/${ticket.id}/comments`)
    expect(otherThread.status()).toBe(403)
    expect(JSON.stringify(await otherThread.json())).not.toContain('Visible to the IT team?')
  })
})

test.describe('"Problem appears resolved" (E2E-04, AC-15, BR-21)', () => {
  test('confirming replaces the button with the indicator and leaves the status alone', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E appears resolved')

    const button = page.getByRole('button', { name: /problem appears resolved/i })
    await expect(button).toBeVisible()
    await button.click()

    const dialog = page.getByRole('dialog', { name: /tell it staff this looks fixed/i })
    await dialog.getByRole('button', { name: /^confirm$/i }).click()

    await expect(page.getByTestId('requester-resolved')).toContainText('Requester reports resolved')
    await expect(button).toHaveCount(0)
    await expect(page.getByTestId('ticket-fields')).toContainText('New')

    // Survives a reload: the indication is on the ticket, not in page state.
    await page.reload()
    await expect(page.getByTestId('requester-resolved')).toBeVisible()
    await expect(page.getByRole('button', { name: /problem appears resolved/i })).toHaveCount(0)

    // The API agrees and offers a Requester no way to set the status.
    const detail = await page.request.get(`http://localhost:5000/api/tickets/${ticket.id}`)
    const body = await detail.json()
    expect(body.status).toBe('New')
    expect(typeof body.requesterResolvedAt).toBe('string')

    const repeat = await page.request.post(`http://localhost:5000/api/tickets/${ticket.id}/resolution-indication`)
    expect(repeat.status()).toBe(200)
    expect((await repeat.json()).requesterResolvedAt).toBe(body.requesterResolvedAt)
  })

  test('cancelling the dialog changes nothing', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    await createTicket(page, 'E2E appears resolved cancelled')

    await page.getByRole('button', { name: /problem appears resolved/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /problem appears resolved/i })).toBeVisible()
    await expect(page.getByTestId('requester-resolved')).toHaveCount(0)
  })
})
