/**
 * Captures the Development Requester selector states required for Answer
 * Part 5, whose points are graded inside Part 6.
 *
 * Four states, all against the running stack: the loaded selector with its
 * active-only dropdown open, the loading state, the failure state with its
 * Retry control, and the application shell showing the selected requester with
 * the Change Requester action.
 *
 * The loading and failure states are produced by intercepting
 * `GET /api/requesters` — delaying it, and failing it — rather than by editing
 * the component. What is captured is the real screen reacting to a real slow or
 * broken response.
 *
 * Run from the repository root with the stack up:
 *   npm run dev:server   (in one terminal)
 *   npm run dev:client   (in another)
 *   node docs/lab-02/screenshots/capture-part5.mjs
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'http://localhost:5173'
const OUT = path.dirname(fileURLToPath(import.meta.url))

async function shot(page, name) {
  await page.addStyleTag({ content: '.zg-header { position: static !important; }' })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
  console.log('saved', name)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })

// --- 1. Loaded selector, active requesters only -----------------------------
const page = await context.newPage()
await page.goto(`${APP}/select-requester`)
await page.waitForFunction(() => document.querySelectorAll('#requester-select option').length > 1)

const options = await page.locator('#requester-select option').allInnerTexts()
console.log('dropdown options:', options)

await shot(page, 'selector-01-active-users.png')

// --- 2. Loading state -------------------------------------------------------
const slow = await context.newPage()
await slow.route('**/api/requesters', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 4000))
  await route.continue()
})
await slow.goto(`${APP}/select-requester`, { waitUntil: 'commit' })
await slow.locator('.zg-loading').waitFor()
await shot(slow, 'selector-02-loading.png')
await slow.close()

// --- 3. Failure state -------------------------------------------------------
const broken = await context.newPage()
await broken.route('**/api/requesters', (route) => route.abort('failed'))
await broken.goto(`${APP}/select-requester`)
await broken.locator('.zg-callout-error').waitFor()
await shot(broken, 'selector-03-failure.png')
await broken.close()

// --- 4. Selected requester in the application shell -------------------------
const value = await page
  .locator('#requester-select option')
  .filter({ hasText: 'Jennifer Anderson' })
  .first()
  .getAttribute('value')
await page.selectOption('#requester-select', value)
await page.getByRole('button', { name: /continue/i }).click()
await page.locator('.zg-requester-name').filter({ hasText: 'Jennifer Anderson' }).waitFor()
await page.locator('.zg-table, .zg-ticket-cards').first().waitFor()
await shot(page, 'selector-04-shell-change-requester.png')

await browser.close()
