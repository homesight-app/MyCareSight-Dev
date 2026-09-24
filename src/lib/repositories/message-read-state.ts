import 'server-only'

import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { messageIdSchema, messageIdsSchema, unreadLimitSchema } from '@/lib/schemas/message-read-state'
import { revalidatePath } from 'next/cache'

type Actor = { id: string; role: string; agency_id: string | null }
type Result<T> = { data: T | null; error: { message: string } | null }
type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  is_read: string[] | null
}

class AccessError extends Error {}

function parseIds(ids: string[]) {
  const parsed = messageIdsSchema.safeParse(ids)
  if (!parsed.success) throw new AccessError('Invalid message request')
  return parsed.data
}

/**
 * This boundary is also used by server-rendered pages. Never rely only on a
 * client action wrapper: the Auth.js session identifies the actor, and Neon
 * confirms current activation and role.
 */
async function run<T>(
  readerId: string,
  operation: string,
  action: 'READ' | 'UPDATE',
  fn: (actor: Actor) => Promise<{ data: T; resourceIds: string[]; changed?: boolean }>,
  adminOnly = false
): Promise<Result<T>> {
  try {
    const session = await getSession()
    if (!session) throw new AccessError('Unauthorized')
    if (!messageIdSchema.safeParse(readerId).success || readerId !== session.user.id) {
      throw new AccessError('Forbidden')
    }
    const actors = await sql<Actor[]>`
      SELECT id, role, agency_id FROM public.user_profiles
      WHERE id = ${session.user.id}::uuid AND is_active = true
    `
    const actor = actors[0]
    if (!actor || (adminOnly && actor.role !== 'admin')) throw new AccessError('Forbidden')

    const outcome = await withUserContext(actor.id, actor.role, actor.agency_id, async () => {
      const result = await fn(actor)
      // Audit and read-state changes commit together. Do not log message content.
      await sql`
        INSERT INTO public.audit_log
          (table_name, record_id, action, performed_by_user_id, details)
        VALUES ('messages', NULL, ${action}, ${actor.id}::uuid,
          ${JSON.stringify({ operation, resource_ids: result.resourceIds })}::jsonb)
      `
      return result
    })
    if (outcome.changed) {
      // Revalidation happens after commit; failure must not misreport a rolled-back write.
      try {
        for (const path of ['/pages/admin/messages', '/pages/admin/clients', '/pages/admin/users',
          '/pages/expert/messages', '/pages/agency/messages']) revalidatePath(path)
      } catch {
        // The next dynamic read still reads the committed database state.
      }
    }
    return { data: outcome.data, error: null }
  } catch (error) {
    // Database errors can contain query parameters: never return or log them.
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Message operation failed' } }
  }
}

/** Caller IDs only narrow this server-authorized set; they never grant access. */
function authorizedConversations(actorId: string) {
  return sql`
    SELECT c.id, c.client_id
    FROM public.conversations c
    LEFT JOIN public.applications a ON a.id = c.application_id
    JOIN public.user_profiles actor ON actor.id = ${actorId}::uuid AND actor.is_active = true
    WHERE actor.role IN ('admin', 'expert')
      OR (
        actor.role IN ('company_owner', 'care_coordinator', 'staff_member')
        AND EXISTS (
          SELECT 1 FROM public.user_agency_roles membership
          WHERE membership.user_id = actor.id
            AND membership.agency_id = a.agency_id
            AND membership.status = 'active'
            AND membership.role IN ('company_owner', 'care_coordinator', 'staff_member')
        )
      )
      OR (
        actor.role = 'company_owner' AND a.agency_id IS NULL
        AND a.company_owner_id = actor.id
      )
      OR (
        actor.role = 'company_owner' AND c.application_id IS NULL
        AND c.client_id = actor.id
      )
  `
}

function unreadFor(actorId: string) {
  return sql`
    m.sender_id <> ${actorId}::uuid
    AND NOT COALESCE(${actorId}::uuid = ANY(m.is_read), false)
  `
}

