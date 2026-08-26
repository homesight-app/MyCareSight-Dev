/**
 * Standard table pattern tests — License Types table (/pages/admin/license-requirements)
 *
 * Covers:
 *  - Active/Inactive tab pattern
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *
 * Run: npx playwright test e2e/tables/license-types.spec.ts
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

test.describe('License Types — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/license-requirements')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Active / Inactive tabs
  // -------------------------------------------------------------------------

  test('Active/Inactive tabs are present and Active is default', async ({ page }) => {
    await expectActiveInactiveTabs(page, 'license types')
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expectRowCount(page, 'license types')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'View Details',
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

  test('State column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'State')
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
