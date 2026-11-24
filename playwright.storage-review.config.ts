import { defineConfig, devices } from '@playwright/test'

// No application server, auth.setup, credentials or live network access.
export default defineConfig({
  testDir: './e2e-isolated',
  testMatch: 'storage-download.browser.ts',
  workers: 1,
  retries: 0,
  globalTimeout: 30000,
  reporter: 'line',
  use: { ...devices['Desktop Chrome'], acceptDownloads: true, trace: 'off', screenshot: 'off' },
})
