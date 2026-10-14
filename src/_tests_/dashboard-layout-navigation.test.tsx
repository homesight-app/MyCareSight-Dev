import { render, screen } from '@testing-library/react'
import DashboardLayout from '@/components/DashboardLayout'

jest.mock('next/navigation', () => ({ usePathname: () => '/pages/agency' }))
jest.mock('@/app/actions/care-visits-badge', () => ({ getCareVisitsPendingBadgeCountAction: jest.fn() }))
jest.mock('@/app/actions/time-billing-badge', () => ({ getTimeBillingPendingBadgeCountAction: jest.fn() }))
jest.mock('@/components/ui/AppHeader', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/LinkNavigationOverlay', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/UpgradePromptModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/AppSidebar', () => ({
  __esModule: true,
  default: ({ menuItems, menuGroups }: {
    menuItems: { label: string }[]
    menuGroups?: { label: string; items: { label: string }[] }[]
  }) => (
    <nav aria-label="Captured sidebar">
      {menuItems.map(item => <span key={item.label}>{item.label}</span>)}
      {menuGroups?.map(group => (
        <section key={group.label} aria-label={group.label}>
          {group.items.map(item => <span key={item.label}>{item.label}</span>)}
        </section>
      ))}
    </nav>
  ),
}))

describe('DashboardLayout role-specific navigation', () => {
  test('uses grouped navigation only for the agency owner', () => {
    const { rerender } = render(
      <DashboardLayout
        user={{ id: 'owner' }}
        profile={{ role: 'company_owner', full_name: 'Synthetic Owner' }}
        allowedFeatures={null}
      >
        <div>Content</div>
      </DashboardLayout>
    )

    expect(screen.getByRole('region', { name: 'Client Management' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'HomeSights Services' })).toBeInTheDocument()
    expect(screen.getByText('My Services')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()

    rerender(
      <DashboardLayout
        user={{ id: 'coordinator' }}
        profile={{ role: 'care_coordinator', full_name: 'Synthetic Coordinator' }}
        allowedFeatures={null}
        careVisitsPendingCount={0}
        timeBillingPendingCount={0}
      >
        <div>Content</div>
      </DashboardLayout>
    )

    expect(screen.queryByRole('region', { name: 'Client Management' })).not.toBeInTheDocument()
    expect(screen.getByText('Caregivers')).toBeInTheDocument()
    expect(screen.queryByText('My Services')).not.toBeInTheDocument()
  })
})
