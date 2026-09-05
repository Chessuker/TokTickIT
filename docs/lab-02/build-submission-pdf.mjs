/**
 * Assembles the single submission PDF the lab sheet asks for (§14).
 *
 * Nine sections headed `Answer Part 1:` … `Answer Part 9:` in that exact order,
 * each one built from the markdown already in this folder — nothing is retyped
 * here, so the PDF and the repository cannot drift apart. Images are inlined
 * from disk; links to other documents are rewritten to their GitHub URLs on
 * `main`, so every link in the PDF is clickable and lands somewhere real.
 *
 * Run from the repository root:
 *   node docs/lab-02/build-submission-pdf.mjs
 *
 * Output: docs/lab-02/CPE334-Lab2-67070501024-Thawat.pdf
 */
import { chromium } from '@playwright/test'
import { marked } from 'marked'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'https://github.com/Chessuker/TokTickIT'
const BLOB = `${REPO}/blob/main/docs/lab-02`
const OUT = path.join(DIR, 'CPE334-Lab2-67070501024-Thawat.pdf')

/**
 * What goes under each heading. `docs` are concatenated in order; the lab sheet
 * asks for the source documents themselves to be rendered under several parts,
 * so those are appended after the answer page that introduces them.
 */
const PARTS = [
  { n: 1, title: 'Git Use with Engineering Workflow', points: 10,
    docs: ['answer-part1-git-workflow.md', 'reviewer.md'] },
  { n: 2, title: 'Spec-Driven Development', points: 5,
    docs: ['answer-part2-spec-evidence.md', 'specification.md'] },
  { n: 3, title: 'Test-Driven Development and Traceability', points: 10,
    docs: ['answer-part3-test-runs.md', 'tests.md'] },
  { n: 4, title: 'AI Use with Reflection', points: 5,
    docs: ['ai-use.md'] },
  { n: 5, title: 'Development Requester Select Screen', points: 0,
    docs: ['answer-part5-requester-selector.md'] },
  { n: 6, title: 'Working Ticket Screen — Create Mode', points: 10,
    docs: ['answer-part6-screenshots.md'] },
  { n: 7, title: 'Working My Tickets Screen', points: 10,
    docs: ['answer-part7-screenshots.md'] },
  { n: 8, title: 'Working Ticket Screen — View Mode and Attachments', points: 5,
    docs: ['answer-part8-screenshots.md'] },
  { n: 9, title: 'Zen Green UI and Responsive Evidence', points: 5,
    docs: ['answer-part9-screenshots.md', 'ui-spec.md'] },
]

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
}

let inlined = 0
let inlinedBytes = 0

/** Every image in document order, filled in as the markdown is rendered. */
const figures = []

/**
 * A full-page screenshot of a mobile screen can be nine times taller than it is
 * wide. Scaled to the width of an A4 column it would run a metre down the page,
 * and Chrome cannot break an image across pages — so the tall ones are cut into
 * slices that each fit, and printed one after another. Anything at or below this
 * ratio is left alone.
 */
const MAX_ASPECT = 1.7

/** Inlines a local image as a data URI so the PDF carries no external refs. */
function inlineImage(src) {
  const clean = decodeURIComponent(src.split('#')[0])
  const file = path.resolve(DIR, clean)
  if (!existsSync(file)) {
    console.warn('  missing image:', clean)
    return null
  }
  const type = MIME[path.extname(file).toLowerCase()]
  if (!type) return null
  inlined += 1
  inlinedBytes += statSync(file).size
  return `data:${type};base64,${readFileSync(file).toString('base64')}`
}

/** Rewrites a relative document link to its GitHub URL on `main`. */
function toGithubUrl(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href
  const clean = href.replace(/^\.\//, '')
  if (clean.startsWith('../../')) return `${REPO}/blob/main/${clean.slice(6)}`
  return `${BLOB}/${clean}`
}

function render(file) {
  const source = readFileSync(path.join(DIR, file), 'utf8')

  const renderer = new marked.Renderer()

  renderer.image = ({ href, text }) => {
    const data = inlineImage(href)
    if (!data) return `<p class="missing">[image not found: ${href}]</p>`
    // Tall captures are sliced later, once a browser is available to measure
    // them; the placeholder carries everything that step needs.
    const id = `img${figures.length}`
    figures.push({ id, data, alt: text || '', href })
    return `<div class="figure-slot" id="${id}"></div>`
  }

  // Regular functions, not arrows: marked binds `this` to the renderer, and
  // `this.parser` is what turns a link's or heading's inline tokens back into
  // HTML. Without it, `code` inside a link comes out as literal backticks.
  renderer.link = function ({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens)
    const url = toGithubUrl(href)
    return `<a href="${url}"${title ? ` title="${title}"` : ''}>${label}</a>`
  }

  // Headings inside an included document drop one level, so the part heading
  // stays the only h1 in its section.
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    const level = Math.min(depth + 1, 6)
    return `<h${level}>${text}</h${level}>`
  }

  return marked.parse(source, { renderer, mangle: false, headerIds: false })
}

