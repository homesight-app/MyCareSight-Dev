import { defineConfig, devices } from '@playwright/test'

// Actual login component/Auth.js browser client, synthetic responses, no app server or live network.
export default defineConfig({
  testDir: './e2e-isolated', testMatch: 'login-availability.browser.ts', workers: 1, retries: 0,
  globalTimeout: 120000, reporter: 'line',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off', contextOptions: { reducedMotion: 'reduce' } },
})
