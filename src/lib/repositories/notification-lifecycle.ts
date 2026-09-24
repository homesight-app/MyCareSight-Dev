import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'

const idSchema = z.uuid()
const limitSchema = z.number().int().min(1).max(50)
type NotificationRow = {
  id: string
  user_id: string
  title: string
  message: string | null
  type: string
  is_read: boolean | null
  created_at: string
  icon_type: string | null
  action_url: string | null
}
type Result<T> = { data: T | null; error: { message: string } | null }
type Actor = { id: string; role: string; agency_id: string | null }
class AccessError extends Error {}

async function withNotificationActor<T>(claimedUserId: string | null, run: (actor: Actor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || !idSchema.safeParse(session.user.id).success) throw new AccessError('Unauthorized')
  if (claimedUserId !== null && (!idSchema.safeParse(claimedUserId).success || claimedUserId !== session.user.id)) {
    throw new AccessError('Forbidden')
  }
  return withActorContext(session.user.id, async () => {
    const [actor] = await sql<Actor[]>`
      SELECT id, role, agency_id FROM public.user_profiles
      WHERE id = ${session.user.id}::uuid AND is_active = true
      LIMIT 1
    `
    if (!actor) throw new AccessError('Forbidden')
    if (['company_owner', 'care_coordinator', 'staff_member'].includes(actor.role)) {
      if (!actor.agency_id) throw new AccessError('Forbidden')
      const [membership] = await sql`
        SELECT 1 FROM public.user_agency_roles
        WHERE user_id = ${actor.id}::uuid AND agency_id = ${actor.agency_id}::uuid
          AND role = ${actor.role} AND status = 'active'
        LIMIT 1
      `
      if (!membership) throw new AccessError('Forbidden')
    } else if (!['admin', 'expert'].includes(actor.role)) {
      throw new AccessError('Forbidden')
    }
    await sql`SELECT set_config('app.current_user_role', ${actor.role}, true), set_config('app.current_agency_id', ${actor.agency_id ?? ''}, true)`
    return run(actor)
  })
}

async function audit(actor: Actor, operation: string, action: 'READ' | 'UPDATE' | 'DELETE', recordId: string | null) {
  await sql`
    INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
    VALUES (${actor.agency_id}::uuid, 'notifications', ${recordId}::uuid, ${action}, ${actor.id}::uuid,
      ${JSON.stringify({ operation })}::jsonb)
  `
}

function errorResult<T>(error: unknown, fallback: string): Result<T> {
  return { data: null, error: { message: error instanceof AccessError ? error.message : fallback } }
}

export async function readUnreadNotificationItems(userId: string): Promise<Result<NotificationRow[]>> {
  try {
    return await withNotificationActor(userId, async actor => {
      const rows = await sql<NotificationRow[]>`
        SELECT id, user_id, title, message, type, is_read, created_at, icon_type, action_url
        FROM public.notifications
        WHERE user_id = ${actor.id}::uuid AND is_read = false
        ORDER BY created_at DESC, id DESC LIMIT 20
      `
      await audit(actor, 'read_unread_notification_items', 'READ', null)
      return { data: rows, error: null }
    })
  } catch (error) { return errorResult(error, 'Unable to load notifications.') }
}

export async function readUnreadNotificationsByUserId(userId: string): Promise<Result<Pick<NotificationRow, 'id' | 'type' | 'title'>[]>> {
  const result = await readUnreadNotificationItems(userId)
  return result.error ? { data: null, error: result.error } : {
    data: (result.data ?? []).map(({ id, type, title }) => ({ id, type, title })), error: null,
  }
}

export async function readUnreadNotificationsCount(userId: string): Promise<Result<{ count: string }>> {
  try {
    return await withNotificationActor(userId, async actor => {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM public.notifications
        WHERE user_id = ${actor.id}::uuid AND is_read = false
      `
      await audit(actor, 'count_unread_notifications', 'READ', null)
      return { data: { count: String(Number(row?.count ?? 0)) }, error: null }
    })
  } catch (error) { return errorResult(error, 'Unable to count notifications.') }
}

export async function readRecentOwnNotifications(limit = 10): Promise<Result<NotificationRow[]>> {
  const parsed = limitSchema.safeParse(limit)
  if (!parsed.success) return { data: null, error: { message: 'Invalid notification limit.' } }
  try {
    return await withNotificationActor(null, async actor => {
      const rows = await sql<NotificationRow[]>`
        SELECT id, user_id, title, message, type, is_read, created_at, icon_type, action_url
        FROM public.notifications WHERE user_id = ${actor.id}::uuid
        ORDER BY created_at DESC, id DESC LIMIT ${parsed.data}
      `
      await audit(actor, 'read_recent_notifications', 'READ', null)
      return { data: rows, error: null }
    })
  } catch (error) { return errorResult(error, 'Unable to load notifications.') }
}

export async function markOwnNotificationAsRead(notificationId: string): Promise<Result<null>> {
  if (!idSchema.safeParse(notificationId).success) return { data: null, error: { message: 'Invalid notification.' } }
  try {
    return await withNotificationActor(null, async actor => {
      const rows = await sql<{ id: string }[]>`
        UPDATE public.notifications SET is_read = true
        WHERE id = ${notificationId}::uuid AND user_id = ${actor.id}::uuid AND is_read IS DISTINCT FROM true
        RETURNING id
      `
      if (!rows[0]) throw new AccessError('Notification not found.')
      await audit(actor, 'mark_notification_read', 'UPDATE', notificationId)
      return { data: null, error: null }
    })
  } catch (error) { return errorResult(error, 'Unable to update notification.') }
}

export async function deleteOwnNotification(notificationId: string, userId: string): Promise<Result<null>> {
  if (!idSchema.safeParse(notificationId).success) return { data: null, error: { message: 'Invalid notification.' } }
  try {
    return await withNotificationActor(userId, async actor => {
      const rows = await sql<{ id: string }[]>`
        DELETE FROM public.notifications
        WHERE id = ${notificationId}::uuid AND user_id = ${actor.id}::uuid
        RETURNING id
      `
      if (!rows[0]) throw new AccessError('Notification not found.')
      await audit(actor, 'delete_notification', 'DELETE', notificationId)
      return { data: null, error: null }
    })
  } catch (error) { return errorResult(error, 'Unable to delete notification.') }
}
