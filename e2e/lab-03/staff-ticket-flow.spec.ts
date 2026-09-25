import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN, IT_STAFF, REQUESTER_A, createTicket, loginAs, switchUser } from '../helpers'

/**
 * E2E-05 — the IT Staff journey end to end (AC-18 … AC-24), plus the boundary
 * that matters most: what the Requester sees afterwards.
 *
 * The ticket is created through the Requester screens rather than seeded, so
 * the test owns it and can take it all the way to Closed without disturbing
 * the seeded queue other tests search.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

/** Opens the staff detail of a ticket by its id. */
async function openStaffDetail(page: Page, ticketId: string) {
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(page.getByTestId('ticket-fields')).toBeVisible()
}

test.describe('IT Staff ticket operations (E2E-05)', () => {
  test('claim → IT priority → In Progress → comment → internal note → Resolved → Closed, then the requester view', async ({ page }) => {
    // --- A requester raises the ticket -----------------------------------
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E staff operations journey')

    // --- IT Staff pick it up ---------------------------------------------
    await switchUser(page, IT_STAFF)
    await openStaffDetail(page, ticket.id)

    await expect(page.getByLabel('Current Status')).toHaveValue('New')
    await expect(page.getByLabel('Ticket Owner')).toHaveValue('')

    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(page.getByLabel('Current Status')).toHaveValue('Open')
    await expect(page.getByLabel('Ticket Owner')).not.toHaveValue('')
    await expect(page.getByRole('button', { name: 'Claim' })).toHaveCount(0)

    // --- IT Priority moves; the requested priority does not ---------------
    await page.getByLabel('IT Priority').selectOption('High')
    await expect(page.getByLabel('IT Priority')).toHaveValue('High')
    await expect(page.getByTestId('ticket-fields')).toContainText('Medium')

    // --- Status through the matrix ---------------------------------------
    await page.getByLabel('Current Status').selectOption('InProgress')
    await expect(page.getByLabel('Current Status')).toHaveValue('InProgress')

    // --- A public comment and a private note ------------------------------
    await page.getByLabel('Add public comment').fill('We are replacing the battery today.')
    await page.getByRole('button', { name: 'Post Comment' }).click()
    await expect(page.getByTestId('comment-list')).toContainText('We are replacing the battery today.')

    await page.getByRole('tab', { name: /internal notes/i }).click()
    await page.getByLabel('Add internal note').fill('Vendor RMA 12345 — do not share with the requester.')
    await page.getByRole('button', { name: 'Add Internal Note' }).click()
    await expect(page.getByTestId('note-list')).toContainText('Vendor RMA 12345')

    // --- Resolved and Closed, both behind a confirmation ------------------
    await page.getByLabel('Current Status').selectOption('Resolved')
    const resolveDialog = page.getByRole('dialog')
    await expect(resolveDialog).toContainText(/Resolved/)
    await resolveDialog.getByRole('button', { name: /^confirm$/i }).click()
    await expect(page.getByLabel('Current Status')).toHaveValue('Resolved')

    await page.getByLabel('Current Status').selectOption('Closed')
    await page.getByRole('dialog').getByRole('button', { name: /^confirm$/i }).click()
    await expect(page.getByLabel('Current Status')).toHaveValue('Closed')
    await expect(page.getByTestId('ticket-fields')).toContainText('Closed')

    // --- The requester sees the comment and the status, never the note ----
    await switchUser(page, REQUESTER_A)
    await page.goto(`/tickets/${ticket.id}`)

    await expect(page.getByTestId('comment-list')).toContainText('We are replacing the battery today.')
    await expect(page.getByTestId('ticket-fields')).toContainText('Closed')
    await expect(page.getByTestId('ticket-fields')).toContainText('IT High')
    await expect(page.locator('body')).not.toContainText('Vendor RMA 12345')
    await expect(page.getByText(/internal note/i)).toHaveCount(0)

    // The API agrees: the notes endpoint is closed to the requester (BR-23).
    const notes = await page.request.get(
      `http://localhost:5000/api/staff/tickets/${ticket.id}/internal-notes`,
    )
    expect(notes.status()).toBe(403)
    expect(JSON.stringify(await notes.json())).not.toContain('Vendor RMA')
  })

  test('the owner rule: In Progress and Resolved are not offered while unassigned (AC-22)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E owner rule')

    await switchUser(page, IT_STAFF)
    await openStaffDetail(page, ticket.id)

    const status = page.getByLabel('Current Status')
    await expect(status.locator('option')).toHaveText(['New', 'Open', 'Cancelled'])
    await expect(page.getByTestId('owner-required-hint')).toBeVisible()

    // The server is the real guard: a direct call is refused (AC-22).
    const refused = await page.request.patch(
      `http://localhost:5000/api/staff/tickets/${ticket.id}/status`,
      { data: { status: 'InProgress' } },
    )
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error.code).toBe('INVALID_TRANSITION')
    expect((await refused.json()).error.message).toMatch(/owner/i)

    // Assigning an owner opens the ticket and unlocks the two targets (BR-31).
    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(status).toHaveValue('Open')
    await expect(status.locator('option')).toHaveText([
      'Open',
      'In Progress',
      'Waiting for Requester',
      'Resolved',
      'Cancelled',
    ])
    await expect(page.getByTestId('owner-required-hint')).toHaveCount(0)
  })

  test('a transition outside the matrix is refused and the screen keeps the real status (AC-21)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E invalid transition')

    await switchUser(page, IT_STAFF)
    await openStaffDetail(page, ticket.id)

    const refused = await page.request.patch(
      `http://localhost:5000/api/staff/tickets/${ticket.id}/status`,
      { data: { status: 'Closed' } },
    )
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error.message).toContain('New')

    await page.reload()
    await expect(page.getByLabel('Current Status')).toHaveValue('New')
  })

  test('an Administrator reads the ticket and its notes but changes nothing (BR-17)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E administrator read-only')

    await switchUser(page, IT_STAFF)
    await openStaffDetail(page, ticket.id)
    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(page.getByLabel('Ticket Owner')).not.toHaveValue('')
    await page.getByRole('tab', { name: /internal notes/i }).click()
    await page.getByLabel('Add internal note').fill('Staff-only working note.')
    await page.getByRole('button', { name: 'Add Internal Note' }).click()
    await expect(page.getByTestId('note-list')).toContainText('Staff-only working note.')

    await switchUser(page, ADMIN)
    await openStaffDetail(page, ticket.id)

    await expect(page.getByTestId('admin-readonly-note')).toBeVisible()
    await expect(page.getByTestId('operational-readonly')).toBeVisible()
    await expect(page.getByLabel('Current Status')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Claim' })).toHaveCount(0)
    await expect(page.getByLabel('Add public comment')).toHaveCount(0)

    await page.getByRole('tab', { name: /internal notes/i }).click()
    await expect(page.getByTestId('note-list')).toContainText('Staff-only working note.')
    await expect(page.getByLabel('Add internal note')).toHaveCount(0)

    // Every mutation is refused at the API too.
    for (const call of [
      page.request.post(`http://localhost:5000/api/staff/tickets/${ticket.id}/claim`),
      page.request.patch(`http://localhost:5000/api/staff/tickets/${ticket.id}/status`, {
        data: { status: 'Open' },
      }),
      page.request.post(`http://localhost:5000/api/staff/tickets/${ticket.id}/internal-notes`, {
        data: { body: 'admins cannot write' },
      }),
    ]) {
      expect((await call).status()).toBe(403)
    }
  })

  test('the staff detail lists attachments read-only, with no add or remove (AC-24)', async ({ page }) => {
    await loginAs(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E staff attachment read path')
    await page.getByLabel(/add a file/i).setInputFiles({
      name: 'evidence.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('staff read path'),
      ]),
    })
    await expect(page.getByTestId('active-attachments')).toContainText('evidence.png')

    await switchUser(page, IT_STAFF)
    await openStaffDetail(page, ticket.id)
    await page.getByRole('tab', { name: /attachments/i }).click()

    await expect(page.getByTestId('active-attachments')).toContainText('evidence.png')
    await expect(page.getByRole('button', { name: /download evidence\.png/i })).toBeVisible()
    await expect(page.getByLabel(/add a file/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^remove/i })).toHaveCount(0)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /download evidence\.png/i }).click()
    expect((await download).suggestedFilename()).toBe('evidence.png')

    // Adding and removing are refused by the API (BR-14).
    const removal = await page.request.patch(
      `http://localhost:5000/api/attachments/${ticket.id}/remove`,
      { data: { reason: 'staff should not remove' } },
    )
    expect(removal.status()).toBe(403)
  })
})
