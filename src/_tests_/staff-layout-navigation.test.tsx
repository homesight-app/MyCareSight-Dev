import { fireEvent, render, screen } from '@testing-library/react'
import StaffLayout from '@/components/StaffLayout'

jest.mock('next/navigation', () => ({ usePathname: () => '/pages/caregiver' }))
jest.mock('@/components/ui/AppHeader', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/LoadingSpinner', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/UpgradePromptModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div role="dialog">Upgrade prompt</div> : null,
}))
jest.mock('@/components/ui/AppSidebar', () => ({
  __esModule: true,
  default: ({ menuItems, onLockedItemClick }: {
    menuItems: { label: string; locked?: boolean }[]
    onLockedItemClick?: (item: { label: string; locked?: boolean }) => void
  }) => (
    <nav aria-label="Captured caregiver sidebar">
      {menuItems.map(item => (
        <button
          key={item.label}
          type="button"
          data-locked={item.locked}
          onClick={() => item.locked && onLockedItemClick?.(item)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  ),
}))

describe('StaffLayout capability navigation', () => {
  const commonProps = {
    user: { id: 'synthetic-caregiver' },
    profile: { role: 'staff_member', full_name: 'Synthetic Caregiver' },
  }

  test('keeps care-operation destinations visible and locked when the plan excludes them', () => {
    render(
      <StaffLayout {...commonProps} allowedCapabilities={[]}>
        <div>Content</div>
      </StaffLayout>
    )

    const visits = screen.getByRole('button', { name: 'My Care Visits' })
    const calendar = screen.getByRole('button', { name: 'My Calendar' })
    expect(visits).toHaveAttribute('data-locked', 'true')
    expect(calendar).toHaveAttribute('data-locked', 'true')

    fireEvent.click(visits)
    expect(screen.getByRole('dialog')).toHaveTextContent('Upgrade prompt')
  })

  test('unlocks both caregiver scheduling destinations with Care Operations', () => {
    render(
      <StaffLayout {...commonProps} allowedCapabilities={['care_operations']}>
        <div>Content</div>
      </StaffLayout>
    )

    expect(screen.getByRole('button', { name: 'My Care Visits' })).toHaveAttribute('data-locked', 'false')
    expect(screen.getByRole('button', { name: 'My Calendar' })).toHaveAttribute('data-locked', 'false')
  })
})
