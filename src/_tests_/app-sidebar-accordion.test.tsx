import { fireEvent, render, screen } from '@testing-library/react'
import { CalendarDays, Home, Users } from 'lucide-react'
import AppSidebar, { type MenuGroupDef } from '@/components/ui/AppSidebar'

let pathname = '/pages/agency/programs/synthetic-service'

jest.mock('next/navigation', () => ({ usePathname: () => pathname }))
jest.mock('@/app/actions/auth', () => ({ signOut: '/logout' }))

const groups: MenuGroupDef[] = [
  {
    id: 'client-management',
    label: 'Client Management',
    icon: Users,
    items: [
      { href: '/pages/agency/clients', label: 'Clients', icon: Users },
    ],
  },
  {
    id: 'homesights-services',
    label: 'HomeSights Services',
    icon: CalendarDays,
    items: [
      { href: '/pages/agency/programs', label: 'My Services', icon: CalendarDays },
    ],
  },
]

describe('AppSidebar grouped navigation', () => {
  beforeEach(() => {
    pathname = '/pages/agency/programs/synthetic-service'
  })

  test('opens the active group and allows multiple groups to remain expanded', () => {
    render(
      <AppSidebar
        menuItems={[{ href: '/pages/agency', label: 'Home', icon: Home }]}
        menuGroups={groups}
        collapsed={false}
        onCollapse={jest.fn()}
        mobileOpen={false}
        onMobileClose={jest.fn()}
      />
    )

    const services = screen.getByRole('button', { name: 'HomeSights Services' })
    const clients = screen.getByRole('button', { name: 'Client Management' })
    expect(services).toHaveAttribute('aria-expanded', 'true')
    expect(clients).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'My Services' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(clients)
    expect(clients).toHaveAttribute('aria-expanded', 'true')
    expect(services).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Clients' })).toBeInTheDocument()
  })

  test('keeps group controls and active destinations accessible in collapsed mode', () => {
    render(
      <AppSidebar
        menuItems={[{ href: '/pages/agency', label: 'Home', icon: Home }]}
        menuGroups={groups}
        collapsed
        onCollapse={jest.fn()}
        mobileOpen={false}
        onMobileClose={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'HomeSights Services' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'My Services' })).toHaveAttribute('title', 'My Services')
    expect(screen.getByRole('button', { name: 'Client Management' })).toHaveAttribute('title', 'Client Management')
  })
})
