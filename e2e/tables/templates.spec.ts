/**
 * Standard table pattern tests — Templates (/pages/admin/templates)
 *
 * Covers:
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *  - ⋮ column position — first column
 *
 * Run: npx playwright test e2e/tables/templates.spec.ts
 */

import { test, expect } from '@playwright/test'
import { adminAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
  expectRowCount,
  expectSortToggle,
  expectDestructiveActionStyle,
} from '../helpers/table-assertions'

test.use({ storageState: adminAuthFile })

test.describe('Templates — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/templates')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expectRowCount(page, 'templates')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'Edit',
      'Delete',
    ])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectMenuDoesNotNavigate(page, firstRow)
  })

  // -------------------------------------------------------------------------
  // Destructive actions
  // -------------------------------------------------------------------------

  test('Delete action appears in red at bottom of menu', async ({ page }) => {
    const menuBtn = page.locator('tbody tr').first()
      .getByRole('button', { name: /^Actions for/i })
    await menuBtn.click()
    await expectDestructiveActionStyle(page, 'Delete')
  })

  // -------------------------------------------------------------------------
  // Sort headers
  // -------------------------------------------------------------------------

  test('Name column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'Name')
  })

  test('Type column is sortable', async ({ page }) => {
    await expectSortToggle(page, 'Type')
  })

  // -------------------------------------------------------------------------
  // ⋮ column position — first column
  // -------------------------------------------------------------------------

  test('⋮ column appears as first column', async ({ page }) => {
    const headers = page.locator('thead th')
    const firstHeader = headers.nth(0)
    await expect(firstHeader).toHaveText('')
  })
})
