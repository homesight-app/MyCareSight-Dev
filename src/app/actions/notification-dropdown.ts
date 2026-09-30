'use server'

import {
  readNotificationBadgeSnapshot,
  readNotificationDropdownSnapshot,
} from '@/lib/repositories/notification-dropdown'

export async function getNotificationBadgeSnapshotAction() {
  return readNotificationBadgeSnapshot()
}

export async function getNotificationDropdownSnapshotAction() {
  return readNotificationDropdownSnapshot()
}
