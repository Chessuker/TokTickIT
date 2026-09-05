/**
 * Captures the six Create Ticket states required for Answer Part 6.
 *
 * Drives the real dev stack (Vite on ::1:5173, Express on :5000, seeded
 * PostgreSQL) with a real Chrome, so every screenshot shows genuine data —
 * the ticket numbers come from the database, not from a stub.
 */
import { chromium } from 'playwright'
import path from 'node:path'

const APP = 'http://[::1]:5173'
const OUT = path.resolve('D:/OpalFolder/KMUTT/CPE334/TokTickIT/docs/lab-02/screenshots')

const SUMMARY = 'Laptop battery drains quickly'
const DESCRIPTION = 'The battery drops from 100% to 20% within an hour of unplugging.'

/**
 * A full-page screenshot flattens the document, which lets the sticky header
 * sit on top of the form instead of above it. Pinning it to `static` for the
 * capture shows the page as a user actually sees it while scrolled to the top.
 */
async function shot(page, name) {
  await page.addStyleTag({ content: '.zg-header { position: static !important; }' })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
  console.log('saved', name)
}

async function fillValidForm(page) {
  await page.fill('#summary', SUMMARY)
  await page.fill('#description', DESCRIPTION)
  await page.selectOption('#categoryId', { label: 'Hardware' })
  await page.selectOption('#relatedSystemId', { label: 'Corporate Laptop' })
  await page.check('input[name="priority"][value="High"]')
}

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // --- select the Development Requester (Issue #3 guard) ---
  await page.goto(`${APP}/select-requester`)
  // Options are never "visible" to Playwright, so wait on the count instead.
  await page.waitForFunction(() => document.querySelectorAll('#requester-select option').length > 1)
  await page.selectOption('#requester-select', { label: 'Jennifer Anderson — Registrar' })
  await page.click('button:has-text("Continue")')
  await page.waitForURL('**/tickets')

  // --- 1. empty form with master data loaded ---
  await page.goto(`${APP}/tickets/new`)
  await page.waitForSelector('#categoryId:not([disabled])')
  await page.waitForFunction(() => document.querySelectorAll('#relatedSystemId option').length > 1)
  await shot(page, 'create-01-master-data-loaded.png')

  // --- 2. validation errors under the fields ---
  await page.click('button[type="submit"]')
  await page.waitForSelector('#summary-error')
  await shot(page, 'create-02-validation-errors.png')

  // --- 3. submitting / busy, then 4. success with the real ticket number ---
  // The POST is delayed rather than faked, so the busy state is caught in
  // flight and the ticket still lands in PostgreSQL.
  await page.reload()
  await page.waitForSelector('#categoryId:not([disabled])')
  await fillValidForm(page)

  await page.route('**/api/tickets', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 3500))
    await route.continue()
  })

  await page.click('button[type="submit"]')
  await page.waitForSelector('button[type="submit"][disabled]')
  await shot(page, 'create-03-submitting-busy.png')

  await page.waitForSelector('.zg-ticket-number', { timeout: 15000 })
  const ticketNumber = await page.textContent('.zg-ticket-number')
  await shot(page, 'create-04-success-ticket-number.png')
  await page.unroute('**/api/tickets')

  // --- 5. backend failure: values must survive (AC-12) ---
  await page.click('button:has-text("Create another ticket")')
  await page.waitForSelector('#summary')
  await fillValidForm(page)

  await page.route('**/api/tickets', (route) =>
    route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
  )
  await page.click('button[type="submit"]')
  await page.waitForSelector('.zg-callout-error')
  await shot(page, 'create-05-backend-failure-preserved.png')

  const preserved = {
    summary: await page.inputValue('#summary'),
    description: await page.inputValue('#description'),
    categoryId: await page.inputValue('#categoryId'),
    relatedSystemId: await page.inputValue('#relatedSystemId'),
    priority: await page.getAttribute('input[name="priority"]:checked', 'value'),
  }
  await page.unroute('**/api/tickets')

  // --- 6. attachments: one accepted, two rejected ---
  // Reloaded first so the previous state's error callout does not bleed into
  // a screenshot that is only about file selection.
  await page.reload()
  await page.waitForSelector('#categoryId:not([disabled])')
  await fillValidForm(page)

  // Dropped through a DataTransfer so the oversized and wrong-type files reach
  // the component; the file input's `accept` list would filter them out first.
  await page.evaluate(() => {
    const mk = (name, type, size) => {
      const f = new File([new Uint8Array(1)], name, { type })
      Object.defineProperty(f, 'size', { value: size })
      return f
    }
    const dt = new DataTransfer()
    for (const f of [
      mk('screenshot.png', 'image/png', 120 * 1024),
      mk('huge-scan.pdf', 'application/pdf', 6 * 1024 * 1024),
      mk('payload.exe', 'application/x-msdownload', 2048),
    ]) dt.items.add(f)
    document
      .querySelector('.zg-dropzone')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
  await page.waitForSelector('.zg-rejected-list li')
  await shot(page, 'create-06-attachments-valid-invalid.png')

  console.log(JSON.stringify({ ticketNumber, preserved }, null, 2))
  await browser.close()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
