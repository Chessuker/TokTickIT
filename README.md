# TokTickIT

TokTickIT is a full-stack IT ticketing portal built with a React + Express + PostgreSQL stack. Requesters sign in, raise tickets with attachments and follow them; IT Staff and Administrators get their own areas. Every request is authorised on the server from a session cookie.

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Available scripts](#available-scripts)
- [Tests](#tests)
- [Lab documentation](#lab-documentation)
- [Contact](#contact)

## Features

- **Authentication (Lab 3)** — email + password login, bcrypt-hashed passwords, an `httpOnly` session cookie backed by a `Session` table, logout that revokes the session, login throttling, and a forced password change for accounts on an initial password. Every protected endpoint checks the session and role on the server.
- **Roles** — Requester, IT Staff and Administrator, each with its own navigation and home screen; the wrong role gets a Forbidden state in the UI and a `403` from the API.
- **Requester ticketing (Lab 2)** — create tickets, list and search your own tickets, open a read-only detail view, and attach, download or soft-remove files. Ownership is enforced from the session identity.
- **Public Comments and "Problem appears resolved" (Lab 3)** — a Requester comments on their own ticket and IT Staff on any ticket; the thread is readable by all three roles, newest first, and bodies are stored and rendered as plain text. A Requester can flag an open ticket as "appears resolved" (`requesterResolvedAt`) without touching its status.
- **Live health check** — `GET /api/health` runs `SELECT 1` against Postgres and returns `200`/`ok` or `503`/`error` based on real DB connectivity.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Bootstrap 5 |
| Backend | Node.js, Express, TypeScript |
| Database / ORM | PostgreSQL, Prisma |
| Testing | Vitest, React Testing Library (frontend), Vitest + Supertest (backend) |
| Linting | oxlint |

## Project structure

```
TokTickIT/
├── client/          # React + Vite frontend
│   └── src/
│       ├── App.tsx
│       └── components/CategoryList.tsx
├── server/          # Express + Prisma backend
│   ├── src/
│   │   ├── app.ts       # Express app & routes
│   │   ├── index.ts     # Entrypoint
│   │   ├── db.ts        # Prisma client
│   │   └── seed.ts      # DB seed script
│   ├── prisma/schema.prisma
│   └── tests/app.test.ts
├── e2e/             # Playwright end-to-end suites (lab-02 flows + lab-03/)
├── docs/lab-0N/     # CPE334 lab write-ups (specification, API/UI spec, tests, AI usage, review)
└── package.json     # Root scripts that fan out to client/server
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

Open `http://localhost:5173` in a browser and sign in with one of the accounts below.

### Local development accounts

The seed creates these accounts for local development only (never use them anywhere else). Re-running the seed resets each of them to the password and state listed here.

| Name | Email | Password | Role | State |
| --- | --- | --- | --- | --- |
| Jennifer Anderson | `jennifer.anderson@kmutt.ac.th` | `Requester1!` | Requester | ready |
| David Lee | `david.lee@kmutt.ac.th` | `Requester2!` | Requester | ready |
| Sarah Johnson | `sarah.johnson@kmutt.ac.th` | `Welcome123!` | Requester | must change password at first login |
| Michael Brown | `michael.brown@kmutt.ac.th` | `Welcome123!` | Requester | must change password at first login |
| Alex Smith | `alex.smith@kmutt.ac.th` | `Welcome123!` | Requester | **inactive** — login refused |
| Nattapong Srisuk | `nattapong.srisuk@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Priya Raman | `priya.raman@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Chen Wei | `chen.wei@kmutt.ac.th` | `Staff1!pass` | IT Staff | ready |
| Robert Wilson | `robert.wilson@kmutt.ac.th` | `Staff1!pass` | IT Staff | **inactive** — login refused |
| System Administrator | `admin@toktickit.xyz` | `Admin1!pass` | Administrator | ready |

Requesters migrated from a Lab 2 database receive `Welcome123!` as their initial password once the seed has run, and must change it at first login.

### Upgrading a Lab 2 database

The Lab 3 migration renames `RequesterUser` to `User` in place, so existing tickets and attachments keep their owners. To verify that on a database holding Lab 2 data:

```bash
npm --prefix server exec tsx scripts/verify-lab03-migration.ts before   # snapshot counts on the Lab 2 schema
npm run prisma:migrate
npm --prefix server exec tsx scripts/verify-lab03-migration.ts after    # compare, before seeding
npm run prisma:seed
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
```

Both suites run without a database. The Playwright end-to-end suite (`npm run test:e2e`) needs PostgreSQL migrated and seeded, and starts the API and Vite itself. See [docs/lab-03/tests.md](docs/lab-03/tests.md) for what each test covers.

## Lab documentation

This repo doubles as the CPE334 lab submissions. Each lab's contract and evidence live under `docs/`:

- [`docs/lab-03/`](docs/lab-03/) — specification, API spec, UI spec, test plan, issues, AI usage, review (current sprint)
- [`docs/lab-02/`](docs/lab-02/) — Requester ticketing sprint
- [`docs/lab-01/`](docs/lab-01/) — project foundation

## Contact

Project author: [Chessuker](https://github.com/Chessuker) — repo: [github.com/Chessuker/TokTickIT](https://github.com/Chessuker/TokTickIT)