const sections = PARTS.map((part) => {
  console.log(`Answer Part ${part.n}: ${part.docs.join(', ')}`)
  const body = part.docs.map(render).join('\n<hr class="doc-break">\n')
  return `
    <section class="part">
      <h1 class="part-heading">Answer Part ${part.n}:</h1>
      <p class="part-subtitle">${part.title}${part.points ? ` · ${part.points} points` : ' · graded within Part 6'}</p>
      ${body}
    </section>`
}).join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CPE334 Lab 2 — TokTickIT</title>
<style>
  :root { --ink: #1f2937; --muted: #6b7280; --line: #d1d5db; --green: #006b3c; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: var(--ink); font-size: 10.5pt; line-height: 1.5;
    font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  }
  .cover { text-align: center; padding: 34mm 0 0; page-break-after: always; }
  .cover h1 { font-size: 26pt; margin: 0 0 4mm; color: var(--green); }
  .cover .sub { font-size: 13pt; color: var(--muted); margin: 0 0 14mm; }
  .cover table { margin: 0 auto; border-collapse: collapse; font-size: 11pt; }
  .cover td { padding: 2mm 6mm; text-align: left; border-bottom: 1px solid var(--line); }
  .cover td:first-child { color: var(--muted); }
  .cover .toc { margin: 16mm auto 0; max-width: 130mm; text-align: left; }
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

  blockquote { margin: 0 0 3mm; padding-left: 3mm; border-left: 3px solid var(--line); color: var(--muted); }

  figure { margin: 3mm 0 4mm; page-break-inside: avoid; text-align: center; }
  img { max-width: 100%; max-height: 235mm; border: 1px solid var(--line); border-radius: 3px; }
  figcaption { font-size: 8pt; color: var(--muted); margin-top: 1mm; }
  .missing { color: #dc2626; font-style: italic; }

  a { color: #0b7a46; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 5mm 0; }
  hr.doc-break { border-top: 2px dashed var(--line); margin: 8mm 0 6mm; }
</style>
</head>
<body>
  <div class="cover">
    <h1>TokTickIT</h1>
    <p class="sub">CPE334 Lab 2 — Requester Ticketing Sprint</p>
    <table>
      <tr><td>Student</td><td>Thawat Boonsuk</td></tr>
      <tr><td>Student ID</td><td>67070501024</td></tr>
      <tr><td>GitHub</td><td>Chessuker</td></tr>
      <tr><td>Repository</td><td>${REPO}</td></tr>
      <tr><td>Branch</td><td>main at 9936b8c</td></tr>
      <tr><td>Peer reviewer</td><td>Theehathat (67070501019, TeekhathatTT)</td></tr>
      <tr><td>Tests on main</td><td>226 passing — 130 backend, 80 frontend, 16 end-to-end</td></tr>
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
 * Slices each tall image into page-sized pieces with a small overlap, so a
 * reader never loses a line of text at a cut. Done in the page because that is
 * where a canvas is: each slice comes back as its own data URI.
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
      const html = []

      if (aspect <= maxAspect) {
        html.push(`<figure><img src="${figure.data}" alt="${figure.alt}"></figure>`)
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
          canvas.getContext('2d').drawImage(
            img, 0, top, img.naturalWidth, height, 0, 0, img.naturalWidth, height,
          )
          html.push(
            `<figure><img src="${canvas.toDataURL('image/png')}" alt="${figure.alt}">` +
            `<figcaption>${figure.alt || 'screenshot'} — ${i + 1} of ${count}</figcaption></figure>`,
          )
        }
        report.push({ href: figure.href, aspect: Math.round(aspect * 10) / 10, slices: count })
      }

      slot.outerHTML = html.join('<br>')
    }

    return report
  },
  { figures, maxAspect: MAX_ASPECT },
)

for (const row of sliceReport) {
  console.log(`  sliced ${row.href} (aspect ${row.aspect}:1) into ${row.slices} pieces`)
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
    '<span>CPE334 Lab 2 — TokTickIT — Thawat Boonsuk 67070501024</span>' +
    '<span class="pageNumber"></span>/<span class="totalPages"></span></div>',
})
await browser.close()

console.log(
  `\n${OUT}\n${inlined} images inlined (${(inlinedBytes / 1024 / 1024).toFixed(1)} MB of source)`,
)
console.log(`PDF size: ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`)
