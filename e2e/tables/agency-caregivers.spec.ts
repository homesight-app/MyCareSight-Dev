/**
 * Standard table pattern tests — Agency Caregivers sub-tab
 *
 * The Caregivers tab lives inside /pages/admin/agencies/[id].
 * This spec navigates to the admin agencies list, opens the first agency,
 * then clicks the Caregivers tab before running assertions.
 *
 * Covers:
 *  - Active/Inactive tab pattern (Active default, Inactive count badge, lazy load)
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *
 * Run: npx playwright test e2e/tables/agency-caregivers.spec.ts
 */

import { test, expect } from '@playwright/test'
import { adminAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
  expectRowCount,
  expectSortToggle,
  expectDestructiveActionStyle,
  expectActiveInactiveTabs,
} from '../helpers/table-assertions'

test.use({ storageState: adminAuthFile })

test.describe('Agency Caregivers — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    // Open the agencies list and navigate into the first agency
    await page.goto('/pages/admin/agencies')
    const firstAgencyLink = page.locator('tbody tr').first().getByRole('link').first()
    await expect(firstAgencyLink).toBeVisible({ timeout: 15_000 })
    await firstAgencyLink.click()
    await page.waitForURL(/\/pages\/admin\/agencies\//, { timeout: 10_000 })

    // Click the Caregivers tab
    await page.getByRole('button', { name: /^Caregivers$/i }).click()
    // Wait for the table to render
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
      'Edit Caregiver',
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
  // Sort headers
  // -------------------------------------------------------------------------

  test('Name column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'Name')
  })

  test('Role column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'Role')
  })

  // -------------------------------------------------------------------------
  // ⋮ column position — second column after Name
  // -------------------------------------------------------------------------

  test('⋮ column appears immediately after Name column', async ({ page }) => {
    const headers = page.locator('thead th')
    const secondHeader = headers.nth(1)
    await expect(secondHeader).toHaveText('')
  })
})
