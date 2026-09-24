export {
  rpcGetTotalUnreadCountForUser,
  getTotalMessageCountForUser,
  rpcCountUnreadMessagesForUser,
  rpcAdminUnreadMessageCountsByClient,
  rpcGetUnreadMessagesForUserInConversations,
  rpcMarkMessagesAsReadByUser,
  rpcMarkMessageAsReadByUser,
  markConversationMessagesAsReadExceptSender,
} from '@/lib/repositories/message-read-state'
export {
  deleteOwnNotification as deleteNotificationByIdAndUser,
  markOwnNotificationAsRead as markNotificationAsRead,
  readUnreadNotificationItems as getUnreadNotificationItems,
  readUnreadNotificationsByUserId as getUnreadNotificationsByUserId,
  readUnreadNotificationsCount as getUnreadNotificationsCount,
} from '@/lib/repositories/notification-lifecycle'

import sql from '@/db'

export async function getConversationByApplicationId(applicationId: string) {
  try {
    const rows = await sql`
      SELECT id FROM conversations WHERE application_id = ${applicationId} LIMIT 1
    `
    return { data: (rows[0] ?? null) as { id: string } | null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertConversation(
  data: { client_id?: string | null; application_id: string }
) {
  try {
    const rows = await sql`
      INSERT INTO conversations ${sql(data, ...Object.keys(data) as any)} RETURNING *
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getMessagesByConversationId(conversationId: string) {
  try {
    const rows = await sql`
      SELECT id, conversation_id, sender_id, content, created_at, is_read
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all messages in given conversation ids (for expert unread list). */
export async function getMessagesByConversationIds(conversationIds: string[]) {
  if (conversationIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT id, conversation_id, sender_id, content, created_at, is_read
      FROM messages
      WHERE conversation_id = ANY(${conversationIds as any})
      ORDER BY created_at DESC
      LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertMessage(
  data: { conversation_id: string; sender_id: string; content: string }
) {
  try {
    const rows = await sql`
      INSERT INTO messages ${sql(data, ...Object.keys(data) as any)} RETURNING *
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateConversationLastMessageAt(conversationId: string) {
  try {
    await sql`
      UPDATE conversations
      SET last_message_at = ${new Date().toISOString()}
      WHERE id = ${conversationId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}


/** Get conversation application_ids (for admin dropdown). */
export async function getConversationApplicationIds(limitCount = 100) {
  try {
    const rows = await sql`
      SELECT application_id
      FROM conversations
      WHERE application_id IS NOT NULL
      LIMIT ${limitCount}
    `
    return { data: rows as unknown as { application_id: string }[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversation ids (for admin badge count). */
export async function getConversationIds(limitCount = 500) {
  try {
    const rows = await sql`
      SELECT id FROM conversations LIMIT ${limitCount}
    `
    return { data: rows as unknown as { id: string }[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversations by admin_id (for admin messages page). */
export async function getConversationsByAdminId(adminId: string) {
  try {
    const rows = await sql`
      SELECT id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id
      FROM conversations
      WHERE admin_id = ${adminId}
      ORDER BY last_message_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversations by client ids. */
export async function getConversationsByClientIds(clientIds: string[]) {
  if (clientIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id
      FROM conversations
      WHERE client_id = ANY(${clientIds as any})
      ORDER BY last_message_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversation by client_id (single). */
export async function getConversationByClientId(clientId: string) {
  try {
    const rows = await sql`
      SELECT id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id
      FROM conversations
      WHERE client_id = ${clientId}
      LIMIT 1
    `
    return { data: (rows[0] ?? null) as Record<string, unknown> | null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversations by client_id (list, for client messages page). */
export async function getConversationsByClientId(clientId: string) {
  try {
    const rows = await sql`
      SELECT id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at
      FROM conversations
      WHERE client_id = ${clientId}
      ORDER BY last_message_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversations with application embed by application ids (for expert messages). */
export async function getConversationsWithApplicationByApplicationIds(
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT
        c.*,
        json_build_object(
          'id', a.id,
          'application_name', a.application_name,
          'state', a.state,
          'company_owner_id', a.company_owner_id
        ) AS application
      FROM conversations c
      INNER JOIN applications a ON a.id = c.application_id
      WHERE c.application_id = ANY(${applicationIds as any})
      ORDER BY c.last_message_at DESC NULLS LAST
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get conversations with application (id, application_id, last_message_at, applications). */
export async function getConversationsWithApplications(
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT
        c.id,
        c.application_id,
        c.last_message_at,
        json_build_object(
          'id', a.id,
          'application_name', a.application_name,
          'state', a.state,
          'company_owner_id', a.company_owner_id
        ) AS applications
      FROM conversations c
      LEFT JOIN applications a ON a.id = c.application_id
      WHERE c.application_id = ANY(${applicationIds as any})
      ORDER BY c.last_message_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}


/** Get unread notifications for user (full rows), optional limit, for dashboard. */
export async function getUnreadNotificationsForUser(
  userId: string,
  limit = 10
) {
  try {
    const rows = await sql`
      SELECT id, user_id, title, type, is_read, created_at, message, icon_type
      FROM notifications
      WHERE user_id = ${userId} AND is_read = false
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
