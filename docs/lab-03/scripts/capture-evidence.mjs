/**
 * Captures the demonstration screenshots for Answer Parts 5 – 8 (lab sheet §14)
 * against the running stack, driving the real screens the way a user would.
 *
 * Where the point of a screenshot is *where* the browser ended up (a redirect
 * after logout, a forbidden route), a thin bar is drawn across the top of the
 * page showing the URL — a screenshot has no address bar of its own. The bar is
 * the only thing this script adds to a page.
 *
 * Three kinds of state are staged, and each says which it is:
 *
 * - A **real** `409` comes from the server (unassigning an In Progress ticket,
 *   a duplicate email, the last-Administrator guard).
 * - A **stopped backend** is simulated by aborting the request in the browser,
 *   which is exactly what the page sees when the API is down: the fetch rejects
 *   and no response arrives (AC-34).
 * - The **empty queue** is the one substituted response: a seeded system always
 *   has tickets, so that single request is answered with an empty page to show
 *   the state the screen draws for it. The URL bar on that screenshot says so.
 *
 * Every account and ticket this script creates is new (users are never deleted,
 * BR-27), so it can be re-run; the seeded tickets are only read.
 *
 * Run from the repository root with the stack up and freshly seeded:
 *   npm run prisma:seed
 *   node docs/lab-03/scripts/capture-evidence.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHOTS = path.join(ROOT, 'artifacts', 'lab-03', 'screenshots')
const WEB = 'http://localhost:5173'
const API = 'http://localhost:5000'

const ACCOUNTS = {
  jennifer: { email: 'jennifer.anderson@kmutt.ac.th', password: 'Requester1!' },
  alex: { email: 'alex.smith@kmutt.ac.th', password: 'Welcome123!' },
  michael: { email: 'michael.brown@kmutt.ac.th', password: 'Welcome123!' },
  priya: { email: 'priya.raman@kmutt.ac.th', password: 'Staff1!pass' },
  admin: { email: 'admin@toktickit.xyz', password: 'Admin1!pass' },
}

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 375, height: 812 }

/** A short suffix that keeps this run's accounts and tickets unique. */
const STAMP = Date.now().toString(36).slice(-5)

for (const folder of ['authentication', 'staff-queue', 'staff-ticket-detail', 'user-management']) {
  mkdirSync(path.join(SHOTS, folder), { recursive: true })
}

const browser = await chromium.launch()
let count = 0

/** Saves one screenshot and says so. */
async function shot(page, file, { fullPage = false } = {}) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, file), fullPage })
  count += 1
  console.log('  ', file)
}

/** Draws the URL (and an optional note) across the top of the page. */
async function showUrl(page, note = '') {
  await page.evaluate(
    ({ note }) => {
      document.getElementById('zg-evidence-bar')?.remove()
      const bar = document.createElement('div')
      bar.id = 'zg-evidence-bar'
      bar.textContent = `URL: ${location.pathname}${location.search}${note ? `   —   ${note}` : ''}`
      Object.assign(bar.style, {
        position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '9999',
        background: '#111827', color: '#f9fafb', font: '600 13px Consolas, monospace',
        padding: '6px 12px',
      })
      document.body.appendChild(bar)
    },
    { note },
  )
}

async function newPage(viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  return context.newPage()
}

async function fillLogin(page, account) {
  await page.goto(`${WEB}/login`)
  await page.getByLabel(/email address/i).fill(account.email)
  await page.getByLabel(/^password/i).fill(account.password)
}

async function login(page, account, landing) {
  await fillLogin(page, account)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(`**${landing}`)
}

/** An API client signed in as `account`, for setting up data quickly. */
async function apiAs(account) {
  const context = await browser.newContext()
  const res = await context.request.post(`${API}/api/auth/login`, { data: account })
  if (!res.ok()) throw new Error(`login failed for ${account.email}: ${res.status()}`)
  return context.request
}

