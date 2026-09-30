import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NotificationDropdown from '@/components/NotificationDropdown'
import {
  getNotificationBadgeSnapshotAction,
  getNotificationDropdownSnapshotAction,
} from '@/app/actions/notification-dropdown'

jest.mock('@/app/actions/notification-dropdown', () => ({
  getNotificationBadgeSnapshotAction: jest.fn(),
  getNotificationDropdownSnapshotAction: jest.fn(),
}))
jest.mock('@/app/actions/query-bridge', () => ({
  markNotificationAsRead: jest.fn(),
  deleteNotificationByIdAndUser: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  usePathname: () => '/pages/admin/playbooks',
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getNotificationBadgeSnapshotAction).mockResolvedValue({
    data: { unreadCount: 3, role: 'admin' },
    error: null,
  })
  jest.mocked(getNotificationDropdownSnapshotAction).mockResolvedValue({
    data: {
      unreadCount: 3,
      role: 'admin',
      applications: [],
      notifications: [],
    },
    error: null,
  })
})

test('uses one server action for the initial badge and one when the dropdown opens', async () => {
  const view = render(
    <NotificationDropdown userId="76000000-0000-4000-8000-000000000001" userRole="admin" />
  )

  await waitFor(() => expect(getNotificationBadgeSnapshotAction).toHaveBeenCalledTimes(1))
  expect(getNotificationDropdownSnapshotAction).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  await waitFor(() => expect(getNotificationDropdownSnapshotAction).toHaveBeenCalledTimes(1))
  expect(getNotificationBadgeSnapshotAction).toHaveBeenCalledTimes(1)

  view.unmount()
})
