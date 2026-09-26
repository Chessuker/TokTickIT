/**
 * Direct-API authorization evidence for Answer Part 7 (lab sheet §14).
 *
 * The UI hides controls a role may not use; this script goes around the UI and
 * calls the endpoints directly, as each role and with no session at all, to
 * show that the server is the rule (FR-04, BR-17, BR-23, BR-30, AC-12). Every
 * line records the request, the status the specification expects, the status
 * that came back, and the response body — verbatim, only shortened when long.
 *
 * Run from the repository root with the API up and seeded:
 *   node docs/lab-03/scripts/capture-api-authorization.mjs
 *
 * Output: docs/lab-03/test-runs/api-authorization.txt (exits non-zero if any
 * status differs from the expectation, so the evidence cannot silently rot).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'test-runs', 'api-authorization.txt')
const API = 'http://localhost:5000'

const ACCOUNTS = {
  Requester: { email: 'jennifer.anderson@kmutt.ac.th', password: 'Requester1!' },
  'Other Requester': { email: 'david.lee@kmutt.ac.th', password: 'Requester2!' },
  'IT Staff': { email: 'priya.raman@kmutt.ac.th', password: 'Staff1!pass' },
  Administrator: { email: 'admin@toktickit.xyz', password: 'Admin1!pass' },
}

/** Signs in and returns the session cookie, exactly as a browser would hold it. */
async function sessionFor(account) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  })
  if (!res.ok) throw new Error(`login failed for ${account.email}: ${res.status}`)
  return res.headers.get('set-cookie').split(';')[0]
}

const cookies = {}
for (const [role, account] of Object.entries(ACCOUNTS)) cookies[role] = await sessionFor(account)

async function call(role, method, route, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (role !== 'no session') headers.Cookie = cookies[role]
  const res = await fetch(`${API}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, text }
}

// --- Fixture: a fresh ticket of Jennifer's, with a note only staff may read ---
const categories = await (await fetch(`${API}/api/categories`, { headers: { Cookie: cookies.Requester } })).json()
const systems = await (await fetch(`${API}/api/related-systems`, { headers: { Cookie: cookies.Requester } })).json()
const created = await call('Requester', 'POST', '/api/tickets', {
  summary: 'Authorization evidence ticket',
  description: 'Created by capture-api-authorization.mjs to exercise the role rules.',
  categoryId: categories.data[0].id,
  relatedSystemId: systems.data[0].id,
  priority: 'Medium',
})
const TICKET = JSON.parse(created.text).id
const NOTE = 'PRIVATE: vendor case 4471, do not share'
await call('IT Staff', 'POST', `/api/staff/tickets/${TICKET}/internal-notes`, { body: NOTE })
const me = JSON.parse((await call('Requester', 'GET', '/api/auth/me')).text)
const ADMIN_ID = JSON.parse((await call('Administrator', 'GET', '/api/auth/me')).text).id

/** Each case: who, what, the status the spec requires, and the rule it proves. */
const CASES = [
  ['— No session (BR-30, AC-12)'],
  ['no session', 'GET', '/api/staff/tickets', undefined, 401, 'no cookie: 401 before anything is read'],
  ['no session', 'GET', `/api/tickets/${TICKET}`, undefined, 401, ''],
  ['no session', 'GET', '/api/admin/users', undefined, 401, ''],

  ['— Requester reaching staff and admin routes (FR-04, AC-04, AC-30)'],
  ['Requester', 'GET', '/api/staff/tickets', undefined, 403, 'the queue is staff-only'],
  ['Requester', 'GET', `/api/staff/tickets/${TICKET}/internal-notes`, undefined, 403, 'her own ticket, and still no note, count or hint (BR-23)'],
  ['Requester', 'POST', `/api/staff/tickets/${TICKET}/claim`, undefined, 403, ''],
  ['Requester', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'Resolved' }, 403, 'a Requester cannot set status (BR-05)'],
  ['Requester', 'PATCH', `/api/tickets/${TICKET}/status`, { status: 'Resolved' }, 404, 'there is no Requester status route at all'],
  ['Requester', 'GET', '/api/admin/users', undefined, 403, ''],
  ['Requester', 'GET', `/api/tickets/${TICKET}`, undefined, 200, 'her own ticket is readable …'],
  ['Other Requester', 'GET', `/api/tickets/${TICKET}`, undefined, 403, '… another requester gets 403 and no ticket data (BR-14)'],

  ['— IT Staff: the workflow is the server’s (BR-15, BR-18, BR-19, BR-31)'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'Closed' }, 409, 'New → Closed is not in the matrix'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'InProgress' }, 409, 'In Progress needs an owner (AC-22)'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/owner`, { ownerId: me.id }, 400, 'a Requester cannot be an owner (AC-19)'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'Bogus' }, 400, 'unknown status value'],
  ['IT Staff', 'POST', `/api/staff/tickets/${TICKET}/claim`, undefined, 200, 'claim: owner = caller, New → Open'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'InProgress' }, 200, 'now permitted'],
  ['IT Staff', 'PATCH', `/api/staff/tickets/${TICKET}/owner`, { ownerId: null }, 409, 'an In Progress ticket must keep an owner'],
  ['IT Staff', 'POST', `/api/tickets/${TICKET}/attachments`, undefined, 403, 'staff read attachments but never add them (BR-14)'],
  ['IT Staff', 'GET', '/api/admin/users', undefined, 403, 'user management is Administrator-only (API-15)'],

  ['— Administrator: reads everything, changes no ticket (BR-17)'],
  ['Administrator', 'GET', `/api/staff/tickets/${TICKET}`, undefined, 200, 'read the ticket …'],
  ['Administrator', 'GET', `/api/staff/tickets/${TICKET}/internal-notes`, undefined, 200, '… and its notes'],
  ['Administrator', 'POST', `/api/staff/tickets/${TICKET}/claim`, undefined, 403, 'no claim'],
  ['Administrator', 'PATCH', `/api/staff/tickets/${TICKET}/it-priority`, { itPriority: 'Low' }, 403, 'no IT priority'],
  ['Administrator', 'PATCH', `/api/staff/tickets/${TICKET}/status`, { status: 'WaitingForRequester' }, 403, 'no status'],
  ['Administrator', 'POST', `/api/staff/tickets/${TICKET}/internal-notes`, { body: 'admin note' }, 403, 'no note'],
  ['Administrator', 'POST', `/api/tickets/${TICKET}/comments`, { body: 'admin comment' }, 403, 'no comment'],
  ['Administrator', 'PATCH', `/api/admin/users/${ADMIN_ID}`, { isActive: false }, 409, 'cannot deactivate themselves (BR-25)'],
]

