import { expect, test } from '@playwright/test'
import type { ConsoleMessage, Page } from '@playwright/test'
import { ADMIN, IT_STAFF, REQUESTER_A, loginAs } from '../helpers'
import type { Account } from '../helpers'

/**
 * STY-01 … STY-04 — the Lab 4 visual and accessibility pass over every screen
 * of every lab (tests.md §2 "UI style, responsive and accessibility";
 * ui-spec.md §5 V-03 … V-07, V-15, V-17 … V-20; AC-27 … AC-29).
 *
 *   STY-01 — every screen at 1280 / 820 / 375: no horizontal page scroll, and
 *            no element sticking out of the card that holds it.
 *   STY-02 — keyboard: the first 30 tab stops on both dashboards and the
 *            Actions Taken tab all show a focus ring; every form control has
 *            a name; every metric card's name carries label and value; the
 *            dialogs keep focus inside and give it back.
 *   STY-03 — every badge (status, priority, role, follow-up …) has text and
 *            meets 4.5:1 contrast.
 *   STY-04 — each role's happy path logs no console error or warning; every
 *            in-app link in the shell and on the dashboards resolves; no
 *            placeholder text anywhere.
 *
 * Read-only. Prerequisite: `npm run prisma:migrate && npm run prisma:seed`.
 */

const API = 'http://localhost:5000'

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1100 },
  mobile: { width: 375, height: 812 },
} as const

async function seededTicketId(page: Page, ticketNumber: string): Promise<string> {
  const res = await page.request.get(`${API}/api/staff/tickets?search=${ticketNumber}`)
  return (await res.json()).data[0].id as string
}

/** Waits until nothing on the page is loading any more. */
async function settled(page: Page) {
  await expect(page.locator('.zg-loading, .zg-metric-card.is-loading, .zg-skeleton-list')).toHaveCount(0)
}

/**
 * The screens each role can reach, as (name, path) pairs. Ids are resolved
 * once per role, through the staff API for staff and the Requester's own list
 * for the Requester.
 */
async function screensFor(page: Page, role: 'requester' | 'staff' | 'admin'): Promise<[string, string][]> {
  if (role === 'requester') {
    const res = await page.request.get(`${API}/api/tickets?search=TKT-2026-9000&pageSize=10`)
    const id = (await res.json()).data[0].id as string
    return [
      ['Dashboard', '/dashboard'],
      ['My Tickets', '/tickets'],
      ['My Tickets drilled down', '/tickets?status=New&status=Open&status=InProgress&status=WaitingForRequester&status=Reopened'],
      ['Create Ticket', '/tickets/new'],
      ['Ticket Detail', `/tickets/${id}`],
      ['Change Password', '/change-password'],
    ]
  }
  const ticket = await seededTicketId(page, 'TKT-2026-900007')
  const screens: [string, string][] = [
    ['Dashboard', '/dashboard'],
    ['Queue', '/staff/queue?search=TKT-2026-9000'],
    ['Queue drilled down', '/staff/queue?requesterResolved=true'],
    ['Staff Ticket Detail', `/staff/tickets/${ticket}`],
    ['Staff Ticket Detail — History', `/staff/tickets/${ticket}#history`],
  ]
  if (role === 'admin') screens.push(['Users', '/admin/users'])
  return screens
}

/** V-03 and "no element's box escapes its card". */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    if (document.documentElement.scrollWidth > window.innerWidth) {
      out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${window.innerWidth}`)
    }
    const scrolls = (el: Element | null): boolean => {
      while (el) {
        const overflow = getComputedStyle(el).overflowX
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden' || overflow === 'clip') return true
        el = el.parentElement
      }
      return false
    }
    for (const card of document.querySelectorAll('.zg-card')) {
      const box = card.getBoundingClientRect()
      for (const el of card.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (el.closest('.visually-hidden')) continue
        if (el.parentElement && el.parentElement !== card && scrolls(el.parentElement) && card.contains(el.parentElement)) continue
        if (rect.right > box.right + 1 || rect.left < box.left - 1) {
          const name = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''}`
          out.push(`${name} "${(el.textContent ?? '').trim().slice(0, 30)}" escapes its card`)
          break
        }
      }
    }
    return out
  })
}

