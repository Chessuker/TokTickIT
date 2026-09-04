import { expect, test } from '@playwright/test'
import { createTicket, REQUESTER_A, selectRequester } from './helpers'

/**
 * E2E-02 — the attachment lifecycle (AC-09, BR-06 … BR-10).
 *
 * One journey, in the order a requester actually lives it: attach a file,
 * download it, remove it with a reason, then find that the same file can no
 * longer be downloaded while its record is still on the page.
 */

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('end-to-end pixels'),
])

test.describe('Attachment lifecycle (E2E-02)', () => {
  test('upload, download, remove with a reason, then download is refused', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)
    await createTicket(page, 'E2E attachment lifecycle')

    // --- Upload -----------------------------------------------------------
    await page.getByLabel(/add a file/i).setInputFiles({
      name: 'evidence.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    })

    const active = page.getByTestId('active-attachments')
    await expect(active.getByText('evidence.png')).toBeVisible()

    // --- Download ---------------------------------------------------------
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: /download evidence\.png/i }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('evidence.png')

    // --- Soft removal, with the reason the modal insists on ---------------
    await page.getByRole('button', { name: /remove evidence\.png/i }).click()

    const dialog = page.getByRole('dialog')
    const confirm = dialog.getByRole('button', { name: /confirm removal/i })
    await expect(confirm).toBeDisabled()

    await dialog.getByLabel(/reason for removal/i).fill('Uploaded the wrong screenshot')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    // --- The record survives; the file does not -------------------------
    const removed = page.getByTestId('removed-attachments')
    await expect(removed.getByText('evidence.png')).toBeVisible()
    await expect(removed.getByText('Uploaded the wrong screenshot')).toBeVisible()
    await expect(removed.getByText('Removed', { exact: true })).toBeVisible()
    await expect(removed.getByRole('button', { name: /download/i })).toHaveCount(0)
    await expect(page.getByTestId('active-attachments')).toHaveCount(0)
  })

  test('a removed attachment is refused by the API as well as hidden in the UI', async ({
    page,
    request,
  }) => {
    await selectRequester(page, REQUESTER_A)
    await createTicket(page, 'E2E removed attachment stays unreachable')

    await page.getByLabel(/add a file/i).setInputFiles({
      name: 'to-be-removed.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    })
    await expect(page.getByTestId('active-attachments')).toBeVisible()

    // The requester id the app stored is also what the API expects, so the
    // direct request below is exactly what the browser would have sent.
    const requesterId = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('toktickit.requester')
      return raw ? (JSON.parse(raw) as { id: string }).id : ''
    })
    const ticketId = page.url().split('/').pop() as string

    const before = await request.get(`http://localhost:5000/api/tickets/${ticketId}`, {
      headers: { 'X-Requester-Id': requesterId },
    })
    const attachmentId = (await before.json()).attachments[0].id as string

    await page.getByRole('button', { name: /remove to-be-removed\.png/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/reason for removal/i).fill('Contained personal data')
    await dialog.getByRole('button', { name: /confirm removal/i }).click()
    await expect(page.getByTestId('removed-attachments')).toBeVisible()

    // BR-09 — the bytes are unreachable even by direct request (API-11).
    const refused = await request.get(
      `http://localhost:5000/api/attachments/${attachmentId}/download`,
      { headers: { 'X-Requester-Id': requesterId } },
    )
    expect(refused.status()).toBe(403)

    // BR-10 — the metadata is not: the record of the removal survives.
    const metadata = await request.get(`http://localhost:5000/api/attachments/${attachmentId}`, {
      headers: { 'X-Requester-Id': requesterId },
    })
    expect(metadata.status()).toBe(200)
    const body = await metadata.json()
    expect(body.isRemoved).toBe(true)
    expect(body.removedReason).toBe('Contained personal data')
    expect(body.downloadUrl).toBeNull()
  })

  test('rejects a disallowed file type without attaching it (AC-07)', async ({ page }) => {
    await selectRequester(page, REQUESTER_A)
    await createTicket(page, 'E2E rejected file type')

    await page.getByLabel(/add a file/i).setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('plain text is not on the list'),
    })

    await expect(page.getByText(/unsupported file type/i)).toBeVisible()
    await expect(page.getByTestId('active-attachments')).toHaveCount(0)
  })
})
