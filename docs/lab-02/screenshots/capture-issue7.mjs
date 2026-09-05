/**
 * Captures the responsive evidence required for Answer Part 9 (Issue #7).
 *
 * Three screens at three breakpoints, against the running stack with a real
 * database: Create Ticket, My Tickets and Ticket Detail at desktop (1280 px),
 * tablet (820 px) and mobile (375 px). The measured body scroll width at each
 * stop is printed, so V-03 is recorded as a number rather than as an opinion.
 *
 * Run from the repository root with the stack up:
 *   docker compose up -d && npm run prisma:migrate && npm run prisma:seed
 *   npm run dev:server   (in one terminal)
 *   npm run dev:client   (in another)
 *   node docs/lab-02/screenshots/capture-issue7.mjs
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'http://localhost:5173'
const OUT = path.dirname(fileURLToPath(import.meta.url))

const REQUESTER = 'Jennifer Anderson'

const BREAKPOINTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 820, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
]

/**
 * A full-page screenshot flattens the document, which lets the sticky header
 * sit on top of the content instead of above it. Pinning it to `static` for the
 * capture shows the page as a user actually sees it while scrolled to the top.
 */
async function shot(page, name) {
  await page.addStyleTag({ content: '.zg-header { position: static !important; }' })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  console.log(
    'saved',
    name.padEnd(34),
    `body ${overflow.scrollWidth}px / viewport ${overflow.innerWidth}px`,
    overflow.scrollWidth > overflow.innerWidth ? 'OVERFLOW' : 'no overflow',
  )
}

async function selectRequester(page) {
  await page.goto(`${APP}/select-requester`)
  await page.waitForFunction(() => document.querySelectorAll('#requester-select option').length > 1)
  const value = await page
    .locator('#requester-select option')
    .filter({ hasText: REQUESTER })
    .first()
    .getAttribute('value')
  await page.selectOption('#requester-select', value)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('.zg-requester-name').filter({ hasText: REQUESTER }).waitFor({ state: 'attached' })
}

const browser = await chromium.launch()

// One ticket id, reused at every breakpoint, so the three detail captures show
// the same ticket rather than three different ones.
const finder = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const finderPage = await finder.newPage()
await selectRequester(finderPage)
await finderPage.goto(`${APP}/tickets`)
await finderPage.locator('.zg-table a').first().click()
await finderPage.waitForURL(/\/tickets\/[0-9a-f-]{36}$/)
const ticketUrl = finderPage.url()
await finder.close()
console.log('detail ticket:', ticketUrl, '\n')

for (const breakpoint of BREAKPOINTS) {
  const context = await browser.newContext({
    viewport: { width: breakpoint.width, height: breakpoint.height },
  })
  const page = await context.newPage()
  await selectRequester(page)

  await page.goto(`${APP}/tickets/new`)
  await page.locator('#summary').waitFor()
  // A field filled in and the dropdowns loaded, so the capture shows a form in
  // use rather than an empty one.
  await page.fill('#summary', 'Projector in CB2-401 will not detect the laptop')
  await page.fill(
    '#description',
    'The projector shows "no signal" with every cable, on two different laptops. It worked last week.',
  )
  await page.waitForFunction(() => document.querySelectorAll('#categoryId option').length > 1)
  await page.selectOption('#categoryId', { label: 'Hardware' })
  await page.selectOption('#relatedSystemId', { label: 'Corporate Laptop' })
  await page.getByRole('radio', { name: 'High' }).check()
  await shot(page, `create-${breakpoint.name}.png`)

  await page.goto(`${APP}/tickets`)
  await page.locator('.zg-table, .zg-ticket-cards').first().waitFor()
  await shot(page, `list-${breakpoint.name}.png`)

  await page.goto(ticketUrl)
  await page.getByTestId('ticket-fields').waitFor()
  await shot(page, `detail-${breakpoint.name}.png`)

  await context.close()
}

// --- Requester selector, desktop and mobile (R-01, R-02) --------------------
for (const breakpoint of [BREAKPOINTS[0], BREAKPOINTS[2]]) {
  const context = await browser.newContext({
    viewport: { width: breakpoint.width, height: breakpoint.height },
  })
  const page = await context.newPage()
  await page.goto(`${APP}/select-requester`)
  await page.waitForFunction(() => document.querySelectorAll('#requester-select option').length > 1)
  await shot(page, `selector-${breakpoint.name}.png`)
  await context.close()
}

// --- Mobile header with the compact menu open (R-11) ------------------------
const headerContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
const headerPage = await headerContext.newPage()
await selectRequester(headerPage)
await headerPage.goto(`${APP}/tickets`)
await headerPage.locator('.zg-ticket-cards').waitFor()
await headerPage.getByRole('button', { name: /menu/i }).click()
await headerPage.locator('.zg-requester-name').waitFor()
await shot(headerPage, 'header-mobile.png')
await headerContext.close()

await browser.close()