test.describe('STY-01 — every screen, three widths: no overflow, nothing outside its card (V-03, V-04, V-14)', () => {
  const roles: [string, Account, 'requester' | 'staff' | 'admin'][] = [
    ['Requester', REQUESTER_A, 'requester'],
    ['IT Staff', IT_STAFF, 'staff'],
    ['Administrator', ADMIN, 'admin'],
  ]
  for (const [label, account, role] of roles) {
    test(`${label}`, async ({ page }) => {
      await loginAs(page, account)
      const screens = await screensFor(page, role)
      const problems: string[] = []
      for (const [width, viewport] of Object.entries(VIEWPORTS)) {
        await page.setViewportSize(viewport)
        for (const [name, path] of screens) {
          await page.goto(path)
          await settled(page)
          if (path.endsWith('#history')) await page.getByRole('tab', { name: 'History' }).click()
          for (const problem of await layoutProblems(page)) problems.push(`${width} ${name}: ${problem}`)
        }
      }
      // The Login screen, signed out.
      await page.context().clearCookies()
      for (const [width, viewport] of Object.entries(VIEWPORTS)) {
        await page.setViewportSize(viewport)
        await page.goto('/login')
        for (const problem of await layoutProblems(page)) problems.push(`${width} Login: ${problem}`)
      }
      expect(problems).toEqual([])
    })
  }
})

/** Tabs through the page and reports every stop that shows no focus indicator. */
async function focusRingProblems(page: Page, stops = 30): Promise<string[]> {
  const problems: string[] = []
  await page.locator('body').focus()
  for (let index = 0; index < stops; index += 1) {
    await page.keyboard.press('Tab')
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      const ring =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
        (style.boxShadow && style.boxShadow !== 'none')
      const what = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute('type') ? `[type=${el.getAttribute('type')}]` : ''}`
      return { ring, name: `${what} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"` }
    })
    if (result && !result.ring) problems.push(result.name)
  }
  return problems
}

/** Every form control has an accessible name (V-06). */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea, button, [role=switch], [role=tab]')) {
      const id = el.id
      const named =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (id && document.querySelector(`label[for="${id}"]`)) ||
        el.closest('label') ||
        (el.tagName === 'BUTTON' && (el.textContent ?? '').trim())
      if (!named) out.push(`${el.tagName.toLowerCase()}#${id || '?'}`)
    }
    for (const toggle of document.querySelectorAll('[role=switch]')) {
      if (!toggle.hasAttribute('aria-checked')) out.push('switch without aria-checked')
    }
    return out
  })
}

test.describe('STY-02 — keyboard, names and dialogs (V-05, V-06, V-15, V-18)', () => {
  test('both dashboards: focus ring on the first 30 stops; every card named with label and value', async ({ page }) => {
    for (const account of [REQUESTER_A, IT_STAFF]) {
      await page.context().clearCookies()
      await loginAs(page, account)
      await settled(page)
      expect(await focusRingProblems(page), `${account.name} dashboard`).toEqual([])
      expect(await unnamedControls(page)).toEqual([])
      const names = await page.locator('a.zg-metric-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))
      expect(names.length).toBeGreaterThan(3)
      for (const name of names) expect(name).toMatch(/^[^:]+: \d+ /)
    }
  })

  test('Actions Taken tab and its create form: focus ring on every stop; every control named', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.goto(`/staff/tickets/${await seededTicketId(page, 'TKT-2026-900007')}`)
    await settled(page)
    await page.getByRole('button', { name: /record action/i }).click()
    expect(await focusRingProblems(page, 45)).toEqual([])
    expect(await unnamedControls(page)).toEqual([])
    await page.getByTestId('action-form').getByRole('button', { name: 'Cancel', exact: true }).click()
  })

  test('the status dialog keeps Tab inside, closes on Escape and returns focus', async ({ page }) => {
    await loginAs(page, IT_STAFF)
    await page.goto(`/staff/tickets/${await seededTicketId(page, 'TKT-2026-900004')}`)
    await settled(page)
    const status = page.getByLabel('Current Status')
    // A keyboard user is on the select when they pick an option.
    await status.focus()
    await status.selectOption('Cancelled')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(status).toBeFocused()
    await expect(status).toHaveValue('Open')
  })
})

