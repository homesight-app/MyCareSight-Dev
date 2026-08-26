/**
 * Standard table pattern tests — Leads (/pages/admin/leads)
 *
 * Leads uses server-side pagination and already shows a row count.
 * This spec validates that the ⋮ column is in position 1 (first column) and uses
 * RecordActionsMenu.
 *
 * Covers:
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Row count display
 *  - ⋮ column position — first column
 *
 * Run: npx playwright test e2e/tables/leads.spec.ts
 */

import { test, expect } from '@playwright/test'
import { adminAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
} from '../helpers/table-assertions'

test.use({ storageState: adminAuthFile })

test.describe('Leads — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/leads')
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Row count (server-side, already rendered)
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expect(
      page.getByText(/Showing \d+[–-]\d+ of \d+ leads/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const rowCount = await page.locator('tbody tr').count()
    if (rowCount === 0) { test.skip(); return }

    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, ['Archive'])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const rowCount = await page.locator('tbody tr').count()
    if (rowCount === 0) { test.skip(); return }

    const firstRow = page.locator('tbody tr').first()
    await expectMenuDoesNotNavigate(page, firstRow)
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
