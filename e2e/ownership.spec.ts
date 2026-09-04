import { expect, test } from '@playwright/test'
import { changeRequester, createTicket, REQUESTER_A, REQUESTER_B, selectRequester } from './helpers'

/**
 * E2E-03 — the ownership guard (AC-03, BR-04).
 *
 * Requester A creates a ticket; Requester B then pastes its URL. The refusal
 * has to hold on the screen *and* at the API, so both are asserted: a UI that
 * hid the data while the endpoint still served it would pass a screenshot test
 * and fail the requirement.
 */

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('owned by requester A'),
])

test.describe("Ownership guard (E2E-03)", () => {
  test("opening another requester's ticket shows access denied", async ({ page }) => {
    await selectRequester(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E ownership guard')

    await changeRequester(page, REQUESTER_B)
    await page.goto(ticket.url)

    await expect(page.getByTestId('access-denied')).toBeVisible()
    await expect(page.getByRole('heading', { name: /access denied/i })).toBeVisible()

    // Nothing about the ticket leaks onto the refusal screen.
    await expect(page.getByText(ticket.ticketNumber)).toHaveCount(0)
    await expect(page.getByText('E2E ownership guard')).toHaveCount(0)
    await expect(page.getByTestId('ticket-fields')).toHaveCount(0)
  })

  test("another requester cannot download the owner's attachment", async ({ page, request }) => {
    await selectRequester(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E ownership of attachments')

    await page.getByLabel(/add a file/i).setInputFiles({
      name: 'private.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    })
    await expect(page.getByTestId('active-attachments')).toBeVisible()

    const ownerId = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('toktickit.requester')
      return raw ? (JSON.parse(raw) as { id: string }).id : ''
    })

    const detail = await request.get(`http://localhost:5000/api/tickets/${ticket.id}`, {
      headers: { 'X-Requester-Id': ownerId },
    })
    const attachmentId = (await detail.json()).attachments[0].id as string

    await changeRequester(page, REQUESTER_B)
    const intruderId = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('toktickit.requester')
      return raw ? (JSON.parse(raw) as { id: string }).id : ''
    })

    const refusedTicket = await request.get(`http://localhost:5000/api/tickets/${ticket.id}`, {
      headers: { 'X-Requester-Id': intruderId },
    })
    expect(refusedTicket.status()).toBe(403)

    const refusedDownload = await request.get(
      `http://localhost:5000/api/attachments/${attachmentId}/download`,
      { headers: { 'X-Requester-Id': intruderId } },
    )
    expect(refusedDownload.status()).toBe(403)
    expect(refusedDownload.headers()['content-disposition']).toBeUndefined()
  })

  test('the requester still sees their own ticket after the switch back', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)
    const ticket = await createTicket(page, 'E2E ownership round trip')

    await changeRequester(page, REQUESTER_B)
    await page.goto(ticket.url)
    await expect(page.getByTestId('access-denied')).toBeVisible()

    await page.goto('/tickets')
    await changeRequester(page, REQUESTER_A)
    await page.goto(ticket.url)

    await expect(page.getByTestId('ticket-fields')).toBeVisible()
    await expect(page.getByText(ticket.ticketNumber).first()).toBeVisible()
  })
})
