/**
 * Standard table pattern tests — Agency People tab (/pages/agency/people)
 *
 * Covers:
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger row navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *  - Sort column headers
 *
 * Run: npx playwright test e2e/tables/agency-people.spec.ts
 */

import { test, expect } from '@playwright/test'
import { ownerAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
  expectRowCount,
  expectSortToggle,
  expectDestructiveActionStyle,
} from '../helpers/table-assertions'

test.use({ storageState: ownerAuthFile })

test.describe('Agency People — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/agency/people')
    // Wait for the table to be present
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows row count', async ({ page }) => {
    await expectRowCount(page, 'people')
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first()
    await expectActionsMenu(page, firstRow, [
      'Edit Person',
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
    // First header = Name, second header = ⋮ (no text label)
    const secondHeader = headers.nth(1)
    // ⋮ header has no text, just an empty th
    await expect(secondHeader).toHaveText('')
  })
})
