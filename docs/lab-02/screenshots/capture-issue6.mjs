/**
 * Captures the Ticket Detail and attachment-lifecycle evidence required for
 * Answer Part 8 (Issue #6).
 *
 * Drives the real dev stack (Vite on :5173, Express on :5000, seeded
 * PostgreSQL) with a real browser: the ticket number, the stored files and the
 * removal metadata all come from the database, not from a stub.
 *
 * Run from the repository root with the stack up:
 *   docker compose up -d && npm run prisma:migrate && npm run prisma:seed
 *   npm run dev:server   (in one terminal)
 *   npm run dev:client   (in another)
 *   node docs/lab-02/screenshots/capture-issue6.mjs
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'http://localhost:5173'
const OUT = path.dirname(fileURLToPath(import.meta.url))

const JENNIFER = 'Jennifer Anderson'
const SARAH = 'Sarah Johnson'

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('answer part 8 evidence pixels'),
])
const PDF_BYTES = Buffer.from('%PDF-1.7\nbattery diagnostics report\n%%EOF\n')

/**
 * A full-page screenshot flattens the document, which lets the sticky header
 * sit on top of the content instead of above it. Pinning it to `static` for the
 * capture shows the page as a user actually sees it while scrolled to the top.
 */
async function shot(page, name) {
  await page.addStyleTag({ content: '.zg-header { position: static !important; }' })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
  console.log('saved', name)
}

/**
 * Viewport-only capture, used for the modal: a full-page screenshot flattens
 * `position: fixed`, so the dimmed backdrop stops covering the part of the page
 * that scrolled past. What the modal actually looks like is the viewport.
 */
async function viewportShot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) })
  console.log('saved', name)
}

async function chooseRequester(page, name) {
  await page.waitForFunction(
    () => document.querySelectorAll('#requester-select option').length > 1,
  )
  const value = await page
    .locator('#requester-select option')
    .filter({ hasText: name })
    .first()
    .getAttribute('value')

  await page.selectOption('#requester-select', value)
  await page.getByRole('button', { name: /continue/i }).click()
  // Below 768px the requester name lives in the collapsed menu, so the wait
  // is on it being in the DOM rather than on screen.
  await page
    .locator('.zg-requester-name')
    .filter({ hasText: name })
    .waitFor({ state: 'attached' })
}

async function selectRequester(page, name) {
  await page.goto(`${APP}/select-requester`)
  await chooseRequester(page, name)
}

async function changeRequester(page, name) {
  await page.getByRole('button', { name: /change requester/i }).first().click()
  await page.waitForURL('**/select-requester')
  await chooseRequester(page, name)
}

/** Creates a ticket through the real form and opens its detail screen. */
async function createTicket(page, summary, description) {
  await page.goto(`${APP}/tickets/new`)
  await page.fill('#summary', summary)
  await page.fill('#description', description)
  await page.waitForFunction(
    () => document.querySelectorAll('#categoryId option').length > 1,
  )
  await page.selectOption('#categoryId', { index: 1 })
  await page.selectOption('#relatedSystemId', { index: 1 })
  await page.getByRole('radio', { name: 'High' }).check()
  await page.getByRole('button', { name: /^create ticket$/i }).click()

  await page.getByRole('link', { name: /view ticket/i }).click()
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}$/)
  await page.getByTestId('ticket-fields').waitFor()
  return page.url()
}

async function attach(page, name, mimeType, buffer) {
  await page.setInputFiles('#add-attachment', { name, mimeType, buffer })
  await page.getByTestId('active-attachments').getByText(name).waitFor()
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  })
  const page = await context.newPage()

  await selectRequester(page, JENNIFER)

  const ticketUrl = await createTicket(
    page,
    'Laptop battery drains within an hour',
    'The battery drops from 100% to 20% within an hour of unplugging, even with the screen dimmed. It started after the last firmware update.',
  )

  // 1 — the ticket detail of a ticket the requester owns, read-only.
  await shot(page, 'detail-01-read-only.png')

  // 2 — a new file attached to the existing ticket.
  await attach(page, 'battery-diagnostics.pdf', 'application/pdf', PDF_BYTES)
  await attach(page, 'battery-graph.png', 'image/png', PNG_BYTES)
  await shot(page, 'detail-02-attachment-added.png')

  // 3 — downloading an active attachment. The response is delayed so the
  // in-flight state is visible; the download itself is real and its bytes are
  // written next to the screenshots as evidence.
  await page.route('**/api/attachments/*/download', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /download battery-diagnostics\.pdf/i }).click()
  await page.getByRole('button', { name: /downloading battery-diagnostics\.pdf/i }).waitFor()
  await shot(page, 'detail-03-download.png')

  const download = await downloading
  const savedTo = path.join(OUT, 'detail-03-downloaded-file.pdf')
  await download.saveAs(savedTo)
  console.log('downloaded', download.suggestedFilename(), '->', savedTo)
  await page.unroute('**/api/attachments/*/download')

  // 4 — the removal modal, with Confirm still disabled before a reason is typed
  // and enabled after, captured with the reason in place.
  await page.getByRole('button', { name: /remove battery-graph\.png/i }).click()
  await page.getByRole('dialog').waitFor()
  // Confirm is disabled while the reason is empty (AC-09) — captured before
  // anything is typed, then again with the reason in place.
  await viewportShot(page, 'detail-04-remove-modal-empty.png')

  await page.fill('#removal-reason', 'Uploaded the wrong graph — it shows last month, not this week.')
  await viewportShot(page, 'detail-04-remove-modal.png')

  // 5 — the same file after a soft removal: muted, with reason and timestamp,
  // and no download control.
  await page.getByRole('button', { name: /confirm removal/i }).click()
  await page.getByTestId('removed-attachments').waitFor()
  await shot(page, 'detail-05-removed-attachment.png')

  // 6 — the same URL opened as a different requester.
  await changeRequester(page, SARAH)
  await page.goto(ticketUrl)
  await page.getByTestId('access-denied').waitFor()
  await shot(page, 'detail-06-access-denied.png')

  // 6b — the API refusing the same requests directly, so the guard is shown to
  // live on the server rather than in the screen.
  const requesterId = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('toktickit.requester')
    return raw ? JSON.parse(raw).id : ''
  })
  const ticketId = ticketUrl.split('/').pop()
  const probe = await page.request.get(`http://localhost:5000/api/tickets/${ticketId}`, {
    headers: { 'X-Requester-Id': requesterId },
  })
  console.log('GET /api/tickets/:id as Sarah ->', probe.status(), await probe.text())

  // Responsive evidence for tests.md R-08 … R-10.
  await changeRequester(page, JENNIFER)
  await page.goto(ticketUrl)
  await page.getByTestId('ticket-fields').waitFor()
  await shot(page, 'detail-desktop.png')

  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    acceptDownloads: true,
  })
  const mobilePage = await mobile.newPage()
  await selectRequester(mobilePage, JENNIFER)
  await mobilePage.goto(ticketUrl)
  await mobilePage.getByTestId('ticket-fields').waitFor()
  await shot(mobilePage, 'detail-mobile.png')

  await mobilePage.getByRole('button', { name: /remove battery-diagnostics\.pdf/i }).click()
  await mobilePage.getByRole('dialog').waitFor()
  await mobilePage.fill('#removal-reason', 'Superseded by the vendor report.')
  await viewportShot(mobilePage, 'remove-modal-mobile.png')

  const overflow = await mobilePage.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  console.log('mobile overflow check', overflow)

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
