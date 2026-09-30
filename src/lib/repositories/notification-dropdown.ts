import 'server-only'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { databaseTimestamp, type DatabaseTemporalValue } from '@/lib/database-date-contract'

export type NotificationApplicationItem = {
  application_id: string
  application_name: string
  state: string
  unread_count: number
  last_message_at: string
}

export type NotificationListItem = {
  id: string
  title: string
  message: string | null
  type: string
  created_at: string
  action_url: string | null
}

export type NotificationBadgeSnapshot = {
  unreadCount: number
  role: string
}

export type NotificationDropdownSnapshot = NotificationBadgeSnapshot & {
  applications: NotificationApplicationItem[]
  notifications: NotificationListItem[]
}

type Result<T> = { data: T | null; error: { message: string } | null }
type Actor = { id: string; role: string; agency_id: string | null }
type CountRow = { unread_message_count: string; unread_notification_count: string }
type ApplicationRow = Omit<NotificationApplicationItem, 'unread_count' | 'last_message_at'> & {
  unread_count: string
  last_message_at: DatabaseTemporalValue | null
}
type NotificationRow = Omit<NotificationListItem, 'created_at'> & {
  created_at: DatabaseTemporalValue
}

class AccessError extends Error {}

function scopedConversationPredicate(actor: Actor) {
  return sql`
    (${actor.role} = 'admin')
    OR (${actor.role} = 'expert' AND a.assigned_expert_id = ${actor.id}::uuid)
    OR (
      ${actor.role} IN ('company_owner', 'care_coordinator')
      AND a.agency_id = ${actor.agency_id}::uuid
    )
  `
}

function unreadMessagePredicate(actorId: string) {
  return sql`
    m.sender_id <> ${actorId}::uuid
    AND NOT COALESCE(${actorId}::uuid = ANY(m.is_read), false)
  `
}

async function currentActor(): Promise<Actor> {
  const [actor] = await sql<Actor[]>`
    SELECT p.id, p.role, p.agency_id
    FROM public.user_profiles p
    WHERE p.id = current_setting('app.current_user_id', true)::uuid
      AND p.is_active = true
      AND (
        p.role IN ('admin', 'expert')
        OR (
          p.role IN ('company_owner', 'care_coordinator', 'staff_member')
          AND p.agency_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.user_agency_roles membership
            WHERE membership.user_id = p.id
              AND membership.agency_id = p.agency_id
              AND membership.role = p.role
              AND membership.status = 'active'
          )
        )
      )
    LIMIT 1
  `
  if (!actor) throw new AccessError('Forbidden')
  return actor
}

async function withNotificationActor<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session?.user.id || !session.profile.is_active) throw new AccessError('Unauthorized')

  return withUserContext(
    session.user.id,
    session.profile.role,
    session.profile.agency_id,
    async () => run(await currentActor())
  )
}

function safeCount(value: string | number | null | undefined): number {
  const count = Number(value ?? 0)
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid unread count')
  return count
}

function resultError<T>(error: unknown): Result<T> {
  return {
    data: null,
    error: { message: error instanceof AccessError ? error.message : 'Unable to load notifications.' },
  }
}

async function readCounts(actor: Actor): Promise<{ messages: number; notifications: number }> {
  const [row] = await sql<CountRow[]>`
    WITH scoped_conversations AS (
      SELECT c.id
      FROM public.conversations c
      INNER JOIN public.applications a ON a.id = c.application_id
      WHERE ${scopedConversationPredicate(actor)}
    )
    SELECT
      (
        SELECT count(*)::text
        FROM public.messages m
        INNER JOIN scoped_conversations c ON c.id = m.conversation_id
        WHERE ${unreadMessagePredicate(actor.id)}
      ) AS unread_message_count,
      (
        SELECT count(*)::text
        FROM public.notifications n
        WHERE n.user_id = ${actor.id}::uuid
          AND n.is_read = false
          AND NOT (n.type = 'general' AND n.title = 'New Message')
      ) AS unread_notification_count
  `
  return {
    messages: safeCount(row?.unread_message_count),
    notifications: safeCount(row?.unread_notification_count),
  }
}

export async function readNotificationBadgeSnapshot(): Promise<Result<NotificationBadgeSnapshot>> {
  try {
    return await withNotificationActor(async actor => {
      const counts = await readCounts(actor)
      return {
        data: { unreadCount: counts.messages + counts.notifications, role: actor.role },
        error: null,
      }
    })
  } catch (error) {
    return resultError(error)
  }
}

export async function readNotificationDropdownSnapshot(): Promise<Result<NotificationDropdownSnapshot>> {
  try {
    return await withNotificationActor(async actor => {
      const applicationRows = await sql<ApplicationRow[]>`
        SELECT
          a.id AS application_id,
          COALESCE(a.application_name, 'Application ' || COALESCE(a.state, '')) AS application_name,
          COALESCE(a.state, '') AS state,
          count(*)::text AS unread_count,
          max(c.last_message_at) AS last_message_at
        FROM public.conversations c
        INNER JOIN public.applications a ON a.id = c.application_id
        INNER JOIN public.messages m ON m.conversation_id = c.id
        WHERE ${scopedConversationPredicate(actor)}
          AND ${unreadMessagePredicate(actor.id)}
        GROUP BY a.id, a.application_name, a.state
        ORDER BY max(c.last_message_at) DESC NULLS LAST, a.id
        LIMIT 100
      `
      const notificationRows = await sql<NotificationRow[]>`
        SELECT n.id, n.title, n.message, n.type, n.created_at, n.action_url
        FROM public.notifications n
        WHERE n.user_id = ${actor.id}::uuid
          AND n.is_read = false
          AND NOT (n.type = 'general' AND n.title = 'New Message')
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 20
      `

      const applications = applicationRows.map(row => ({
        application_id: row.application_id,
        application_name: row.application_name,
        state: row.state,
        unread_count: safeCount(row.unread_count),
        last_message_at: row.last_message_at ? databaseTimestamp(row.last_message_at) : '',
      }))
      const notifications = notificationRows.map(row => ({
        ...row,
        created_at: databaseTimestamp(row.created_at),
      }))
      const counts = await readCounts(actor)
      const unreadCount = counts.messages + counts.notifications

      await sql`
        INSERT INTO public.audit_log
          (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (
          ${actor.agency_id}::uuid,
          'notifications',
          NULL,
          'READ',
          ${actor.id}::uuid,
          ${JSON.stringify({
            operation: 'read_notification_dropdown',
            application_ids: applications.map(item => item.application_id),
            notification_ids: notifications.map(item => item.id),
          })}::jsonb
        )
      `

      return {
        data: { applications, notifications, unreadCount, role: actor.role },
        error: null,
      }
    })
  } catch (error) {
    return resultError(error)
  }
}