// ---------------------------------------------------------------------------
// Answer Part 5 — Login and Password Change
// ---------------------------------------------------------------------------
console.log('Part 5 — authentication')
{
  const page = await newPage()

  // Invalid credentials: one generic message, the email kept, the password cleared.
  await fillLogin(page, { email: ACCOUNTS.jennifer.email, password: 'WrongPassword1!' })
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByRole('alert').waitFor()
  await shot(page, 'authentication/p5-01-invalid-login.png')

  // Inactive account with the right password.
  await fillLogin(page, ACCOUNTS.alex)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByText(/this account is inactive/i).waitFor()
  await shot(page, 'authentication/p5-02-inactive-account.png')

  // Busy state: the login request is held for two seconds so it can be seen.
  await page.route('**/api/auth/login', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    await route.continue()
  })
  await fillLogin(page, ACCOUNTS.jennifer)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByText(/signing in/i).waitFor()
  await shot(page, 'authentication/p5-03-busy-signing-in.png')
  await page.waitForURL('**/tickets')
  await page.unroute('**/api/auth/login')
  await page.context().clearCookies()

  // Safe failure: the backend is unreachable.
  await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'))
  await fillLogin(page, ACCOUNTS.jennifer)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByText(/something went wrong/i).waitFor()
  await shot(page, 'authentication/p5-04-safe-failure.png')
  await page.unroute('**/api/auth/login')

  // Mandatory first-password change (Michael is never submitted, so re-runnable).
  await login(page, ACCOUNTS.michael, '/change-password')
  await page.getByLabel(/^current/i).fill(ACCOUNTS.michael.password)
  await page.getByLabel(/^new password/i).fill('Newpass1')
  await page.getByLabel(/^confirm new password/i).fill('Newpass2')
  await page.getByRole('button', { name: /continue/i }).click()
  await showUrl(page, 'forced: no navigation, only Log out')
  await shot(page, 'authentication/p5-05-forced-change-validation.png', { fullPage: true })

  // Trying to leave is refused until the change is made.
  await page.goto(`${WEB}/tickets`)
  await page.waitForURL('**/change-password')
  await showUrl(page, 'visited /tickets — sent back to Change Password')
  await shot(page, 'authentication/p5-06-forced-change-blocks-app.png')
  await page.context().close()
}
{
  const page = await newPage()

  // Authenticated user and role in the shell, with the profile menu open.
  await login(page, ACCOUNTS.jennifer, '/tickets')
  await page.locator('.zg-profile-button').click()
  await page.getByRole('menuitem', { name: /log out/i }).waitFor()
  await shot(page, 'authentication/p5-07-user-and-role-in-shell.png')

  // Logout, then Back and a direct URL both land on Login.
  await page.getByRole('menuitem', { name: /log out/i }).click()
  await page.waitForURL('**/login')
  await page.goto(`${WEB}/tickets`)
  await page.waitForURL(/\/login/)
  await showUrl(page, 'after logout: /tickets redirects to Login')
  await shot(page, 'authentication/p5-08-direct-access-after-logout.png')

  const direct = await page.request.get(`${API}/api/tickets`)
  console.log(`   GET /api/tickets after logout → ${direct.status()}`)
  await page.context().close()
}

// ---------------------------------------------------------------------------
// Answer Part 6 — IT Staff Ticket Queue
// ---------------------------------------------------------------------------
console.log('Part 6 — ticket queue')
{
  const page = await newPage()
  await login(page, ACCOUNTS.priya, '/staff/queue')

  const seeded = `${WEB}/staff/queue?search=TKT-2026-9000`

  // Realistic data: both owned and unassigned rows, every badge.
  await page.goto(seeded)
  await page.getByTestId('queue-table').waitFor()
  await shot(page, 'staff-queue/p6-01-realistic-data.png', { fullPage: true })

  // Search.
  await page.goto(`${WEB}/staff/queue`)
  await page.getByTestId('queue-table').waitFor()
  await page.getByLabel('Search').fill('VPN')
  await page.getByText(/Showing 1 to 2 of 2/).waitFor()
  await showUrl(page, 'search=VPN (ticket number or summary)')
  await shot(page, 'staff-queue/p6-02-search.png')

  // Filters: two status chips (OR) and owner = me.
  await page.goto(seeded)
  await page.getByRole('button', { name: /^filters/i }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'In Progress', exact: true }).click()
  await page.getByLabel('Owner').selectOption('me')
  await page.waitForTimeout(600)
  await page.getByTestId('queue-table').waitFor()
  await showUrl(page, 'status=Open OR InProgress, owner=me')
  await shot(page, 'staff-queue/p6-03-filters.png', { fullPage: true })

  // Sort by clicking a header: IT Priority, High first.
  await page.goto(seeded)
  await page.getByTestId('queue-table').waitFor()
  await page.getByRole('columnheader', { name: /it priority/i }).getByRole('button').click()
  await page.waitForTimeout(600)
  await showUrl(page, 'sort=itPriority:desc via the column header (aria-sort=descending)')
  await shot(page, 'staff-queue/p6-04-sort-it-priority.png', { fullPage: true })

  // Pagination: page 2 of 3 at 10 per page.
  await page.goto(`${seeded}&page=2`)
  await page.getByText(/Showing 11 to 20 of 24/).waitFor()
  await page.locator('.zg-pagination').scrollIntoViewIfNeeded()
  await showUrl(page, 'page=2, 10 per page')
  await shot(page, 'staff-queue/p6-05-pagination.png', { fullPage: true })

  // Empty state: the API answers an empty system (only this request is changed).
  await page.route('**/api/staff/tickets?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      }),
    }),
  )
  await page.goto(`${WEB}/staff/queue`)
  await page.getByTestId('empty-state').waitFor()
  await showUrl(page, 'empty list substituted for this request — the "no tickets yet" state')
  await shot(page, 'staff-queue/p6-06-empty-state.png')
  await page.unroute('**/api/staff/tickets?**')

  // Open detail from a row.
  await page.goto(seeded)
  await page.getByRole('link', { name: 'Open ticket TKT-2026-900004' }).click()
  await page.getByTestId('ticket-fields').waitFor()
  await showUrl(page, 'Open → /staff/tickets/:id')
  await shot(page, 'staff-queue/p6-07-open-detail.png')
  await page.context().close()
}

