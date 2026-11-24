import { defineConfig, devices } from '@playwright/test'

// Isolated actual React components, synthetic action adapters, no app server,
// authentication setup, cloud credentials or allowed live network requests.
export default defineConfig({
  testDir: './e2e-isolated', testMatch: 'agency-branches.browser.ts', workers: 1, retries: 0,
  globalTimeout: 60000, reporter: 'line',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off' },
})
