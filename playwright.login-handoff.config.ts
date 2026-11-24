import { defineConfig, devices } from '@playwright/test'

// No auth.setup, .env.playwright, real accounts or usable database endpoint.
export default defineConfig({
  testDir: './e2e-isolated',
  // Custom suffix avoids discovery by Jest or the live-account e2e suite.
  testMatch: 'login-handoff.browser.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTimeout: 90000,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3107',
    trace: 'off',
    screenshot: 'off',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start -p 3107',
    url: 'http://localhost:3107/pages/auth/login',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      AUTH_URL: 'http://localhost:3107',
      AUTH_SECRET: 'synthetic-login-test-secret-not-used-in-any-deployment',
      DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/no_live_database',
      JOBS_DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/no_live_database',
      MAILGUN_API_KEY: '',
      TURNSTILE_SECRET_KEY: '',
    },
  },
})
