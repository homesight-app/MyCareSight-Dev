/**
 * Standard table pattern tests — Agency Documents sub-tab
 *
 * The Documents tab lives inside /pages/admin/agencies/[id].
 * This spec navigates to the admin agencies list, opens the first agency,
 * then clicks the Documents tab before running assertions.
 *
 * Covers:
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *
 * Run: npx playwright test e2e/tables/agency-documents.spec.ts
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

test.describe('Agency Documents — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/agencies')
    const firstAgencyLink = page.locator('tbody tr').first().getByRole('link').first()
    await expect(firstAgencyLink).toBeVisible({ timeout: 15_000 })
    await firstAgencyLink.click()
    await page.waitForURL(/\/pages\/admin\/agencies\//, { timeout: 10_000 })

    // Click the Documents tab
    await page.getByRole('button', { name: /^Documents$/i }).click()
    // Wait for either the table or empty state
    await expect(
      page.locator('table').or(page.getByText(/No documents yet/i))
    ).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Row count (only runs if documents exist)
  // -------------------------------------------------------------------------

  test('shows row count when documents exist', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    await expectRowCount(page, 'documents')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape (only runs if documents exist)
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'View Document',
      'Download',
      'Delete',
    ])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    const firstRow = page.locator('tbody tr').first()
    await expectMenuDoesNotNavigate(page, firstRow)
  })

  // -------------------------------------------------------------------------
  // Destructive actions
  // -------------------------------------------------------------------------

  test('Delete action appears in red at bottom of menu', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    const menuBtn = page.locator('tbody tr').first()
      .getByRole('button', { name: /^Actions for/i })
    await menuBtn.click()
    await expectDestructiveActionStyle(page, 'Delete')
  })

  // -------------------------------------------------------------------------
  // Sort headers
  // -------------------------------------------------------------------------

  test('Name column is sortable', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    await expectSortToggle(page, 'Name')
  })

  test('Date Added column is sortable', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    await expectSortToggle(page, 'Date Added')
  })

  // -------------------------------------------------------------------------
  // ⋮ column position — second column after Name
  // -------------------------------------------------------------------------

  test('⋮ column appears immediately after Name column', async ({ page }) => {
    const tableVisible = await page.locator('table').isVisible()
    if (!tableVisible) {
      test.skip()
      return
    }
    const headers = page.locator('thead th')
    const secondHeader = headers.nth(1)
    await expect(secondHeader).toHaveText('')
  })
})
