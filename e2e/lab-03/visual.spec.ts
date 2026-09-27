import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import path from 'node:path'
import { ADMIN, IT_STAFF, REQUESTER_A, loginAs } from '../helpers'

/**
 * E2E-07 — the responsive and visual pass (AC-33, AC-34, ui-spec.md §4, §5).
 *
 * Every major Lab 3 screen is opened at the three widths the spec names and
 * checked for horizontal page overflow (V-03). With `CAPTURE=1` in the
 * environment the same run writes the screenshots tests.md §4 lists (R-01 …
 * R-20) into `artifacts/lab-03/screenshots/`:
 *
 *   CAPTURE=1 npx playwright test e2e/lab-03/visual.spec.ts
 *
 * Without the flag nothing is written, so a normal test run does not rewrite
 * binary files whose only change would be a relative date.
 *
 * The safe-failure case (AC-34) aborts the API requests from the browser,
 * which is exactly what a stopped backend looks like to the page: the fetch
 * rejects and no response ever arrives.
 *
 * Prerequisite: `npm run prisma:migrate && npm run prisma:seed`. Michael Brown
 * is the forced-password-change account here because no other spec touches
 * him (E2E-02 uses Sarah and completes her change).
 */

const SHOTS = path.join(process.cwd(), 'artifacts', 'lab-03', 'screenshots')
const CAPTURE = process.env.CAPTURE === '1'

const MICHAEL = { name: 'Michael Brown', email: 'michael.brown@kmutt.ac.th', password: 'Welcome123!' }

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1100 },
  mobile: { width: 375, height: 812 },
} as const

type Width = keyof typeof VIEWPORTS

/** V-03: the page itself never scrolls sideways; wide tables scroll inside their wrapper. */
async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'page must not scroll horizontally').toBeLessThanOrEqual(innerWidth)
}

/**
 * Writes a screenshot only when capturing; the overflow check always runs first.
 * The matrix captures the whole page on desktop but only the viewport on tablet
 * and phone — what the device actually shows, and a shape that stays readable
 * when printed half a page wide (a full-page phone capture is ~8:1).
 */
async function shot(page: Page, file: string, options: { fullPage?: boolean } = {}) {
  await expectNoHorizontalOverflow(page)
  if (!CAPTURE) return
  // Let fonts and any entrance transition settle so the capture is stable.
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: options.fullPage ?? true })
}

/** The seeded tickets only, so a screenshot never shows another spec's leftovers. */
const SEEDED_QUEUE = '/staff/queue?search=TKT-2026-9000'

/** A worked seeded ticket: owned by Priya, In Progress, with comments and notes. */
async function seededTicketId(page: Page, ticketNumber = 'TKT-2026-900008'): Promise<string> {
  const res = await page.request.get(`http://localhost:5000/api/staff/tickets?search=${ticketNumber}`)
  const body = await res.json()
  return body.data[0].id as string
}

