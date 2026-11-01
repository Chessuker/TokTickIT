# TokTickIT

TokTickIT is a full-stack IT ticketing portal built with a React + Express + PostgreSQL stack. Requesters sign in, raise tickets with attachments and follow them; IT Staff work the queue, record the actions they take and resolve tickets through a guarded workflow; Administrators manage accounts. Every role lands on its own dashboard. Every request is authorised on the server from a session cookie.

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Demo walkthrough](#demo-walkthrough)
- [Available scripts](#available-scripts)
- [Tests](#tests)
- [Lab documentation](#lab-documentation)
- [Contact](#contact)

## Features

- **Authentication (Lab 3)** — email + password login, bcrypt-hashed passwords, an `httpOnly` session cookie backed by a `Session` table, logout that revokes the session, login throttling, and a forced password change for accounts on an initial password. Every protected endpoint checks the session and role on the server.
- **Roles** — Requester, IT Staff and Administrator, each with its own navigation; every role lands on `/dashboard` after login. The wrong role gets a Forbidden state in the UI and a `403` from the API.
- **Dashboards (Lab 4)** — a Requester sees counts of their own open, waiting-for-them, resolved and closed tickets plus three short lists; IT Staff see unassigned work, their own tickets and open follow-ups, counts by status and IT Priority, urgent and recently updated tickets and their recent actions; Administrators get the same view without the "my" cards plus user-account counts. Every number is computed by the server on each request, and every card links to the list it counts — the list's total always equals the card.
- **Actions Taken (Lab 4)** — IT Staff and Administrators record what was done on a ticket (date/time, description, result, attachment notes) with an optional follow-up assigned to an active IT Staff member and closed as done or cancelled. Performed by is set by the server, entries are never deleted, an edit made from an old copy is refused with a Reload prompt, and the Requester sees the same list read-only as "Work done by IT".
- **Ticket workflow (Lab 4)** — a ticket can be Resolved only with an owner, an action recorded since it was last reopened and no open follow-up; the screen says which condition is missing. Every status change is written to an append-only history shown to staff and the Requester, and two people changing the same ticket at once cannot overwrite each other (`409 STALE_UPDATE`).
- **Requester ticketing (Lab 2)** — create tickets, list and search your own tickets, open a read-only detail view, and attach, download or soft-remove files. Ownership is enforced from the session identity.
- **Public Comments and "Problem appears resolved" (Lab 3)** — a Requester comments on their own ticket and IT Staff on any ticket; the thread is readable by all three roles, newest first, and bodies are stored and rendered as plain text. A Requester can flag an open ticket as "appears resolved" (`requesterResolvedAt`) without touching its status.
- **IT Staff Ticket Queue (Lab 3)** — every ticket in the system with search, status / IT priority / owner / category filters, sortable columns and pagination, all done server-side (`GET /api/staff/tickets`). The queue state lives in the URL so a filtered view can be shared or returned to. Administrators see the same list read-only.
- **IT Staff ticket operations (Lab 3)** — claim, assign or unassign an owner, set an IT Priority independent of what the requester asked for, and move the ticket through a server-enforced status workflow (`New → Open → In Progress → … → Closed`, with `Reopened` and `Cancelled`). Public Comments reach the requester; Internal Notes never do. Administrators see the same screen read-only.
- **Administrator user management (Lab 3)** — one screen to search the directory, filter by role, create an account with a one-time initial password, edit name, email, role and activation, and hand out a new initial password. Nobody is ever deleted: deactivation retires an account and signs it out immediately, and the server refuses both self-deactivation and removing the last active administrator.
- **Consistent feedback (Lab 4 hardening)** — loading, validation, success, empty, forbidden, not-found, conflict and safe-failure states look and behave the same on every screen; no form sends twice on a double submit; forms keep what was typed after a recoverable failure; every dialog keeps keyboard focus inside and returns it; every date is shown in Bangkok time.
- **Live health check** — `GET /api/health` runs `SELECT 1` against Postgres and returns `200`/`ok` or `503`/`error` based on real DB connectivity.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Bootstrap 5 |
| Backend | Node.js, Express, TypeScript |
| Database / ORM | PostgreSQL, Prisma |
| Testing | Vitest, React Testing Library (frontend), Vitest + Supertest (backend), Playwright (end-to-end) |
| Linting | oxlint |

## Project structure

```
TokTickIT/
├── client/                    # React + Vite frontend
│   └── src/
│       ├── App.tsx            # Route table and role guards
│       ├── components/        # Lab 2 screens, shared Badges / Modal
│       │   ├── lab-03/        # Login, Queue, Staff Ticket Detail, Users, comments and notes
│       │   └── lab-04/        # Dashboards, Actions Taken, History, date helpers
│       └── styles/zen-green.css
├── server/                    # Express + Prisma backend
│   ├── src/
│   │   ├── app.ts             # Express app, Requester routes, health
│   │   ├── staffRoutes.ts     # Queue, staff detail, workflow (gate, version, history)
│   │   ├── actionRoutes.ts    # Actions Taken
│   │   ├── dashboardRoutes.ts # Both dashboards
│   │   ├── dashboardMetrics.ts# Each card's count and drill-down link, defined together
│   │   ├── ticketWorkflow.ts  # Transition matrix and resolution gate
│   │   └── seed.ts            # Idempotent seed
│   ├── prisma/                # schema.prisma, migrations, rollback/
│   ├── scripts/               # Migration, integration and performance checks against PostgreSQL
│   └── tests/                 # Unit and API suites (lab-03/, lab-04/)
├── e2e/                       # Playwright suites (Lab 2 flows, lab-03/, lab-04/)
├── artifacts/lab-0N/          # Screenshots captured by the E2E suites
├── docs/lab-0N/               # CPE334 lab write-ups (specification, API/UI spec, tests, AI usage, review)
└── package.json               # Root scripts that fan out to client/server
```

## Requirements

- Node.js >= 18 (developed on v24)
- npm >= 10
- PostgreSQL >= 13 — either a local instance, a hosted connection string, or Docker (a `docker-compose.yml` is included)

## Installation

```bash
git clone https://github.com/Chessuker/TokTickIT.git
cd TokTickIT
npm --prefix client install
npm --prefix server install
```

## Configuration

Start a local PostgreSQL with Docker (listens on host port **5433** so it does not clash with an existing 5432 instance):

```bash
docker compose up -d
```

Then copy the example env file and fill in real values:

```bash
cp server/.env.example server/.env
```

`server/.env`:

```
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/toktickit?schema=public"
CLIENT_ORIGIN=http://localhost:5173
```

The database value matches the bundled `docker-compose.yml`. Point it at your own instance if you are not using Docker. `CLIENT_ORIGIN` is the browser origin allowed to send the session cookie (CORS with credentials); change it only if the Vite dev server runs somewhere other than port 5173.

The frontend reads `VITE_API_URL` (defaults to `http://localhost:5000` if unset) — set it in a `client/.env` file if your API isn't running on the default port.

Then generate the Prisma client, apply the migrations, and seed the database. The seed is idempotent — running it again never duplicates rows:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Usage

Run backend and frontend in separate terminals:

```bash
npm run dev:server   # http://localhost:5000
npm run dev:client   # http://localhost:5173
```

Open `http://localhost:5173` in a browser and sign in with one of the accounts below. Every role lands on its dashboard.

### Local development accounts

The seed creates these accounts for local development only (never use them anywhere else). Re-running the seed resets each of them to the password and state listed here.

| Name | Email | Password | Role | State |
| --- | --- | --- | --- | --- |
| Jennifer Anderson | `jennifer.anderson@kmutt.ac.th` | `Requester1!` | Requester | ready |
| David Lee | `david.lee@kmutt.ac.th` | `Requester2!` | Requester | ready |
| Sarah Johnson | `sarah.johnson@kmutt.ac.th` | `Welcome123!` | Requester | must change password at first login |
| Michael Brown | `michael.brown@kmutt.ac.th` | `Welcome123!` | Requester | must change password at first login |
| Alex Smith | `alex.smith@kmutt.ac.th` | `Welcome123!` | Requester | **inactive** — login refused |
| Ploy Charoen | `ploy.charoen@kmutt.ac.th` | `Requester3!` | Requester | ready; has **no tickets** (empty dashboard) |
| Nattapong Srisuk | `nattapong.srisuk@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Priya Raman | `priya.raman@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Chen Wei | `chen.wei@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Robert Wilson | `robert.wilson@kmutt.ac.th` | `Staff1!pass` | IT Staff | **inactive** — login refused |
| System Administrator | `admin@toktickit.xyz` | `Admin1!pass` | Administrator | ready |

Requesters migrated from a Lab 2 database receive `Welcome123!` as their initial password once the seed has run, and must change it at first login.

The seed also creates 24 sample tickets numbered `TKT-2026-900001` … `TKT-2026-900024` across the four active Requesters, covering every status and priority, about a third unassigned and the rest owned by the three active IT Staff. That range is reserved: user-created tickets keep counting from `TKT-2026-000001`, and re-running the seed resets the sample tickets without touching anything else. Each worked ticket also carries a short Public Comment thread and, where IT Staff are involved, one or two Internal Notes.

Lab 4 adds 22 Actions Taken (none on New tickets, one on most worked tickets, three by different IT Staff on `TKT-2026-900007`), with open follow-ups assigned to each IT Staff member, and a status history for every ticket that has moved. `TKT-2026-900019` is deliberately left with neither, to show how a ticket closed before Lab 4 looks.

## Demo walkthrough

A five-minute tour of the Lab 4 features on a freshly seeded database:

1. **Requester dashboard** — sign in as Jennifer. Follow "Waiting for you": My Tickets opens filtered to the same tickets, and its total equals the card. Open a ticket to see "Work done by IT" and its collapsible status history.
2. **Empty dashboard** — sign in as Ploy, who has no tickets: one panel with Create Ticket.
3. **IT Staff dashboard** — sign in as Priya. Follow "My open follow-ups" (the Queue lists the tickets that hold them) and a row in "My recent actions" (it opens on the Actions Taken tab).
4. **Actions Taken** — open `TKT-2026-900007`: three actions by three IT Staff, one with an open follow-up. Record an action with a follow-up assigned to Chen.
5. **Resolution gate** — on `TKT-2026-900012` (Reopened, no action since), Resolved is missing from the status choices and the hint says why. Record an action: Resolved appears without a reload. Resolve it, then open the History tab.
6. **Stale update** — open the same ticket as Priya in one browser and as Chen in another (or a private window). Change the status in one, then the IT Priority in the other: the second is told someone changed it first and offered Reload.
7. **Administrator** — sign in as the System Administrator: the dashboard has no "my" cards but shows user-account counts; the Users screen and the read-only Queue work as in Lab 3.

### Upgrading a Lab 2 database

The Lab 3 migration renames `RequesterUser` to `User` in place, so existing tickets and attachments keep their owners. To verify that on a database holding Lab 2 data:

```bash
npm --prefix server exec tsx scripts/verify-lab03-migration.ts before   # snapshot counts on the Lab 2 schema
npm run prisma:migrate
npm --prefix server exec tsx scripts/verify-lab03-migration.ts after    # compare, before seeding
npm run prisma:seed
```

### Upgrading a Lab 3 database

The Lab 4 migration (`20261003000000_lab04_actions_taken`) only adds tables, an enum, one index and `Ticket.version`; it changes no existing row. To verify that, and that the rollback script returns the Lab 3 schema intact, on a database holding Lab 3 data (back it up first with `pg_dump` if the data matters):

```bash
npm --prefix server exec tsx scripts/verify-lab04-migration.ts before          # snapshot on the Lab 3 schema
npm run prisma:migrate
npm --prefix server exec tsx scripts/verify-lab04-migration.ts after           # MIG-01
npm --prefix server exec prisma db execute --file prisma/rollback/20261003000000_lab04_actions_taken.down.sql --schema prisma/schema.prisma
npm --prefix server exec tsx scripts/verify-lab04-migration.ts after-rollback  # MIG-02
npm run prisma:migrate                                                         # re-apply
npm run prisma:seed
npm --prefix server exec tsx scripts/verify-lab04-concurrency.ts               # INT-02, INT-03: status race, follow-up CHECK constraints
npm --prefix server exec tsx scripts/verify-lab04-dashboards.ts                # INT-01: every dashboard number against raw SQL
npm --prefix server exec tsx scripts/perf-lab04-smoke.ts                       # PERF-01: dashboard and Actions response times
```

## Available scripts

Run from the repo root (each forwards to the relevant workspace):

| Script | Description |
| --- | --- |
| `npm run dev:client` | Start the Vite dev server |
| `npm run dev:server` | Start the Express server with `tsx watch` |
| `npm run build:client` | Type-check and build the frontend |
| `npm run build:server` | Compile the backend with `tsc` |
| `npm run test:client` | Run frontend tests (Vitest) |
| `npm run test:server` | Run backend tests (Vitest + Supertest) |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:db:push` | Push `schema.prisma` to the database |
| `npm run prisma:migrate` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run prisma:seed` | Seed reference data and local accounts — safe to re-run |
| `npm run test:e2e` | Run the Playwright suites against a migrated, seeded database |

Additional server-only scripts (`npm --prefix server run ...`): `prisma:migrate`, `prisma:seed`.

## Tests

```bash
npm run test:server   # Supertest against Express, Prisma mocked — no live DB needed
npm run test:client   # Vitest + React Testing Library
npm run test:e2e      # Playwright: every Lab 2, 3 and 4 flow in a real browser
```

The first two run without a database. The end-to-end suite needs PostgreSQL migrated and seeded (`npm run prisma:migrate && npm run prisma:seed`), starts the API and Vite itself, and creates its own tickets; re-seed afterwards to put the sample data back. With `CAPTURE=1` the Lab 4 suites also write the screenshots under `artifacts/lab-04/screenshots/`:

```bash
CAPTURE=1 npx playwright test e2e/lab-04
```

The checks that need a real database (dashboard numbers against SQL, the concurrent status race, response times) are the scripts listed under [Upgrading a Lab 3 database](#upgrading-a-lab-3-database). See [docs/lab-04/tests.md](docs/lab-04/tests.md) for what each test covers and the latest results.

## Lab documentation

This repo doubles as the CPE334 lab submissions. Each lab's contract and evidence live under `docs/`:

- [`docs/lab-04/`](docs/lab-04/) — Actions Taken, workflow and dashboards: specification, API spec, UI spec, test plan, issues, AI usage, review (current sprint)
- [`docs/lab-03/`](docs/lab-03/) — authentication, Staff Queue and ticket operations, user management
- [`docs/lab-02/`](docs/lab-02/) — Requester ticketing sprint
- [`docs/lab-01/`](docs/lab-01/) — project foundation

## Contact

Project author: [Chessuker](https://github.com/Chessuker) — repo: [github.com/Chessuker/TokTickIT](https://github.com/Chessuker/TokTickIT)
