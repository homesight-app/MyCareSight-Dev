import { defineConfig, devices } from '@playwright/test'

// Synthetic component harness; no Next server, accounts, database or live network.
export default defineConfig({
  testDir: './e2e-isolated', testMatch: 'session-lifecycle.browser.ts', workers: 1, retries: 0,
  globalTimeout: 240000, reporter: 'line',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' },
})
