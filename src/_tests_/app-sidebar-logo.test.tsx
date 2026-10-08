import { render, screen } from '@testing-library/react'
import AppSidebar from '@/components/ui/AppSidebar'

jest.mock('next/navigation', () => ({ usePathname: () => '/pages/agency' }))
jest.mock('@/app/actions/auth', () => ({ signOut: '/logout' }))

test('uses bundled MyCareSight branding regardless of configured custom logos', () => {
  const props = {
    menuItems: [],
    onCollapse: jest.fn(),
    mobileOpen: false,
    onMobileClose: jest.fn(),
    logoSrc: '/api/storage/branding-logo?variant=full',
    logoIconSrc: '/api/storage/branding-logo?variant=icon',
  }
  const { rerender } = render(
    <AppSidebar
      {...props}
      collapsed={false}
    />
  )

  const logo = screen.getByAltText('MyCareSight')
  expect(logo).toHaveAttribute('src', '/MyCareSight-Logo Bleu.png')

  rerender(<AppSidebar {...props} collapsed />)
  expect(screen.getByAltText('MyCareSight')).toHaveAttribute('src', '/MyCareSight-Icon Bleu.png')
})