const lines = [
  `TokTickIT — direct API authorization evidence`,
  `Run: ${new Date().toISOString()} against ${API}`,
  `Fixture: ticket ${JSON.parse(created.text).ticketNumber} raised by Jennifer (Requester), with one Internal Note by Priya (IT Staff)`,
  '',
]
let failures = 0

for (const entry of CASES) {
  if (entry.length === 1) {
    lines.push('', entry[0])
    continue
  }
  const [role, method, route, body, expected, why] = entry
  const { status, text } = await call(role, method, route, body)
  const ok = status === expected
  if (!ok) failures += 1
  // One line per response, so a multi-line body cannot break the transcript's layout.
  const flat = text.replace(/\s+/g, ' ')
  const shown = flat.length > 170 ? `${flat.slice(0, 167)}…` : flat
  lines.push(
    `$ ${method} ${route.replace(TICKET, '<ticket>').replace(ADMIN_ID, '<own id>')}${body ? ` ${JSON.stringify(body).replace(me.id, '<requester id>')}` : ''}   # as ${role}${why ? ` — ${why}` : ''}`,
    `  expected ${expected} · got ${status} ${ok ? 'PASS' : 'FAIL'}   ${shown}`,
  )
}

// The note must be absent from every Requester-facing response (AC-23).
const requesterDetail = await call('Requester', 'GET', `/api/tickets/${TICKET}`)
const requesterComments = await call('Requester', 'GET', `/api/tickets/${TICKET}/comments`)
const leaked = requesterDetail.text.includes(NOTE) || requesterComments.text.includes(NOTE)
if (leaked) failures += 1
lines.push(
  '',
  '— Internal Note never reaches the Requester (AC-23)',
  `  note text in GET /api/tickets/<ticket> as Requester: ${requesterDetail.text.includes(NOTE) ? 'FOUND — FAIL' : 'absent — PASS'}`,
  `  note text in GET /api/tickets/<ticket>/comments as Requester: ${requesterComments.text.includes(NOTE) ? 'FOUND — FAIL' : 'absent — PASS'}`,
  '',
  `${CASES.filter((entry) => entry.length > 1).length + 1} checks, ${failures === 0 ? 'all passed' : `${failures} FAILED`}.`,
)

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n')
console.log(lines.join('\n'))
process.exit(failures === 0 ? 0 : 1)
