/**
 * Assembles the single submission PDF the lab sheet asks for (§14).
 *
 * Nine sections headed `Answer Part 1:` … `Answer Part 9:` in that exact order,
 * each built from markdown already in the repository — nothing is retyped here,
 * so the PDF and the repository cannot drift apart. Images are inlined from
 * disk; every relative link is rewritten to its GitHub URL on `main`, resolved
 * from the folder of the document it appears in, so each link in the PDF is
 * clickable and lands on the file it names.
 *
 * The cover's figures (commit, test counts) are read from the repository and
 * from `docs/lab-03/test-runs/`, not typed in.
 *
 * Run from the repository root:
 *   node docs/lab-03/build-submission-pdf.mjs
 *
 * Output: docs/lab-03/CPE334-Lab3-67070501024-Thawat.pdf
 */
import { chromium } from '@playwright/test'
import { marked } from 'marked'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '..', '..')
const REPO = 'https://github.com/Chessuker/TokTickIT'
const OUT = path.join(DIR, 'CPE334-Lab3-67070501024-Thawat.pdf')

/**
 * What goes under each heading, in order. The lab sheet asks for several
 * source documents to be rendered under their part, so those follow the answer
 * page that introduces them. Paths are relative to this folder.
 */
const PARTS = [
  { n: 1, title: 'Git Use with Engineering Workflow', points: 10,
    docs: ['answer-part1-git-workflow.md', 'reviewer.md', '../../README.md'] },
  { n: 2, title: 'Spec-Driven Development', points: 5,
    docs: ['answer-part2-spec-evidence.md', 'specification.md'] },
  { n: 3, title: 'Test-Driven Development and Traceability', points: 10,
    docs: ['answer-part3-test-runs.md', 'tests.md'] },
  { n: 4, title: 'AI Use with Reflection', points: 5,
    docs: ['ai-use.md'] },
  { n: 5, title: 'Working Login and Password Change UI', points: 5,
    docs: ['answer-part5-authentication.md'] },
  { n: 6, title: 'Working IT Staff Ticket Queue UI', points: 5,
    docs: ['answer-part6-staff-queue.md'] },
  { n: 7, title: 'Working IT Staff Ticket Detail UI', points: 10,
    docs: ['answer-part7-staff-ticket-detail.md'] },
  { n: 8, title: 'Working Administrator User Management UI', points: 5,
    docs: ['answer-part8-user-management.md'] },
  { n: 9, title: 'Zen Green UI and Responsive Evidence', points: 5,
    docs: ['answer-part9-responsive.md', 'ui-spec.md'] },
]

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
}

let inlined = 0
let inlinedBytes = 0
const missing = []

/** Every image in document order, filled in as the markdown is rendered. */
const figures = []

/**
 * A full-page mobile screenshot can be nine times taller than it is wide.
 * Scaled to the width of an A4 column it would run a metre down the page, and
 * Chrome cannot break an image across pages — so tall images standing on their
 * own are cut into slices that each fit. Images inside a table cell are never
 * sliced; they are scaled to the cell instead.
 */
const MAX_ASPECT = 1.7

/** Inlines a local image as a data URI so the PDF carries no external refs. */
function inlineImage(src, baseDir) {
  const clean = decodeURIComponent(src.split('#')[0])
  const file = path.resolve(baseDir, clean)
  if (!existsSync(file)) {
    missing.push(path.relative(ROOT, file).replace(/\\/g, '/'))
    return null
  }
  const type = MIME[path.extname(file).toLowerCase()]
  if (!type) return null
  inlined += 1
  inlinedBytes += statSync(file).size
  return `data:${type};base64,${readFileSync(file).toString('base64')}`
}

