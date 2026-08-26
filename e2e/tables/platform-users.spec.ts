/**
 * Standard table pattern tests — Platform Users tab (/pages/admin/users)
 *
 * Covers:
 *  - Active/Inactive tab pattern within the Users sub-tab
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *
 * Run: npx playwright test e2e/tables/platform-users.spec.ts
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

test.describe('Platform Users — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/users')
    // Wait for the Users tab table to render
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Active / Inactive tabs
  // -------------------------------------------------------------------------

  test('Active/Inactive tabs are present and Active is default', async ({ page }) => {
    await expectActiveInactiveTabs(page, 'users')
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expectRowCount(page, 'users')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'Reset Password',
      'Disable Account',
    ])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectMenuDoesNotNavigate(page, firstRow)
  })

  // -------------------------------------------------------------------------
  // Destructive actions
  // -------------------------------------------------------------------------

  test('Disable Account action appears in red at bottom of menu', async ({ page }) => {
    const menuBtn = page.locator('tbody tr').first()
      .getByRole('button', { name: /^Actions for/i })
    await menuBtn.click()
    await expectDestructiveActionStyle(page, 'Disable Account')
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

  test('Company column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'Company')
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
