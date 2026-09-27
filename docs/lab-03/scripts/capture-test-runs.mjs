/**
 * Runs the three test suites, records their output verbatim, and renders each
 * log — together with the git history and the API authorization transcript —
 * into the images Answer Parts 1, 3 and 7 show.
 *
 * Nothing in an image is retyped or summarised: each one is the contents of a
 * file in `docs/lab-03/test-runs/`, which is the redirected output of the
 * command named at its top, with terminal colour codes removed and nothing
 * else changed. Regenerate from the repository root, with the stack up:
 *
 *   npm run prisma:seed
 *   node docs/lab-03/scripts/capture-api-authorization.mjs
 *   node docs/lab-03/scripts/capture-test-runs.mjs
 *
 * `--render-only` skips running the suites and re-renders the existing logs;
 * `--only=server|client|e2e` re-runs one suite and re-renders everything.
 */
import { chromium } from '@playwright/test'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
const LOGS = path.join(HERE, '..', 'test-runs')
const IMAGES = path.join(ROOT, 'artifacts', 'lab-03', 'screenshots', 'evidence')

mkdirSync(LOGS, { recursive: true })
mkdirSync(IMAGES, { recursive: true })

/** Terminal colour and cursor codes; the text between them is kept as is. */
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim()
// A log must say exactly what it ran against: a commit, or a commit plus edits
// not yet committed. Only the first kind is final evidence.
const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim() !== ''
const commit =
  execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() +
  (dirty ? ' + uncommitted changes' : '')

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)

/** Runs one command from the repository root and saves stdout + stderr as the log. */
function record(file, command, args) {
  if (only && `${only}.txt` !== file) return
  console.log(`running: ${command} ${args.join(' ')}`)
  // One command string: the arguments are fixed literals in this file, and
  // passing them separately alongside `shell: true` is deprecated in Node.
  const result = spawnSync(`${command} ${args.join(' ')}`, { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(ANSI, '')
  const header = `$ ${command} ${args.join(' ')}\n# ${branch} @ ${commit} · ${new Date().toISOString()}\n\n`
  writeFileSync(path.join(LOGS, file), header + output.trimEnd() + '\n')
  if (result.status !== 0) {
    console.error(`  exited ${result.status} — see ${file}`)
    process.exitCode = 1
  }
}

if (!process.argv.includes('--render-only')) {
  // The git history is always refreshed; the suites honour --only.
  record('server.txt', 'npm', ['run', 'test:server'])
  // Vitest 4 prints only totals when stdout is not a terminal; `verbose` lists
  // every file and test, which is what the evidence needs to show. The client
  // package's own script is called directly: the root `test:client` wraps a
  // second `npm run`, which would take `--reporter` as an npm option.
  record('client.txt', 'npm', ['--prefix', 'client', 'run', 'test', '--', '--reporter=verbose'])
  record('e2e.txt', 'npx', ['playwright', 'test', '--reporter=list'])

  // The branch history the lab sheet asks for in Part 1: every Lab 3 feature
  // branch merged into lab3-staging, then lab3-staging into main.
  const history = execSync(
    'git log --graph --oneline --decorate --date=short --format="%h %ad %s%d" -n 60',
    { cwd: ROOT, encoding: 'utf8' },
  )
  writeFileSync(
    path.join(LOGS, 'git-history.txt'),
    `$ git log --graph --oneline --decorate -n 60\n# ${branch} @ ${commit}\n\n${history}`,
  )
}

const RUNS = [
  { file: 'server.txt', image: 'test-server.png', title: 'Backend — unit and API tests (npm run test:server)' },
  { file: 'client.txt', image: 'test-client.png', title: 'Frontend — component tests (npm --prefix client run test -- --reporter=verbose)' },
  { file: 'e2e.txt', image: 'test-e2e.png', title: 'End-to-end — Playwright (npx playwright test)' },
  { file: 'git-history.txt', image: 'git-history.png', title: 'Branch and merge history' },
  { file: 'api-authorization.txt', image: 'api-authorization.png', title: 'Direct API authorization evidence' },
]

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Colours pass/fail markers so a reader can scan the result at a glance. */
function highlight(text) {
  return escape(text)
    .split('\n')
    .map((line) => {
      if (/\bFAIL\b|\bfailed\b|✘|×/.test(line) && !/\b0 failed\b/.test(line)) return `<span class="fail">${line}</span>`
      if (/^\s*(ok\s+\d+|✓|√)|\bpassed\b|\bPASS\b|Test Files|Tests\s/.test(line)) return `<span class="pass">${line}</span>`
      if (line.startsWith('$')) return `<span class="cmd">${line}</span>`
      if (line.startsWith('#') || line.startsWith('—')) return `<span class="note">${line}</span>`
      return line
    })
    .join('\n')
}

const browser = await chromium.launch()

for (const run of RUNS) {
  let log
  try {
    log = readFileSync(path.join(LOGS, run.file), 'utf8').trimEnd()
  } catch {
    console.warn(`  skipped ${run.file}: not found`)
    continue
  }

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
      .note { color: #d2a8ff; }
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

  await page.screenshot({ path: path.join(IMAGES, run.image), fullPage: true })
  console.log('  rendered', run.image)
  await page.close()
}

await browser.close()