/** Rewrites a relative link, resolved from its own document, to GitHub on `main`. */
function toGithubUrl(href, baseDir) {
  if (/^(https?:|mailto:|#)/.test(href)) return href
  const [target, anchor] = href.split('#')
  const absolute = path.resolve(baseDir, decodeURIComponent(target))
  const relative = path.relative(ROOT, absolute).replace(/\\/g, '/')
  const isDir = target.endsWith('/') || (existsSync(absolute) && statSync(absolute).isDirectory())
  return `${REPO}/${isDir ? 'tree' : 'blob'}/main/${relative}${anchor ? `#${anchor}` : ''}`
}

function render(doc) {
  const file = path.resolve(DIR, doc)
  const baseDir = path.dirname(file)
  const source = readFileSync(file, 'utf8')

  const renderer = new marked.Renderer()

  renderer.image = ({ href, text }) => {
    const data = inlineImage(href, baseDir)
    if (!data) return `<p class="missing">[image not found: ${href}]</p>`
    // Placed later, once a browser can measure it (see the slicing step).
    const id = `img${figures.length}`
    figures.push({ id, data, alt: text || '' })
    return `<span class="figure-slot" id="${id}"></span>`
  }

  // Regular functions, not arrows: marked binds `this` to the renderer, and
  // `this.parser` turns a link's or heading's inline tokens back into HTML.
  renderer.link = function ({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens)
    const url = toGithubUrl(href, baseDir)
    return `<a href="${url}"${title ? ` title="${title}"` : ''}>${label}</a>`
  }

  // Headings inside an included document drop one level, so the part heading
  // stays the only h1 in its section.
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    const level = Math.min(depth + 1, 6)
    return `<h${level}>${text}</h${level}>`
  }

  return marked.parse(source, { renderer })
}

// --- Figures for the cover, read rather than typed -------------------------
const git = (command) => execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim()
const commit = git('git rev-parse --short HEAD')
const branch = git('git rev-parse --abbrev-ref HEAD')
const dirty = git('git status --porcelain') !== ''

function countFrom(file, pattern) {
  try {
    const match = readFileSync(path.join(DIR, 'test-runs', file), 'utf8').match(pattern)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}
const serverTests = countFrom('server.txt', /Tests\s+(\d+) passed/)
const clientTests = countFrom('client.txt', /Tests\s+(\d+) passed/)
const e2eTests = countFrom('e2e.txt', /(\d+) passed \(/)
const totalTests = [serverTests, clientTests, e2eTests].every((n) => n !== null)
  ? serverTests + clientTests + e2eTests
  : null
const testRunOn = (() => {
  try {
    return readFileSync(path.join(DIR, 'test-runs', 'server.txt'), 'utf8').split('\n')[1].replace(/^#\s*/, '')
  } catch {
    return 'not recorded'
  }
})()

const sections = PARTS.map((part) => {
  console.log(`Answer Part ${part.n}: ${part.docs.join(', ')}`)
  const body = part.docs.map(render).join('\n<hr class="doc-break">\n')
  return `
    <section class="part">
      <h1 class="part-heading">Answer Part ${part.n}:</h1>
      <p class="part-subtitle">${part.title} · ${part.points} points</p>
      ${body}
    </section>`
}).join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CPE334 Lab 3 — TokTickIT</title>
<style>
  :root { --ink: #1f2937; --muted: #6b7280; --line: #d1d5db; --green: #006b3c; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: var(--ink); font-size: 10.5pt; line-height: 1.5;
    font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  }
  .cover { text-align: center; padding: 30mm 0 0; page-break-after: always; }
  .cover h1 { font-size: 26pt; margin: 0 0 4mm; color: var(--green); }
  .cover .sub { font-size: 13pt; color: var(--muted); margin: 0 0 12mm; }
  .cover table { margin: 0 auto; border-collapse: collapse; font-size: 11pt; width: auto; }
  .cover td { padding: 2mm 6mm; text-align: left; border: 0; border-bottom: 1px solid var(--line); }
  .cover td:first-child { color: var(--muted); }
  .cover .toc { margin: 14mm auto 0; max-width: 130mm; text-align: left; }
  .cover .toc li { margin: 1.5mm 0; }

  section.part { page-break-before: always; }
  .part-heading {
    font-size: 19pt; margin: 0 0 1mm; color: var(--green);
    border-bottom: 2.5px solid var(--green); padding-bottom: 2mm;
  }
  .part-subtitle { margin: 0 0 6mm; color: var(--muted); font-size: 11pt; }

  h2 { font-size: 14pt; margin: 7mm 0 2mm; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 5mm 0 2mm; page-break-after: avoid; }
  h4, h5, h6 { font-size: 11pt; margin: 4mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin: 0.8mm 0; }

  table { border-collapse: collapse; width: 100%; margin: 3mm 0 4mm; font-size: 9pt; }
  th, td { border: 1px solid var(--line); padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eaf6ef; color: #14532d; }
  tr { page-break-inside: avoid; }

  code { background: #f3f4f6; padding: 0.4mm 1mm; border-radius: 2px; font-size: 8.8pt;
         font-family: "Cascadia Mono", Consolas, monospace; }
  pre { background: #f6f8fa; border: 1px solid var(--line); border-radius: 3px;
        padding: 2.5mm 3mm; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.2pt; white-space: pre-wrap; word-break: break-word; }

  blockquote { margin: 0 0 3mm; padding: 1mm 0 1mm 3mm; border-left: 3px solid #f59e0b;
               background: #fffbeb; color: #92400e; }

  figure { margin: 3mm 0 4mm; page-break-inside: avoid; text-align: center; }
  img { max-width: 100%; max-height: 235mm; border: 1px solid var(--line); border-radius: 3px; }
  td img { max-height: 170mm; }
  td figure { margin: 0; }
  figcaption { font-size: 8pt; color: var(--muted); margin-top: 1mm; }
  .missing { color: #dc2626; font-style: italic; font-weight: 600; }

  a { color: #0b7a46; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 5mm 0; }
  hr.doc-break { border-top: 2px dashed var(--line); margin: 8mm 0 6mm; }
</style>
</head>
<body>
  <div class="cover">
    <h1>TokTickIT</h1>
    <p class="sub">CPE334 Lab 3 — Authentication, IT Staff Operations and User Management</p>
    <table>
      <tr><td>Student</td><td>Thawat Boonsuk</td></tr>
      <tr><td>Student ID</td><td>67070501024</td></tr>
      <tr><td>GitHub</td><td>Chessuker</td></tr>
      <tr><td>Repository</td><td><a href="${REPO}">${REPO}</a></td></tr>
      <tr><td>Built from</td><td>${branch} at ${commit}${dirty ? ' (with uncommitted changes)' : ''}</td></tr>
      <tr><td>Tests</td><td>${totalTests ?? '—'} passing — ${serverTests ?? '—'} backend, ${clientTests ?? '—'} frontend, ${e2eTests ?? '—'} end-to-end; none skipped</td></tr>
      <tr><td>Test run</td><td>${testRunOn}</td></tr>
    </table>
    <div class="toc">
      <ol>
        ${PARTS.map((p) => `<li>Answer Part ${p.n}: ${p.title}</li>`).join('\n        ')}
      </ol>
    </div>
  </div>
  ${sections}
</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })

/**
 * Places each image. Standalone tall images are sliced into page-sized pieces
 * with a small overlap, so a reader never loses a line at a cut; images in a
 * table cell are placed whole and scaled by CSS. Done in the page because that
 * is where a canvas is.
 */
const sliceReport = await page.evaluate(
  async ({ figures, maxAspect }) => {
    const report = []
    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })

    for (const figure of figures) {
      const slot = document.getElementById(figure.id)
      if (!slot) continue

      const img = await load(figure.data)
      const aspect = img.naturalHeight / img.naturalWidth
      const inCell = Boolean(slot.closest('td'))
      const html = []

      if (inCell || aspect <= maxAspect) {
        html.push(
          `<figure><img src="${figure.data}" alt="${figure.alt}">` +
            (figure.alt && !inCell ? `<figcaption>${figure.alt}</figcaption>` : '') +
            `</figure>`,
        )
      } else {
        const sliceHeight = Math.round(img.naturalWidth * maxAspect)
        const overlap = Math.round(sliceHeight * 0.04)
        const step = sliceHeight - overlap
        const count = Math.ceil((img.naturalHeight - overlap) / step)

        for (let i = 0; i < count; i += 1) {
          const top = i * step
          const height = Math.min(sliceHeight, img.naturalHeight - top)
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = height
          canvas.getContext('2d').drawImage(img, 0, top, img.naturalWidth, height, 0, 0, img.naturalWidth, height)
          html.push(
            `<figure><img src="${canvas.toDataURL('image/png')}" alt="${figure.alt}">` +
              `<figcaption>${figure.alt || 'screenshot'} — ${i + 1} of ${count}</figcaption></figure>`,
          )
        }
        report.push({ alt: figure.alt, aspect: Math.round(aspect * 10) / 10, slices: count })
      }

      slot.outerHTML = html.join('')
    }
    return report
  },
  { figures, maxAspect: MAX_ASPECT },
)

for (const row of sliceReport) {
  console.log(`  sliced "${row.alt}" (aspect ${row.aspect}:1) into ${row.slices} pieces`)
}

await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8pt;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;">' +
    '<span>CPE334 Lab 3 — TokTickIT — Thawat Boonsuk 67070501024</span>' +
    '<span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
})
await browser.close()

console.log(`\n${path.relative(ROOT, OUT)}`)
console.log(`${inlined} images inlined (${(inlinedBytes / 1024 / 1024).toFixed(1)} MB of source)`)
console.log(`PDF size: ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`)
if (missing.length > 0) {
  console.warn(`\n${missing.length} image(s) not found — shown in red in the PDF:`)
  for (const file of missing) console.warn(`  ${file}`)
}
