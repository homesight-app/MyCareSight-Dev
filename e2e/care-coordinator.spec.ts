import { test, expect } from '@playwright/test'
import { coordinatorAuthFile } from './auth-paths'

test.use({ storageState: coordinatorAuthFile })

test.describe('Care coordinator — critical paths', () => {
  test('clients list loads', async ({ page }) => {
    await page.goto('/pages/agency/clients')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    await expect(page.locator('main, [role=main]')).toBeVisible({ timeout: 10_000 })
  })

  // Phase A/B regression: care coordinators were blocked from this page by RLS
  test('agency configuration page loads without error', async ({ page }) => {
    await page.goto('/pages/agency/configuration')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    await expect(page.locator('form')).toBeVisible({ timeout: 10_000 })
    // Should not show an access-denied or error state
    await expect(page.locator('text=Forbidden')).not.toBeVisible()
    await expect(page.locator('text=No agency found')).not.toBeVisible()
  })

  // Phase A/B regression: saving config triggered RLS error for care coordinators
  test('agency configuration can be saved by care coordinator', async ({ page }) => {
    await page.goto('/pages/agency/configuration')
    await expect(page.locator('form')).toBeVisible({ timeout: 10_000 })

    // Submit the form with whatever values are already populated
    await page.click('button[type=submit]')

    // Should not show an error — success means no error text appears
    await expect(page.locator('text=No agency found')).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=Forbidden')).not.toBeVisible()
    await expect(page.locator('text=Error')).not.toBeVisible()
  })
})
