import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration (tests.md §1).
 *
 * The suite drives the real screens against a running stack: PostgreSQL, the
 * Express API on :5000 and Vite on :5173. Both servers are started by
 * `webServer` below and reused if they are already up, so a developer with the
 * stack running does not get a second copy of it.
 *
 * The database is *not* started here. `docker compose up -d` plus
 * `npm run prisma:migrate && npm run prisma:seed` are prerequisites: an E2E run
 * that silently created its own empty database would pass against nothing.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
