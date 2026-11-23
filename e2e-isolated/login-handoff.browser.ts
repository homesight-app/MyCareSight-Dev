import { expect, test } from '@playwright/test'

for (const confirmed of [true, false]) {
  test(confirmed ? 'confirmed login starts a new document navigation' : 'missing session stays on login without a redirect loop', async ({ page }) => {
    let credentialsAccepted = false
    let navigationRequests = 0
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== 'http://localhost:3107') return route.abort()
      if (url.pathname === '/api/auth/providers') return route.fulfill({ json: {
        credentials: { id: 'credentials', name: 'Credentials', type: 'credentials',
          signinUrl: url.origin + '/api/auth/signin/credentials', callbackUrl: url.origin + '/api/auth/callback/credentials' },
      } })
      if (url.pathname === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'synthetic-csrf' } })
      if (url.pathname === '/api/auth/callback/credentials') {
        credentialsAccepted = true
        return route.fulfill({ json: { url: url.origin + '/pages/admin' } })
      }
      if (url.pathname === '/api/auth/session') return route.fulfill({ json: confirmed && credentialsAccepted
        ? { user: { id: 'synthetic-user', email: 'synthetic@example.test', role: 'admin' }, expires: '2099-01-01T00:00:00Z' }
        : null })
      if (url.pathname === '/pages/admin') {
        if (route.request().isNavigationRequest()) navigationRequests++
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><h1>Synthetic authenticated destination</h1>' })
      }
      // All remaining auth requests are refused rather than reaching a live provider.
      if (url.pathname.startsWith('/api/auth/')) return route.fulfill({ status: 400, json: {} })
      return route.continue()
    })

    await page.goto('/pages/auth/login')
    await page.getByLabel('Email Address').fill('synthetic@example.test')
    await page.getByLabel('Password', { exact: true }).fill('Synthetic-test-only-123!')
    // Exercise native keyboard form submission without hover-animation actionability waits.
    await page.getByLabel('Password', { exact: true }).press('Enter')
    if (confirmed) {
      await expect(page).toHaveURL('http://localhost:3107/pages/admin')
      await expect(page.getByRole('heading', { name: 'Synthetic authenticated destination' })).toBeVisible()
      expect(navigationRequests).toBe(1)
    } else {
      await expect(page.getByText('We could not confirm your session.', { exact: false })).toBeVisible()
      await expect(page).toHaveURL('http://localhost:3107/pages/auth/login')
      await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
      expect(navigationRequests).toBe(0)
    }
  })
}