export async function rpcGetTotalUnreadCountForUser(conversationIds: string[], userId: string) {
  return run(userId, 'unread_total', 'READ', async actor => {
    const ids = parseIds(conversationIds)
    const rows = await sql<{ count: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      SELECT COUNT(*)::text AS count
      FROM public.messages m JOIN allowed c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY(${ids}::uuid[]) AND ${unreadFor(actor.id)}
    `
    const count = Number(rows[0].count)
    if (!Number.isSafeInteger(count)) throw new Error('Count overflow')
    return { data: count, resourceIds: ids }
  })
}

export async function getTotalMessageCountForUser(conversationIds: string[], userId: string) {
  return run(userId, 'message_total', 'READ', async actor => {
    const ids = parseIds(conversationIds)
    const rows = await sql<{ count: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      SELECT COUNT(*)::text AS count
      FROM public.messages m JOIN allowed c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY(${ids}::uuid[])
    `
    const count = Number(rows[0].count)
    if (!Number.isSafeInteger(count)) throw new Error('Count overflow')
    return { data: count, resourceIds: ids }
  })
}

export async function rpcCountUnreadMessagesForUser(conversationIds: string[], userId: string) {
  return run(userId, 'unread_by_conversation', 'READ', async actor => {
    const ids = parseIds(conversationIds)
    const rows = await sql<{ conversation_id: string; unread_count: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      SELECT m.conversation_id, COUNT(*)::text AS unread_count
      FROM public.messages m JOIN allowed c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY(${ids}::uuid[]) AND ${unreadFor(actor.id)}
      GROUP BY m.conversation_id
    `
    return {
      data: rows.map(row => ({ ...row, unread_count: Number(row.unread_count) })),
      resourceIds: rows.map(row => row.conversation_id),
    }
  })
}

export async function rpcAdminUnreadMessageCountsByClient(readerUserId: string, clientIds?: string[] | null) {
  return run(readerUserId, 'unread_by_client', 'READ', async actor => {
    // Undefined/null means all clients; an explicitly empty selection means none.
    const ids = clientIds == null ? null : parseIds(clientIds)
    const rows = await sql<{ client_id: string | null; unread_count: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      SELECT c.client_id, COUNT(*)::text AS unread_count
      FROM public.messages m JOIN allowed c ON c.id = m.conversation_id
      WHERE ${unreadFor(actor.id)}
        AND (${ids}::uuid[] IS NULL OR c.client_id = ANY(${ids}::uuid[]))
      GROUP BY c.client_id
    `
    return {
      data: rows.map(row => ({ ...row, unread_count: Number(row.unread_count) })),
      resourceIds: rows.flatMap(row => row.client_id ? [row.client_id] : []),
    }
  }, true)
}

export async function rpcGetUnreadMessagesForUserInConversations(
  conversationIds: string[], userId: string, maxRows = 1500
) {
  return run(userId, 'unread_messages', 'READ', async actor => {
    const ids = parseIds(conversationIds)
    const parsedLimit = unreadLimitSchema.safeParse(maxRows)
    if (!parsedLimit.success) throw new AccessError('Invalid message request')
    const limit = parsedLimit.data === 0 ? 500 : parsedLimit.data
    const rows = await sql<MessageRow[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.is_read
      FROM public.messages m JOIN allowed c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY(${ids}::uuid[]) AND ${unreadFor(actor.id)}
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit}
    `
    return { data: rows, resourceIds: rows.map(row => row.id) }
  })
}

export async function rpcMarkMessagesAsReadByUser(messageIds: string[], userId: string) {
  return run(userId, 'mark_messages_read', 'UPDATE', async actor => {
    const ids = parseIds(messageIds)
    // One atomic UPDATE preserves other readers and prevents duplicate entries.
    const rows = await sql<{ id: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      UPDATE public.messages m
      SET is_read = array_append(COALESCE(m.is_read, ARRAY[]::uuid[]), ${actor.id}::uuid)
      FROM allowed c
      WHERE c.id = m.conversation_id AND m.id = ANY(${ids}::uuid[])
        AND ${unreadFor(actor.id)}
      RETURNING m.id
    `
    // Source notifications have no message foreign key. Do not guess association
    // by timestamp and accidentally mark unrelated notifications as read.
    return { data: null, resourceIds: rows.map(row => row.id), changed: rows.length > 0 }
  })
}

export async function rpcMarkMessageAsReadByUser(messageId: string, userId: string) {
  return rpcMarkMessagesAsReadByUser([messageId], userId)
}

export async function markConversationMessagesAsReadExceptSender(conversationId: string, userId: string) {
  return run(userId, 'mark_conversation_read', 'UPDATE', async actor => {
    const parsed = messageIdSchema.safeParse(conversationId)
    if (!parsed.success) throw new AccessError('Invalid message request')
    const rows = await sql<{ id: string }[]>`
      WITH allowed AS (${authorizedConversations(actor.id)})
      UPDATE public.messages m
      SET is_read = array_append(COALESCE(m.is_read, ARRAY[]::uuid[]), ${actor.id}::uuid)
      FROM allowed c
      WHERE c.id = m.conversation_id AND m.conversation_id = ${parsed.data}::uuid
        AND ${unreadFor(actor.id)}
      RETURNING m.id
    `
    return { data: null, resourceIds: rows.map(row => row.id), changed: rows.length > 0 }
  })
}
