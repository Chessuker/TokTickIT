# TikTokIT Full-Stack Platform

A modern full-stack web application built with **React**, **TypeScript**, **Vite**, **Bootstrap 5**, **Node.js**, **Express**, **Prisma ORM**, and **PostgreSQL**.

---

## 🚀 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Bootstrap 5 & Bootstrap Icons
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Vitest & Supertest

---

## 📁 Project Structure

```
TikTokIT/
├── client/                 # React + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── App.tsx         # Main application component with Bootstrap UI
│   │   ├── main.tsx        # React entry point importing Bootstrap CSS & Icons
│   │   └── index.css       # Custom styles
│   └── package.json
├── server/                 # Express + TypeScript Backend
│   ├── prisma/
│   │   └── schema.prisma   # Prisma schema file for PostgreSQL
│   ├── src/
│   │   ├── app.ts          # Express application setup & API endpoints
│   │   ├── db.ts           # Prisma client instance singleton
│   │   └── index.ts        # Server entry point
│   ├── tests/
│   │   └── app.test.ts     # Vitest + Supertest integration tests
│   ├── vitest.config.ts    # Vitest configuration
│   └── package.json
├── .env.example            # Environment variables example template
├── .gitignore              # Git ignore rules for node_modules and secrets
├── package.json            # Root package.json with scripts
└── README.md               # Setup & usage instructions
```

---

## 🛠️ Setup & Installation Instructions

### 1. Prerequisites

Make sure you have installed:
- **Node.js** (v18+ recommended)
- **PostgreSQL** database running locally or remotely

---

### 2. Environment Configuration

Copy `.env.example` to `server/.env` and update your PostgreSQL connection URL and server port if needed:

```bash
# In server/.env
PORT=5000
DATABASE_URL="postgresql://postgres:admin@localhost:5433/tiktokit?schema=public"
```

---

### 3. Install Dependencies

Install dependencies for both frontend and backend:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

---

### 4. Database Setup & Prisma Client Initialization

Generate the Prisma client and push the schema to your PostgreSQL database:

```bash
cd server
npm run prisma:generate
npm run prisma:db:push
```

---

### 5. Running the Application

#### Start Backend Server
```bash
# From root or server directory
cd server
npm run dev
```
The Express server will start at `http://localhost:5000`.

#### Start Frontend Client
```bash
# From root or client directory
cd client
npm run dev
```
The Vite development server will start (typically at `http://localhost:5173`).

---

### 6. Running Tests

Run Vitest & Supertest backend API test suite:

```bash
cd server
npm run test
```

---

## ✅ Acceptance Criteria Checklist

- [x] React + TypeScript + Vite frontend starts successfully.
- [x] Bootstrap is installed and visible in the frontend.
- [x] Node.js + Express + TypeScript backend starts successfully.
- [x] PostgreSQL is reachable and Prisma is initialized.
- [x] Vitest and Supertest commands are configured.
- [x] `.gitignore` and `.env.example` exist; secrets and `node_modules` are not committed.
- [x] Initial README setup instructions are present.
