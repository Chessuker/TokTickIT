# TokTickIT

TokTickIT is a full-stack IT ticketing/status portal built with a React + Express + PostgreSQL stack, wrapped in a deliberately over-the-top "1999 cyber portal" retro UI. It exposes a health-check endpoint that reports live database connectivity, a category list backed by Postgres, and a simple user directory with create support.

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

- **Live health check** — `GET /api/health` runs `SELECT 1` against Postgres and returns `200`/`ok` or `503`/`error` based on real DB connectivity, not a hardcoded response.
- **Category list** — categories are seeded in Postgres and served through `GET /api/categories`, rendered by the frontend with loading and error states.
- **User directory** — list existing users (`GET /api/users`) and create new ones from the UI (`POST /api/users`), with server-side email validation.
- **Retro cyber UI** — a Bootstrap 5-themed "late-90s internet" interface (marquee ticker, window chrome, blinking badges) as the frontend shell.

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
TikTokIT/
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
├── docs/lab-01/     # CPE334 Lab 1 write-ups (tests, AI usage, peer review)
└── package.json     # Root scripts that fan out to client/server
```

## Requirements

- Node.js >= 18 (developed on v24)
- npm >= 10
- PostgreSQL >= 13 — either a local instance, a hosted connection string, or Docker (a `docker-compose.yml` is included)

## Installation

```bash
git clone https://github.com/Chessuker/TikTokIT.git
cd TikTokIT
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
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/toktikit?schema=public"
```

The value above matches the bundled `docker-compose.yml`. Point it at your own instance if you are not using Docker.

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

Open `http://localhost:5173` in a browser. The app checks `/api/health` and loads `/api/categories` and `/api/users` on load.

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
| `npm run prisma:seed` | Seed reference data — safe to re-run |

Additional server-only scripts (`npm --prefix server run ...`): `prisma:migrate`, `prisma:seed`.

## Tests

```bash
npm run test:server   # Supertest against Express, Prisma mocked — no live DB needed
npm run test:client   # Vitest + React Testing Library
```

Both suites currently pass (7 backend / 3 frontend tests). See [docs/lab-01/tests.md](docs/lab-01/tests.md) for the full breakdown of what each test covers.

## Lab documentation

This repo doubles as the CPE334 Lab 1 submission. Supporting docs live in [`docs/lab-01/`](docs/lab-01/):

- [tests.md](docs/lab-01/tests.md) — test environment and results
- [ai_use.md](docs/lab-01/ai_use.md) — AI tool usage log
- [reviewer.md](docs/lab-01/reviewer.md) — peer review records

## Contact

Project author: [Chessuker](https://github.com/Chessuker) — repo: [github.com/Chessuker/TikTokIT](https://github.com/Chessuker/TokTickIT)
