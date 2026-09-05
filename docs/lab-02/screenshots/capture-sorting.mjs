/**
 * Captures the sort control in use for Answer Part 7.
 *
 * The other Part 7 captures were taken during Issue #5 against a 14-ticket
 * dataset; this one is later and the database has grown, so it is kept as its
 * own image rather than folded in with them. What it has to show is the same
 * either way: changing the sort re-queries the server and the order changes.
 *
 * Run from the repository root with the stack up:
 *   node docs/lab-02/screenshots/capture-sorting.mjs
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

/** Reads the priority column so the captured order can be printed, not assumed. */
async function priorities(page) {
  return page.$$eval('.zg-table tbody tr td:nth-child(5)', (cells) =>
    cells.map((c) => c.textContent.trim()),
  )
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(`${APP}/select-requester`)
await page.waitForFunction(() => document.querySelectorAll('#requester-select option').length > 1)
const value = await page
  .locator('#requester-select option')
  .filter({ hasText: 'Jennifer Anderson' })
  .first()
  .getAttribute('value')
await page.selectOption('#requester-select', value)
await page.getByRole('button', { name: /continue/i }).click()
await page.locator('.zg-table').waitFor()

console.log('default (Newest first):', await priorities(page))

// Priority, High first — the ordering the server applies, not a client sort.
await page.selectOption('#ticket-sort', 'priority:desc')
await page.waitForFunction(
  () => !document.querySelector('.zg-loading'),
  null,
  { timeout: 5000 },
).catch(() => {})
await page.waitForTimeout(600)
console.log('priority:desc:', await priorities(page))
await shot(page, 'list-07-sort-priority-desc.png')

// And the reverse, to show the control drives the query rather than a toggle.
await page.selectOption('#ticket-sort', 'priority:asc')
await page.waitForTimeout(600)
console.log('priority:asc:', await priorities(page))
await shot(page, 'list-08-sort-priority-asc.png')

await browser.close()
