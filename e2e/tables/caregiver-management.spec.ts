/**
 * Standard table pattern tests — Caregiver Management (/pages/agency/caregivers)
 *
 * Covers:
 *  - Active/Inactive tab pattern
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - ⋮ column position
 *
 * Run: npx playwright test e2e/tables/caregiver-management.spec.ts
 */

import { test, expect } from '@playwright/test'
import { ownerAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
  expectRowCount,
  expectDestructiveActionStyle,
  expectActiveInactiveTabs,
} from '../helpers/table-assertions'

test.use({ storageState: ownerAuthFile })

test.describe('Caregiver Management — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/agency/caregivers')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Active / Inactive tabs
  // -------------------------------------------------------------------------

  test('Active/Inactive tabs are present and Active is default', async ({ page }) => {
    await expectActiveInactiveTabs(page, 'caregivers')
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expectRowCount(page, 'caregivers')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'View Profile',
      'Edit Information',
      'Deactivate',
    ])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectMenuDoesNotNavigate(page, firstRow)
  })

  // -------------------------------------------------------------------------
  // Destructive actions
  // -------------------------------------------------------------------------

  test('Deactivate action appears in red at bottom of menu', async ({ page }) => {
    const menuBtn = page.locator('tbody tr').first()
      .getByRole('button', { name: /^Actions for/i })
    await menuBtn.click()
    await expectDestructiveActionStyle(page, 'Deactivate')
  })

  // -------------------------------------------------------------------------
  // ⋮ column position — second column after Caregiver
  // -------------------------------------------------------------------------

  test('⋮ column appears immediately after Caregiver column', async ({ page }) => {
    const headers = page.locator('thead th')
    const secondHeader = headers.nth(1)
    await expect(secondHeader).toHaveText('')
  })
})
