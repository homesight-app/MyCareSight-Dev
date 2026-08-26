import { test, expect } from '@playwright/test'
import { ownerAuthFile } from './auth-paths'

test.use({ storageState: ownerAuthFile })

test.describe('Agency owner — critical paths', () => {
  test('agency dashboard loads', async ({ page }) => {
    await page.goto('/pages/agency')
    await expect(page).toHaveURL(/\/pages\/agency/)
    // Page should not redirect to login
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
  })

  test('clients list loads', async ({ page }) => {
    await page.goto('/pages/agency/clients')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    // Wait for page content — list or empty state
    await expect(page.locator('main, [role=main]')).toBeVisible({ timeout: 10_000 })
  })

  test('caregiver list loads', async ({ page }) => {
    await page.goto('/pages/agency/caregiver')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    await expect(page.locator('main, [role=main]')).toBeVisible({ timeout: 10_000 })
  })

  test('agency configuration page loads', async ({ page }) => {
    await page.goto('/pages/agency/configuration')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    // Config form should be visible
    await expect(page.locator('form')).toBeVisible({ timeout: 10_000 })
  })

  test('time and billing page loads', async ({ page }) => {
    await page.goto('/pages/agency/time-billing')
    await expect(page).not.toHaveURL(/\/pages\/auth\/login/)
    await expect(page.locator('main, [role=main]')).toBeVisible({ timeout: 10_000 })
  })
})