/** WCAG contrast of every badge on the page, and that each has text (V-07, V-17). */
async function badgeProblems(page: Page): Promise<{ problems: string[]; count: number }> {
  return page.evaluate(() => {
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
    const backgroundOf = (el: Element | null) => {
      while (el) {
        const bg = parse(getComputedStyle(el).backgroundColor)
        if (bg && bg.a > 0.5) return bg
        el = el.parentElement
      }
      return { r: 255, g: 255, b: 255 }
    }
    const problems: string[] = []
    const badges = document.querySelectorAll('.zg-badge, .zg-you-tag, .zg-owner-tag')
    for (const badge of badges) {
      const text = (badge.textContent ?? '').trim()
      if (!text) problems.push(`${badge.className}: no text`)
      const fg = parse(getComputedStyle(badge).color)
      if (!fg) continue
      const [hi, lo] = [luminance(fg), luminance(backgroundOf(badge))].sort((a, b) => b - a)
      const ratio = (hi + 0.05) / (lo + 0.05)
      if (ratio < 4.5) problems.push(`${badge.className} "${text}" ${ratio.toFixed(2)}:1`)
    }
    return { problems, count: badges.length }
  })
}

test('STY-03 — every badge on the Lab 4 screens has text and 4.5:1 contrast (V-07, V-17)', async ({ page }) => {
  const problems: string[] = []
  let measured = 0
  const measure = async (where: string) => {
    await settled(page)
    const result = await badgeProblems(page)
    measured += result.count
    problems.push(...result.problems.map((problem) => `${where}: ${problem}`))
  }

  await loginAs(page, IT_STAFF)
  await measure('staff dashboard')
  // …007 has open, completed and no follow-ups between its Actions; …900020 is Cancelled.
  await page.goto(`/staff/tickets/${await seededTicketId(page, 'TKT-2026-900007')}`)
  await measure('actions tab')
  await page.getByRole('tab', { name: 'History' }).click()
  await measure('history tab')
  await page.goto('/staff/queue?search=TKT-2026-9000&pageSize=25')
  await measure('queue')

  await page.context().clearCookies()
  await loginAs(page, REQUESTER_A)
  await measure('requester dashboard')

  expect(measured).toBeGreaterThan(60)
  expect(problems).toEqual([])
})

test.describe('STY-04 — console, links and leftovers (V-19, V-20)', () => {
  /** Collects console errors and warnings for the rest of the test. */
  function listen(page: Page) {
    const messages: string[] = []
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`)
    })
    page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`))
    return messages
  }

  const happyPaths: [string, Account, 'requester' | 'staff' | 'admin'][] = [
    ['Requester', REQUESTER_A, 'requester'],
    ['IT Staff', IT_STAFF, 'staff'],
    ['Administrator', ADMIN, 'admin'],
  ]

  for (const [label, account, role] of happyPaths) {
    test(`${label}: no console errors or warnings; every in-app link resolves; no placeholder text`, async ({ page }) => {
      // Listening starts once signed in: the Login screen's session probe
      // (`GET /api/auth/me`) answers 401 to an anonymous visitor by design,
      // and Chrome logs every 4xx resource load as a console error.
      await loginAs(page, account)
      const messages = listen(page)
      const screens = await screensFor(page, role)

      const leftovers: string[] = []
      const links = new Set<string>()
      for (const [name, path] of screens) {
        await page.goto(path)
        await settled(page)
        const text = await page.locator('body').innerText()
        for (const word of [/\bTODO\b/, /lorem ipsum/i, /\bplaceholder\b/i, /\bFIXME\b/, /\bundefined\b/, /\bNaN\b/, /\[object Object\]/]) {
          if (word.test(text)) leftovers.push(`${name}: ${word}`)
        }
        // Shell and dashboard links are the ones a user follows from anywhere.
        if (path === '/dashboard') {
          for (const href of await page.locator('a[href^="/"]').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''))) {
            links.add(href)
          }
        }
      }

      // Every link lands where it says: an unknown path would fall through to
      // the role home, and a refused one would show the Forbidden state.
      const broken: string[] = []
      for (const href of links) {
        await page.goto(href)
        await settled(page)
        const landed = new URL(page.url())
        if (landed.pathname !== href.split(/[?#]/)[0]) broken.push(`${href} → ${landed.pathname}`)
        if (await page.getByText(/you don't have access to this page/i).count()) broken.push(`${href} → Forbidden`)
      }

      expect(links.size).toBeGreaterThan(5)
      expect(broken).toEqual([])
      expect(leftovers).toEqual([])
      expect(messages).toEqual([])
    })
  }
})
