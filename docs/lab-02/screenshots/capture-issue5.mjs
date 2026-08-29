/**
 * Captures the My Tickets evidence required for Answer Part 7 (Issue #5).
 *
 * Drives the real dev stack (Vite on :5173, Express on :5000, seeded
 * PostgreSQL) with a real browser, so every screenshot shows genuine rows — the
 * ticket numbers come from the database, not from a stub.
 *
 * Run from the repository root with the stack up:
 *   npm install playwright --no-save && npx playwright install chromium
 *   node docs/lab-02/screenshots/capture-issue5.mjs
 */
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'http://localhost:5173'
const OUT = path.dirname(fileURLToPath(import.meta.url))

const JENNIFER = 'Jennifer Anderson — Registrar'
const SARAH = 'Sarah Johnson — Finance'
/** Seeded but never given a ticket, so this requester shows the empty state. */
const MICHAEL = 'Michael Brown — Library'

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

/** Runs the real selector flow, from whatever screen we happen to be on. */
async function selectRequester(page, label) {
  await page.goto(`${APP}/select-requester`)
  await page.waitForFunction(
    () => document.querySelectorAll('#requester-select option').length > 1,
  )
  await page.selectOption('#requester-select', { label })
  await page.click('button:has-text("Continue")')
  await page.waitForURL('**/tickets')
}

/** Waits for the list request to settle into one of its three end states. */
async function waitForList(page) {
  await page.waitForSelector(
    'table.zg-table, ul.zg-ticket-cards, [data-testid="empty-state"], [data-testid="no-results-state"]',
  )
}

const run = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // --- 1. Requester A sees their own tickets ---
  await selectRequester(page, JENNIFER)
  await waitForList(page)
  await page.waitForSelector('text=TKT-2026-000014')
  await shot(page, 'list-01-requester-a-tickets.png')
  await shot(page, 'list-desktop.png')

  // --- 2. Switching to Requester B replaces the whole set (BR-04, BR-13) ---
  await page.click('button:has-text("Change Requester")')
  await page.waitForURL('**/select-requester')
  await selectRequester(page, SARAH)
  await waitForList(page)
  await page.waitForSelector('text=TKT-2026-000017')
  await shot(page, 'list-02-requester-b-tickets.png')

  // --- 3. Search plus the Category and Status dropdowns ---
  await selectRequester(page, JENNIFER)
  await waitForList(page)
  await page.selectOption('#ticket-category', { label: 'Network' })
  await page.selectOption('#ticket-status', { label: 'New' })
  await page.fill('#ticket-search', 'vpn')
  await page.waitForSelector('text=Showing 1–2 of 2 tickets')
  await shot(page, 'list-03-search-and-filters.png')

  // --- 4. Pagination controls, on page 2 of the unfiltered list ---
  await page.click('button:has-text("Clear Filters")')
  await page.waitForSelector('text=Showing 1–10 of 14 tickets')
  await page.click('button:has-text("Next")')
  await page.waitForSelector('text=Showing 11–14 of 14 tickets')
  await shot(page, 'list-04-pagination.png')

  // --- 5. Empty state: a requester who has never created a ticket ---
  await selectRequester(page, MICHAEL)
  await page.waitForSelector('[data-testid="empty-state"]')
  await shot(page, 'list-05-empty-state.png')

  // --- 6. No-results state: a search that matches nothing (AC-15) ---
  await selectRequester(page, JENNIFER)
  await waitForList(page)
  await page.fill('#ticket-search', 'quantum teleporter')
  await page.waitForSelector('[data-testid="no-results-state"]')
  await shot(page, 'list-06-no-results-state.png')
  await shot(page, 'list-no-results.png')

  // --- Responsive: the mobile card list (R-07) ---
  const mobile = await browser.newPage({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  })
  await selectRequester(mobile, JENNIFER)
  await mobile.waitForSelector('ul.zg-ticket-cards')
  await shot(mobile, 'list-mobile.png')

  await browser.close()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
