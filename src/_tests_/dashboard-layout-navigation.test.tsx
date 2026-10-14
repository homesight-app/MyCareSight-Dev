import { render, screen } from '@testing-library/react'
import DashboardLayout from '@/components/DashboardLayout'
import { AGENCY_CAPABILITY_KEYS } from '@/lib/constants/feature-keys'

jest.mock('next/navigation', () => ({ usePathname: () => '/pages/agency' }))
jest.mock('@/app/actions/care-visits-badge', () => ({ getCareVisitsPendingBadgeCountAction: jest.fn() }))
jest.mock('@/app/actions/time-billing-badge', () => ({ getTimeBillingPendingBadgeCountAction: jest.fn() }))
jest.mock('@/components/ui/AppHeader', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/LinkNavigationOverlay', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/UpgradePromptModal', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/AppSidebar', () => ({
  __esModule: true,
  default: ({ menuItems, menuGroups }: {
    menuItems: { label: string; locked?: boolean }[]
    menuGroups?: { label: string; items: { label: string; locked?: boolean }[] }[]
  }) => (
    <nav aria-label="Captured sidebar">
      {menuItems.map(item => <span key={item.label} data-locked={item.locked}>{item.label}</span>)}
      {menuGroups?.map(group => (
        <section
          key={group.label}
          aria-label={group.label}
          data-locked={group.items.every(item => item.locked)}
        >
          {group.items.map(item => <span key={item.label} data-locked={item.locked}>{item.label}</span>)}
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
        allowedCapabilities={AGENCY_CAPABILITY_KEYS}
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
        allowedCapabilities={AGENCY_CAPABILITY_KEYS}
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

  test('grants care visits and time billing together while caregiver management remains separate', () => {
    const { rerender } = render(
      <DashboardLayout
        user={{ id: 'owner' }}
        profile={{ role: 'company_owner', full_name: 'Synthetic Owner' }}
        allowedCapabilities={['care_operations']}
        careVisitsPendingCount={0}
        timeBillingPendingCount={0}
      >
        <div>Content</div>
      </DashboardLayout>
    )

    expect(screen.getByText('Care Visits')).toBeInTheDocument()
    expect(screen.getByText('Time & Billing')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Client Management' })).toHaveAttribute('data-locked', 'true')

    rerender(
      <DashboardLayout
        user={{ id: 'coordinator' }}
        profile={{ role: 'care_coordinator', full_name: 'Synthetic Coordinator' }}
        allowedCapabilities={['care_operations']}
        careVisitsPendingCount={0}
        timeBillingPendingCount={0}
      >
        <div>Content</div>
      </DashboardLayout>
    )

    expect(screen.getByText('Care Visits')).toBeInTheDocument()
    expect(screen.getByText('Time & Billing')).toBeInTheDocument()
    expect(screen.getByText('Caregivers')).toHaveAttribute('data-locked', 'true')
  })
})
