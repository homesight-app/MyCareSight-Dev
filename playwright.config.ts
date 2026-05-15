import { defineConfig, devices } from '@playwright/test'
import path from 'path'

// Load test-specific env vars from .env.playwright (gitignored)
// In CI these come from GitHub Actions secrets instead
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: path.resolve(__dirname, '.env.playwright'), override: false })
} catch {
  // dotenv not available — env vars must come from the shell (CI)
}

export default defineConfig({
  testDir: './e2e',
  // Tests share a live Supabase DB — run serially to avoid conflicts
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Auth setup runs first and saves storage state for each role
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Reuse a running dev server locally; always start fresh in CI
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