// ---------------------------------------------------------------------------
// Answer Part 7 — IT Staff Ticket Detail
// ---------------------------------------------------------------------------
console.log('Part 7 — staff ticket detail')

// A ticket of its own, raised by Jennifer with a file, a comment and the
// "appears resolved" indication, so every panel has something to show.
const jennifer = await apiAs(ACCOUNTS.jennifer)
const [categories, systems] = await Promise.all([
  jennifer.get(`${API}/api/categories`).then((r) => r.json()),
  jennifer.get(`${API}/api/related-systems`).then((r) => r.json()),
])
const created = await (
  await jennifer.post(`${API}/api/tickets`, {
    data: {
      summary: `Docking station drops the external monitor (${STAMP})`,
      description: 'The second monitor goes black every few minutes when the laptop is docked; undocked it is fine.',
      categoryId: categories.data.find((c) => c.name === 'Hardware').id,
      relatedSystemId: systems.data.find((s) => s.name === 'Corporate Laptop').id,
      priority: 'Medium',
    },
  })
).json()
const TICKET = created.id
await jennifer.post(`${API}/api/tickets/${TICKET}/attachments`, {
  multipart: {
    file: {
      name: 'dock-event-log.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('dock log')]),
    },
  },
})
await jennifer.post(`${API}/api/tickets/${TICKET}/comments`, {
  data: { body: 'It happened three times this morning. Happy to bring the dock to the IT desk.' },
})
{
  const page = await newPage()
  await login(page, ACCOUNTS.priya, '/staff/queue')
  await page.goto(`${WEB}/staff/tickets/${TICKET}`)
  await page.getByTestId('ticket-fields').waitFor()

  // New and unassigned: Claim offered, the owner-only targets absent with a hint.
  await shot(page, 'staff-ticket-detail/p7-01-new-unassigned.png', { fullPage: true })

  // Claim: owner = me, New → Open in one step.
  await page.getByRole('button', { name: 'Claim' }).click()
  await page.getByLabel('Current Status').locator('option', { hasText: 'In Progress' }).waitFor({ state: 'attached' })
  await shot(page, 'staff-ticket-detail/p7-02-claimed.png')

  // IT Priority, independent of the requested priority.
  await page.getByLabel('IT Priority').selectOption('High')
  await page.getByText('IT High').first().waitFor()
  await page.getByLabel('Current Status').selectOption('InProgress')
  await page.waitForTimeout(400)
  await shot(page, 'staff-ticket-detail/p7-03-it-priority-and-in-progress.png')

  // A real 409: an In Progress ticket must keep an owner (BR-31).
  await page.getByLabel('Ticket Owner').selectOption('')
  await page.getByText(/must keep an owner/i).waitFor()
  await shot(page, 'staff-ticket-detail/p7-04-conflict-inline.png')

  // Reassign: confirmed first, because it takes work away from the owner.
  const chen = await page.getByLabel('Ticket Owner').locator('option', { hasText: 'Chen Wei' }).getAttribute('value')
  await page.getByLabel('Ticket Owner').selectOption(chen)
  await page.getByRole('dialog', { name: /reassign/i }).waitFor()
  await shot(page, 'staff-ticket-detail/p7-05-reassign-confirm.png')
  await page.getByRole('dialog').getByRole('button', { name: /^confirm$/i }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })

  // Status through the matrix with confirmation.
  await page.getByLabel('Current Status').selectOption('Resolved')
  await page.getByRole('dialog').waitFor()
  await shot(page, 'staff-ticket-detail/p7-06-resolve-confirm.png')
  await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()

  // Public Comments: the requester's comment and a staff reply.
  await page.getByLabel('Add public comment').fill('Thanks — please bring the dock to the IT desk on Monday.')
  await page.getByRole('button', { name: 'Post Comment' }).click()
  // The detail re-reads after a post (counts and Updated change), so wait for
  // the new thread rather than holding on to the old list element.
  await page.getByTestId('comment-list').getByText('please bring the dock').waitFor()
  await shot(page, 'staff-ticket-detail/p7-07-public-comments.png', { fullPage: true })

  // Internal Notes: validation, then a note.
  await page.getByRole('tab', { name: /internal notes/i }).click()
  await page.getByRole('button', { name: 'Add Internal Note' }).click()
  await page.getByText('Note cannot be empty.').waitFor()
  await shot(page, 'staff-ticket-detail/p7-08-note-validation.png')
  await page.getByLabel('Add internal note').fill('Known firmware issue on this dock model; replacement unit ordered.')
  await page.getByRole('button', { name: 'Add Internal Note' }).click()
  await page.getByText('replacement unit ordered').waitFor()
  await shot(page, 'staff-ticket-detail/p7-09-internal-note.png', { fullPage: true })

  // Attachment continuity: listed and downloadable, never removable here.
  await page.getByRole('tab', { name: /attachments/i }).click()
  await page.getByTestId('active-attachments').waitFor()
  await shot(page, 'staff-ticket-detail/p7-10-attachments-read-only.png')

  // Safe failure on one control: the backend stops mid-session.
  await page.route('**/it-priority', (route) => route.abort('connectionrefused'))
  await page.getByLabel('IT Priority').selectOption('Low')
  await page.getByText(/could not reach the server/i).waitFor()
  await shot(page, 'staff-ticket-detail/p7-11-safe-failure.png')
  await page.unroute('**/it-priority')
  await page.context().close()
}
{
  // The requester flags it as looking fixed; IT Staff see the indicator.
  await jennifer.post(`${API}/api/tickets/${TICKET}/resolution-indication`)
  const page = await newPage()
  await login(page, ACCOUNTS.priya, '/staff/queue')
  await page.goto(`${WEB}/staff/queue?search=${created.ticketNumber}`)
  await page.getByLabel('Requester reports resolved').waitFor()
  await page.goto(`${WEB}/staff/tickets/${TICKET}`)
  await page.getByTestId('requester-resolved').waitFor()
  await shot(page, 'staff-ticket-detail/p7-12-requester-resolved-indicator.png')
  await page.context().close()
}
{
  // Role restrictions: the Administrator reads, the Requester is refused.
  let page = await newPage()
  await login(page, ACCOUNTS.admin, '/admin/users')
  await page.goto(`${WEB}/staff/tickets/${TICKET}`)
  await page.getByTestId('operational-readonly').waitFor()
  await shot(page, 'staff-ticket-detail/p7-13-administrator-read-only.png', { fullPage: true })
  await page.context().close()

  page = await newPage()
  await login(page, ACCOUNTS.jennifer, '/tickets')
  await page.goto(`${WEB}/staff/tickets/${TICKET}`)
  await page.getByRole('alert').waitFor()
  await showUrl(page, 'Requester on a staff route (her own ticket)')
  await shot(page, 'staff-ticket-detail/p7-14-requester-forbidden.png')

  // And the requester's own detail shows the staff reply but never the note.
  await page.goto(`${WEB}/tickets/${TICKET}`)
  await page.getByTestId('comment-list').waitFor()
  await shot(page, 'staff-ticket-detail/p7-15-requester-view-no-notes.png', { fullPage: true })
  await page.context().close()
}

