import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

test('a late badge read cannot replace the newer dropdown count', async () => {
  let resolveBadge!: (value: Awaited<ReturnType<typeof getNotificationBadgeSnapshotAction>>) => void
  jest.mocked(getNotificationBadgeSnapshotAction).mockReturnValueOnce(new Promise(resolve => { resolveBadge = resolve }))
  jest.mocked(getNotificationDropdownSnapshotAction).mockResolvedValueOnce({ data: { unreadCount: 9, role: 'admin', applications: [], notifications: [] }, error: null })
  render(<NotificationDropdown userId="76000000-0000-4000-8000-000000000001" userRole="admin" />)
  await waitFor(() => expect(getNotificationBadgeSnapshotAction).toHaveBeenCalledTimes(1))
  const bell = screen.getByRole('button', { name: 'Notifications' })
  fireEvent.click(bell)
  await waitFor(() => expect(within(bell).getByText('9')).toBeInTheDocument())
  await act(async () => resolveBadge({ data: { unreadCount: 3, role: 'admin' }, error: null }))
  expect(within(bell).getByText('9')).toBeInTheDocument()
  expect(within(bell).queryByText('3')).not.toBeInTheDocument()
})