test.describe('Responsive and visual pass (E2E-07, AC-33)', () => {
  for (const width of Object.keys(VIEWPORTS) as Width[]) {
    test.describe(`${width} ${VIEWPORTS[width].width}px`, () => {
      test.use({ viewport: VIEWPORTS[width] })

      test('Login (R-01 … R-03)', async ({ page }) => {
        await page.goto('/login')
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
        await shot(page, `authentication/login-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('Change Password, forced (R-04, R-05)', async ({ page }) => {
        await page.goto('/login')
        await page.getByLabel(/email address/i).fill(MICHAEL.email)
        await page.getByLabel(/^password/i).fill(MICHAEL.password)
        await page.getByRole('button', { name: /sign in/i }).click()
        await expect(page).toHaveURL(/\/change-password$/)
        await expect(page.getByText(/you must change your password/i)).toBeVisible()
        // Nothing is submitted: Michael stays on his initial password for the next run.
        await shot(page, `authentication/change-password-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('Ticket Queue (R-08 … R-10)', async ({ page }) => {
        await loginAs(page, IT_STAFF)
        await page.goto(SEEDED_QUEUE)
        await expect(page.getByText(/of 24 tickets/)).toBeVisible()
        if (width === 'mobile') await expect(page.getByTestId('queue-cards')).toBeVisible()
        else await expect(page.getByTestId('queue-table')).toBeVisible()
        await shot(page, `staff-queue/queue-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('Staff Ticket Detail (R-12 … R-14)', async ({ page }) => {
        await loginAs(page, IT_STAFF)
        await page.goto(`/staff/tickets/${await seededTicketId(page)}`)
        await expect(page.getByTestId('ticket-fields')).toBeVisible()
        await expect(page.getByLabel('Current Status')).toBeVisible()
        await shot(page, `staff-ticket-detail/detail-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('My Tickets (Requester)', async ({ page }) => {
        await loginAs(page, REQUESTER_A)
        await page.goto('/tickets?search=TKT-2026-9000')
        if (width === 'mobile') await expect(page.locator('.zg-ticket-cards')).toBeVisible()
        else await expect(page.getByRole('table')).toBeVisible()
        await shot(page, `requester/my-tickets-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('Requester Ticket Detail with Public Comments', async ({ page }) => {
        await loginAs(page, REQUESTER_A)
        // Jennifer's seeded, owned, Open ticket with a comment thread.
        const res = await page.request.get('http://localhost:5000/api/tickets?search=TKT-2026-900005')
        const id = (await res.json()).data[0].id as string
        await page.goto(`/tickets/${id}`)
        await expect(page.getByTestId('comment-list')).toBeVisible()
        await expect(page.getByRole('button', { name: /problem appears resolved/i })).toBeVisible()
        await shot(page, `requester/ticket-detail-${width}.png`, { fullPage: width === 'desktop' })
      })

      test('Users (R-17 … R-19)', async ({ page }) => {
        await loginAs(page, ADMIN)
        // Seeded accounts only; the E2E suite's accounts all use an "e2e." local part.
        await page.locator('#user-role').selectOption('ITStaff')
        await page.locator('#user-search').fill('@kmutt.ac.th')
        await expect(page.getByText('Priya Raman').first()).toBeVisible()
        await page.getByRole('button', { name: 'Edit Priya Raman' }).click()
        await expect(page.getByTestId('user-panel')).toBeVisible()
        await shot(page, `user-management/users-${width}.png`, { fullPage: width === 'desktop' })
      })
    })
  }
})

test.describe('Shell and role navigation (R-06, R-07, V-10)', () => {
  test('each role sees only its own links (desktop)', async ({ page }) => {
    for (const [account, file, links] of [
      [REQUESTER_A, 'shell-requester-desktop.png', ['My Tickets', 'Create Ticket']],
      [IT_STAFF, 'shell-staff-desktop.png', ['Queue']],
      [ADMIN, 'shell-admin-desktop.png', ['Users', 'Queue']],
    ] as const) {
      await page.context().clearCookies()
      await loginAs(page, account)
      const nav = page.getByRole('navigation', { name: /main/i })
      await expect(nav.getByRole('link')).toHaveText([...links])
      await page.locator('.zg-profile-button').click()
      await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible()
      await shot(page, `authentication/${file}`, { fullPage: false })
      await page.keyboard.press('Escape')
    }
  })

  test('the mobile header opens as a sheet with the profile menu (R-07)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await loginAs(page, IT_STAFF)
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('navigation', { name: /main/i })).toBeVisible()
    await shot(page, 'authentication/shell-mobile.png', { fullPage: false })
  })
})

test.describe('Detail states (R-11, R-15, R-16, R-20)', () => {
  test('queue no-results and safe failure (R-11, AC-34)', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.goto('/staff/queue?search=no-such-ticket-anywhere')
    await expect(page.getByTestId('no-results-state')).toBeVisible()
    await shot(page, 'staff-queue/queue-no-results.png', { fullPage: false })

    // The backend "stops": every queue request fails before a response arrives.
    await page.route('**/api/staff/tickets?**', (route) => route.abort('connectionrefused'))
    await page.goto(SEEDED_QUEUE)
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/could not reach the server/i)
    await expect(alert.getByRole('button', { name: /retry/i })).toBeVisible()
    // AC-34: no stack trace, SQL or internal detail reaches the screen.
    await expect(alert).not.toContainText(/error:|at |prisma|sql|stack/i)
    await shot(page, 'staff-queue/queue-failure.png', { fullPage: false })

    // Back up: Retry recovers without a reload.
    await page.unroute('**/api/staff/tickets?**')
    await alert.getByRole('button', { name: /retry/i }).click()
    await expect(page.getByTestId('queue-table')).toBeVisible()
  })

  test('Internal Notes against Public Comments (R-15, V-12)', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.goto(`/staff/tickets/${await seededTicketId(page)}`)
    await page.getByRole('tab', { name: /internal notes/i }).click()
    await expect(page.getByTestId('note-list')).toBeVisible()
    await expect(page.getByText(/not visible to the requester/i)).toBeVisible()
    await shot(page, 'staff-ticket-detail/notes-vs-comments.png')
  })

  test('confirmation dialog on mobile (R-16)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await loginAs(page, IT_STAFF)
    await page.goto(`/staff/tickets/${await seededTicketId(page)}`)
    await page.getByLabel('Current Status').selectOption('Resolved')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/Resolved/)
    await shot(page, 'staff-ticket-detail/confirm-mobile.png', { fullPage: false })
    // Cancelled, so the seeded ticket keeps its state.
    await dialog.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByLabel('Current Status')).toHaveValue('InProgress')
  })

  test('Users validation and 409 under Email (R-20)', async ({ page }) => {
    await loginAs(page, ADMIN)
    await page.getByRole('button', { name: 'Create User' }).click()
    const panel = page.getByTestId('user-panel')
    await panel.getByLabel(/full name/i).fill('Duplicate Example')
    await panel.getByLabel(/email address/i).fill('priya.raman@kmutt.ac.th')
    await panel.getByLabel(/^initial password/i).fill('Welcome123!')
    await panel.getByRole('button', { name: 'Save User' }).click()
    await expect(panel.getByLabel(/email address/i)).toHaveAttribute('aria-invalid', 'true')
    await expect(panel.getByRole('alert')).toContainText(/already in use/i)
    await shot(page, 'user-management/users-conflict.png', { fullPage: false })
  })
})

test.describe('Measured checklist items (V-05, V-06, V-07)', () => {
  /** Every screen a check below walks, with the account that can open it. */
  const SCREENS: { name: string; account: typeof IT_STAFF | null; path: (page: Page) => Promise<string> }[] = [
    { name: 'Login', account: null, path: async () => '/login' },
    { name: 'Queue', account: IT_STAFF, path: async () => SEEDED_QUEUE },
    { name: 'Staff detail', account: IT_STAFF, path: async (page) => `/staff/tickets/${await seededTicketId(page)}` },
    { name: 'Users', account: ADMIN, path: async () => '/admin/users' },
  ]

  for (const screen of SCREENS) {
    test(`V-05 every focusable control on ${screen.name} shows a focus indicator`, async ({ page }) => {
      if (screen.account) await loginAs(page, screen.account)
      await page.goto(await screen.path(page))
      await page.waitForLoadState('networkidle')

      const missing: string[] = []
      // Walk the tab order; each stop must draw an outline or a focus shadow.
      for (let stop = 0; stop < 25; stop += 1) {
        await page.keyboard.press('Tab')
        const result = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return null
          const style = getComputedStyle(el)
          const visible =
            (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
            (style.boxShadow !== 'none' && style.boxShadow !== '')
          const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.id || el.tagName
          return { visible, label: `${el.tagName.toLowerCase()} "${label}"` }
        })
        if (result && !result.visible) missing.push(result.label)
      }
      expect(missing, 'controls with no visible focus indicator').toEqual([])
    })

    test(`V-06 every form control on ${screen.name} has an accessible name`, async ({ page }) => {
      if (screen.account) await loginAs(page, screen.account)
      await page.goto(await screen.path(page))
      await page.waitForLoadState('networkidle')
      if (screen.name === 'Users') await page.getByRole('button', { name: 'Create User' }).click()

      const unnamed = await page.evaluate(() => {
        const out: string[] = []
        for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea')) {
          if ((el as HTMLInputElement).type === 'hidden') continue
          const id = el.id
          const named =
            el.getAttribute('aria-label') ||
            el.getAttribute('aria-labelledby') ||
            (id && document.querySelector(`label[for="${id}"]`)) ||
            el.closest('label')
          if (!named) out.push(`${el.tagName.toLowerCase()}#${id || '?'}`)
        }
        // Password show/hide toggles must announce their state.
        for (const toggle of document.querySelectorAll('.zg-password-toggle')) {
          if (!toggle.hasAttribute('aria-pressed')) out.push('password toggle without aria-pressed')
        }
        return out
      })
      expect(unnamed).toEqual([])
    })
  }

  test('V-07 every badge on the queue, staff detail and users screens meets 4.5:1 contrast', async ({ page }) => {
    const failures: string[] = []

    const measure = async (where: string) => {
      const rows = await page.evaluate(() => {
        const parse = (value: string) => {
          const match = value.match(/rgba?\(([^)]+)\)/)
          if (!match) return null
          const [r, g, b, a = '1'] = match[1].split(',').map((part) => part.trim())
          return { r: +r, g: +g, b: +b, a: +a }
        }
        const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const channel = (c: number) => {
            const s = c / 255
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
        }
        /** The first opaque background at or behind an element. */
        const backgroundOf = (el: Element | null): { r: number; g: number; b: number } => {
          while (el) {
            const bg = parse(getComputedStyle(el).backgroundColor)
            if (bg && bg.a > 0.5) return bg
            el = el.parentElement
          }
          return { r: 255, g: 255, b: 255 }
        }
        const out: { label: string; ratio: number }[] = []
        for (const badge of document.querySelectorAll('.zg-badge, .zg-you-tag')) {
          const fg = parse(getComputedStyle(badge).color)
          if (!fg) continue
          const bg = backgroundOf(badge)
          const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
          out.push({ label: `${badge.className} "${badge.textContent?.trim()}"`, ratio: (hi + 0.05) / (lo + 0.05) })
        }
        return out
      })
      for (const row of rows) {
        if (row.ratio < 4.5) failures.push(`${where}: ${row.label} ${row.ratio.toFixed(2)}:1`)
      }
      return rows.length
    }

    await loginAs(page, IT_STAFF)
    await page.goto(`${SEEDED_QUEUE}&pageSize=25`)
    await expect(page.getByTestId('queue-table')).toBeVisible()
    const inQueue = await measure('queue')
    await page.goto(`/staff/tickets/${await seededTicketId(page)}`)
    await expect(page.getByTestId('ticket-fields')).toBeVisible()
    await measure('staff detail')
    await page.getByRole('tab', { name: /internal notes/i }).click()
    await measure('internal notes')

    await page.context().clearCookies()
    await loginAs(page, ADMIN)
    await expect(page.getByTestId('user-table')).toBeVisible()
    await measure('users')

    // Every status value appears in the seeded queue, so this checked all eight.
    expect(inQueue).toBeGreaterThan(40)
    expect(failures).toEqual([])
  })
})

test.describe('Clean console on every role’s happy path (Definition of Done §10.1)', () => {
  for (const [role, account, paths] of [
    ['Requester', REQUESTER_A, ['/tickets', '/tickets/new', '/tickets?search=TKT-2026-900005']],
    ['IT Staff', IT_STAFF, [SEEDED_QUEUE, 'staff-detail']],
    ['Administrator', ADMIN, ['/admin/users', SEEDED_QUEUE, 'staff-detail']],
  ] as const) {
    test(`${role}: no console errors or uncaught exceptions`, async ({ page }) => {
      // Listening starts once signed in. Before that the Login screen asks
      // `GET /api/auth/me` whether a session exists, and the specified answer
      // for an anonymous visitor is 401 (api-spec.md §3.3) — which Chrome logs
      // as a failed resource even though nothing is wrong.
      await loginAs(page, account)

      const problems: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
      })
      page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))

      for (const target of paths) {
        const url = target === 'staff-detail' ? `/staff/tickets/${await seededTicketId(page)}` : target
        await page.goto(url)
        await page.waitForLoadState('networkidle')
      }
      if (role !== 'Requester') {
        await page.getByRole('tab', { name: /internal notes/i }).click()
        await page.getByRole('tab', { name: /attachments/i }).click()
        await page.waitForLoadState('networkidle')
      }

      expect(problems).toEqual([])
    })
  }
})