// ---------------------------------------------------------------------------
// Answer Part 8 — Administrator User Management
// ---------------------------------------------------------------------------
console.log('Part 8 — user management')
{
  const page = await newPage()
  await login(page, ACCOUNTS.admin, '/admin/users')
  const search = page.locator('#user-search')
  const role = page.locator('#user-role')

  await search.fill('@kmutt.ac.th')
  await page.waitForTimeout(500)
  await shot(page, 'user-management/p8-01-list.png', { fullPage: true })

  await search.fill('raman')
  await page.waitForTimeout(500)
  await shot(page, 'user-management/p8-02-search.png')

  await search.fill('')
  await role.selectOption('Administrator')
  await page.waitForTimeout(500)
  await shot(page, 'user-management/p8-03-role-filter.png')
  await role.selectOption('')

  // Invalid input: every field refused under itself.
  await page.getByRole('button', { name: 'Create User' }).click()
  let panel = page.getByTestId('user-panel')
  await panel.getByLabel(/email address/i).fill('not-an-email')
  await panel.getByLabel(/^initial password/i).fill('weak')
  await panel.getByRole('button', { name: 'Save User' }).click()
  await panel.getByText(/full name is required/i).waitFor()
  await shot(page, 'user-management/p8-04-invalid-input.png', { fullPage: true })

  // Create an IT Staff account with its rules panel satisfied.
  const email = `dara.suksan.${STAMP}@kmutt.ac.th`
  await panel.getByLabel(/full name/i).fill(`Dara Suksan ${STAMP}`)
  await panel.getByLabel(/email address/i).fill(email)
  await panel.getByLabel(/^role/i).selectOption('ITStaff')
  await panel.getByLabel(/^initial password/i).fill('Welcome123!')
  await shot(page, 'user-management/p8-05-create-filled.png', { fullPage: true })
  await panel.getByRole('button', { name: 'Save User' }).click()
  await page.getByRole('status').filter({ hasText: /was created/ }).waitFor()
  await search.fill(email)
  await page.waitForTimeout(500)
  await shot(page, 'user-management/p8-06-created.png')

  // Edit: name, email, role and activation in one panel.
  await page.getByRole('button', { name: `Edit Dara Suksan ${STAMP}` }).click()
  panel = page.getByTestId('user-panel')
  await panel.getByLabel(/^role/i).selectOption('Requester')
  await shot(page, 'user-management/p8-07-edit.png', { fullPage: true })
  await panel.getByRole('button', { name: 'Save Changes' }).click()
  await page.getByRole('status').filter({ hasText: /was updated/ }).waitFor()

  // A new initial password; the account must change it at the next login.
  await page.getByRole('button', { name: `Edit Dara Suksan ${STAMP}` }).click()
  panel = page.getByTestId('user-panel')
  await panel.getByLabel(/^new initial password/i).fill('Reset123!pass')
  await panel.getByRole('button', { name: 'Set Initial Password' }).click()
  await panel.getByText(/must change it at next login/i).waitFor()
  await shot(page, 'user-management/p8-08-new-initial-password.png', { fullPage: true })

  // Deactivation asks first.
  await panel.getByLabel('Active').selectOption('no')
  await panel.getByRole('button', { name: 'Save Changes' }).click()
  await page.getByRole('dialog', { name: /deactivate this user/i }).waitFor()
  await shot(page, 'user-management/p8-09-deactivate-confirm.png')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await panel.getByRole('button', { name: 'Cancel' }).click()

  // Both guards, with their reasons, on the administrator's own account.
  await search.fill('admin@toktickit.xyz')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Edit System Administrator/ }).click()
  await page.getByTestId('last-admin-hint').waitFor()
  await shot(page, 'user-management/p8-10-self-and-last-admin-guards.png', { fullPage: true })

  // Safe failure: the list request never gets an answer.
  await page.route('**/api/admin/users?**', (route) => route.abort('connectionrefused'))
  await page.reload()
  await page.getByText(/could not reach the server/i).waitFor()
  await shot(page, 'user-management/p8-11-safe-failure.png')
  await page.unroute('**/api/admin/users?**')
  await page.context().close()

  // The new initial password forces a change at the next login.
  const next = await newPage()
  await login(next, { email, password: 'Reset123!pass' }, '/change-password')
  await showUrl(next, `${email} signed in with the new initial password`)
  await shot(next, 'user-management/p8-12-forced-change-next-login.png')
  await next.context().close()

  // Forbidden for a non-Administrator, on mobile to show the responsive state too.
  const staff = await newPage(MOBILE)
  await login(staff, ACCOUNTS.priya, '/staff/queue')
  await staff.goto(`${WEB}/admin/users`)
  await staff.getByRole('alert').waitFor()
  await showUrl(staff, 'IT Staff')
  await shot(staff, 'user-management/p8-13-forbidden-non-admin.png')
  await staff.context().close()
}

await browser.close()
console.log(`\n${count} screenshots written under ${path.relative(ROOT, SHOTS)}`)
