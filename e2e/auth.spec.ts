import { test, expect } from '@playwright/test'

test.describe('Login flows', () => {
  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/pages/auth/login')
    await page.fill('#email', 'nobody@example.com')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type=submit]')
    await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/pages\/auth\/login/)
  })

  test('company owner login redirects to agency dashboard', async ({ page }) => {
    const email = process.env.TEST_OWNER_EMAIL!
    const password = process.env.TEST_OWNER_PASSWORD!

    await page.goto('/pages/auth/login')
    await page.fill('#email', email)
    await page.fill('#password', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/pages\/agency/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/pages\/agency/)
  })

  test('care coordinator login redirects to clients page', async ({ page }) => {
    const email = process.env.TEST_COORDINATOR_EMAIL!
    const password = process.env.TEST_COORDINATOR_PASSWORD!

    await page.goto('/pages/auth/login')
    await page.fill('#email', email)
    await page.fill('#password', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/pages\/agency\/clients/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/pages\/agency\/clients/)
  })

  test('unauthenticated user visiting protected page is redirected to login', async ({ page }) => {
    await page.goto('/pages/agency')
    await expect(page).toHaveURL(/\/pages\/auth\/login/)
  })
})
