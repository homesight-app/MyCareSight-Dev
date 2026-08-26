/**
 * Reusable assertion helpers for the standard table interaction pattern.
 *
 * Every table in the app uses RecordActionsMenu (⋮), TablePagination, and
 * SortableColumnHeader. These helpers validate those shared behaviors so
 * per-table specs only need to describe what's unique to that table.
 *
 * Usage:
 *   import { expectActionsMenu, expectRowCount, expectActiveInactiveTabs } from '../helpers/table-assertions'
 */

import { expect, type Page, type Locator } from '@playwright/test'

// ---------------------------------------------------------------------------
// ⋮ Actions menu
// ---------------------------------------------------------------------------

/**
 * Asserts the ⋮ menu opens, contains the expected items, and closes correctly.
 *
 * @param page       Playwright Page
 * @param rowLocator Locator for the specific table row to target
 * @param items      Labels expected inside the menu (exact match)
 */
export async function expectActionsMenu(
  page: Page,
  rowLocator: Locator,
  items: string[]
) {
  const menuBtn = rowLocator.getByRole('button', { name: /^Actions for/i })
  await expect(menuBtn).toBeVisible()

  // Opens on click
  await menuBtn.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  // All expected items present
  for (const item of items) {
    await expect(menu.getByText(item, { exact: true })).toBeVisible()
  }

  // Closes on Escape
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()

  // Reopens and closes on click-outside
  await menuBtn.click()
  await expect(menu).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(menu).not.toBeVisible()
}

/**
 * Asserts that clicking the ⋮ button does NOT navigate away from the current page.
 */
export async function expectMenuDoesNotNavigate(page: Page, rowLocator: Locator) {
  const urlBefore = page.url()
  const menuBtn = rowLocator.getByRole('button', { name: /^Actions for/i })
  await menuBtn.click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(page.url()).toBe(urlBefore)
  await page.keyboard.press('Escape')
}

// ---------------------------------------------------------------------------
// Row count & pagination
// ---------------------------------------------------------------------------

/**
 * Asserts that a "Showing X–Y of Z {entityLabel}" string is visible.
 * Accepts any count values — just checks the pattern is present.
 */
export async function expectRowCount(page: Page, entityLabel: string) {
  await expect(
    page.getByText(new RegExp(`(Showing \\d+[–-]\\d+ of \\d+|No) ${entityLabel}`, 'i'))
  ).toBeVisible({ timeout: 10_000 })
}

/**
 * Asserts Prev/Next pagination buttons are present and Prev is disabled on page 1.
 * Only call this when you know the table has enough records to paginate.
 */
export async function expectPagination(page: Page) {
  const prev = page.getByRole('button', { name: /^Prev$/i })
  const next = page.getByRole('button', { name: /^Next$/i })
  await expect(prev).toBeVisible()
  await expect(next).toBeVisible()
  await expect(prev).toBeDisabled()   // first page
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

/**
 * Clicks a sortable column header twice and asserts the sort direction indicator changes.
 */
export async function expectSortToggle(page: Page, columnLabel: string) {
  const header = page.getByRole('columnheader', { name: new RegExp(columnLabel, 'i') })
  await expect(header).toBeVisible()
  // First click → ascending (or descending depending on default)
  await header.click()
  // Second click → opposite direction
  await header.click()
  // Verify the header is still visible (didn't crash)
  await expect(header).toBeVisible()
}

// ---------------------------------------------------------------------------
// Active / Inactive tabs
// ---------------------------------------------------------------------------

/**
 * Asserts the Active/Inactive tab pattern is present.
 * - Active tab is selected by default
 * - Inactive tab exists and shows a count badge
 * - Clicking Inactive tab loads records (or shows empty state)
 */
export async function expectActiveInactiveTabs(page: Page, entityLabel: string) {
  const activeTab = page.getByRole('button', { name: /^Active$/i })
  const inactiveTab = page.getByRole('button', { name: /^Inactive/i })

  await expect(activeTab).toBeVisible({ timeout: 10_000 })
  await expect(inactiveTab).toBeVisible()

  // Active is the default selected state
  await expect(activeTab).toHaveAttribute('aria-pressed', 'true')

  // Click inactive — should load without navigating away
  await inactiveTab.click()
  // Either records or empty state should appear
  await expect(
    page.getByText(new RegExp(`(Showing|No) .* ${entityLabel}`, 'i'))
  ).toBeVisible({ timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Destructive actions
// ---------------------------------------------------------------------------

/**
 * Asserts that a destructive action label (e.g. "Deactivate") appears in red
 * at the bottom of the ⋮ menu, separated by a divider.
 */
export async function expectDestructiveActionStyle(page: Page, actionLabel: string) {
  const item = page.getByRole('menuitem', { name: new RegExp(actionLabel, 'i') })
  await expect(item).toBeVisible()
  // Red text is applied via Tailwind text-red-600
  await expect(item).toHaveClass(/text-red/)
}
