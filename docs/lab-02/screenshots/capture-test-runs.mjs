/**
 * Renders the captured test-run logs into the Answer Part 3 images.
 *
 * The text is not retyped or summarised: each image is the verbatim contents of
 * `docs/lab-02/test-runs/*.txt`, which are the redirected output of the three
 * commands. Regenerate the logs first, then this script, so the two never drift:
 *
 *   npm run test:server  > docs/lab-02/test-runs/server.txt
 *   npm run test:client  > docs/lab-02/test-runs/client.txt
 *   npx playwright test   > docs/lab-02/test-runs/e2e.txt
 *   node docs/lab-02/screenshots/capture-test-runs.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))
const LOGS = path.join(OUT, '..', 'test-runs')

const RUNS = [
  { file: 'server.txt', image: 'part3-test-server.png', title: 'Backend — unit and API tests' },
  { file: 'client.txt', image: 'part3-test-client.png', title: 'Frontend — component tests' },
  { file: 'e2e.txt', image: 'part3-test-e2e.png', title: 'End-to-end — Playwright' },
  { file: 'git-history.txt', image: 'git-history.png', title: 'Branch and merge history on main' },
]

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Colours the pass/fail markers so a reader can scan the result at a glance. */
function highlight(text) {
  return escape(text)
    .split('\n')
    .map((line) => {
      if (/^\s*(ok\s+\d+|✓|√)/.test(line) || /\bpassed\b/.test(line)) {
        return `<span class="pass">${line}</span>`
      }
      if (/\bfailed\b|\berror\b/i.test(line)) return `<span class="fail">${line}</span>`
      if (line.startsWith('$')) return `<span class="cmd">${line}</span>`
      return line
    })
    .join('\n')
}

const browser = await chromium.launch()

for (const run of RUNS) {
  const log = readFileSync(path.join(LOGS, run.file), 'utf8').trimEnd()

  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  await page.setContent(`
    <style>
      body { margin: 0; background: #0d1117; font-family: 'Cascadia Mono', Consolas, monospace; }
      .frame { padding: 0 0 18px; }
      .bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #161b22; border-bottom: 1px solid #30363d; }
      .dot { width: 11px; height: 11px; border-radius: 50%; }
      .title { color: #8b949e; font-size: 13px; margin-left: 8px; }
      pre { margin: 0; padding: 16px 20px; color: #c9d1d9; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
      .pass { color: #3fb950; }
      .fail { color: #f85149; }
      .cmd { color: #58a6ff; font-weight: 700; }
    </style>
    <div class="frame">
      <div class="bar">
        <span class="dot" style="background:#ff5f57"></span>
        <span class="dot" style="background:#febc2e"></span>
        <span class="dot" style="background:#28c840"></span>
        <span class="title">TokTickIT — ${run.title}</span>
      </div>
      <pre>${highlight(log)}</pre>
    </div>
  `)

  await page.screenshot({ path: path.join(OUT, run.image), fullPage: true })
  console.log('saved', run.image)
  await page.close()
}

await browser.close()
