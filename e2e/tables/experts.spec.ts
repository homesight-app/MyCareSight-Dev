/**
 * Standard table pattern tests — Experts (/pages/admin/experts)
 *
 * Experts render as cards (not a table), so column-position assertions are
 * skipped. All other shared patterns apply.
 *
 * Covers:
 *  - Active/Inactive tab pattern
 *  - ⋮ actions menu opens/closes/escapes
 *  - ⋮ click does not trigger navigation
 *  - Destructive actions styled correctly
 *  - Row count display
 *
 * Run: npx playwright test e2e/tables/experts.spec.ts
 */

import { test, expect } from '@playwright/test'
import { adminAuthFile } from '../auth-paths'
import {
  expectActionsMenu,
  expectMenuDoesNotNavigate,
  expectDestructiveActionStyle,
  expectActiveInactiveTabs,
} from '../helpers/table-assertions'

test.use({ storageState: adminAuthFile })

test.describe('Experts — standard table pattern', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/admin/experts')
    // Wait for at least one expert card or the empty state
    await expect(
      page.locator('.bg-white.rounded-xl').first().or(page.getByText(/No .* experts found/i))
    ).toBeVisible({ timeout: 15_000 })
  })

  // -------------------------------------------------------------------------
  // Active / Inactive tabs
  // -------------------------------------------------------------------------

  test('Active/Inactive tabs are present and Active is default', async ({ page }) => {
    await expectActiveInactiveTabs(page, 'experts')
  })

  // -------------------------------------------------------------------------
  // Row count
  // -------------------------------------------------------------------------

  test('shows active expert count', async ({ page }) => {
    await expect(
      page.getByText(/Showing \d+ active expert/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // ⋮ actions menu — open / close / escape
  // -------------------------------------------------------------------------

  test('⋮ menu opens with correct actions', async ({ page }) => {
    const firstCard = page.locator('.bg-white.rounded-xl.shadow-md').first()
    const hasCard = await firstCard.isVisible()
    if (!hasCard) { test.skip(); return }

    await expectActionsMenu(page, firstCard, [
      'View Profile',
      'Edit Information',
      'Manage Clients',
      'View Performance',
      'Deactivate',
    ])
  })

  test('⋮ click does not navigate away from the page', async ({ page }) => {
    const firstCard = page.locator('.bg-white.rounded-xl.shadow-md').first()
    const hasCard = await firstCard.isVisible()
    if (!hasCard) { test.skip(); return }

    await expectMenuDoesNotNavigate(page, firstCard)
  })

  // -------------------------------------------------------------------------
  // Destructive actions
  // -------------------------------------------------------------------------

  test('Deactivate action appears in red at bottom of menu', async ({ page }) => {
    const firstCard = page.locator('.bg-white.rounded-xl.shadow-md').first()
    const hasCard = await firstCard.isVisible()
    if (!hasCard) { test.skip(); return }

    const menuBtn = firstCard.getByRole('button', { name: /^Actions for/i })
    await menuBtn.click()
    await expectDestructiveActionStyle(page, 'Deactivate')
  })
})
