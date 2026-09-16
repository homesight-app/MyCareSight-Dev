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

/** Unread messages for a user across conversations (newest first), server-capped. Prefer over {@link getMessagesByConversationIds}. */
export async function rpcGetUnreadMessagesForUserInConversations(
  conversationIds: string[],
  userId: string,
  maxRows = 1500
) {
  if (conversationIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT * FROM get_unread_messages_for_user_in_conversations(
        ${conversationIds as any},
        ${userId},
        ${maxRows}
      )
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Mark all messages in a conversation as read except those sent by excludeSenderId. */
export async function markConversationMessagesAsReadExceptSender(
  conversationId: string,
  excludeSenderId: string
) {
  try {
    await sql`
      UPDATE messages
      SET is_read = true
      WHERE conversation_id = ${conversationId}
        AND sender_id != ${excludeSenderId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function rpcMarkMessageAsReadByUser(
  messageId: string,
  userId: string
) {
  try {
    const rows = await sql`
      SELECT * FROM mark_message_as_read_by_user(${messageId}, ${userId})
    `
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Mark many messages read for one user (single RPC; same semantics as {@link rpcMarkMessageAsReadByUser}). */
export async function rpcMarkMessagesAsReadByUser(
  messageIds: string[],
  userId: string
) {
  if (messageIds.length === 0) return { data: null, error: null }
  try {
    const rows = await sql`
      SELECT * FROM mark_messages_as_read_by_user(${messageIds as any}, ${userId})
    `
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
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

/** RPC: get total unread message count for user in given conversations. */
export async function rpcGetTotalUnreadCountForUser(
  conversationIds: string[],
  userId: string
) {
  try {
    const rows = await sql`
      SELECT * FROM get_total_unread_count_for_user(${conversationIds as any}, ${userId})
    `
    return { data: (rows as unknown as any[])[0] ?? null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get unread notifications for user (id, type, title). */
export async function getUnreadNotificationsByUserId(userId: string) {
  try {
    const rows = await sql`
      SELECT id, type, title
      FROM notifications
      WHERE user_id = ${userId} AND is_read = false
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get unread notification items for dropdown, limit 20. */
export async function getUnreadNotificationItems(
  userId: string
) {
  try {
    const rows = await sql`
      SELECT id, title, message, type, created_at, action_url
      FROM notifications
      WHERE user_id = ${userId} AND is_read = false
      ORDER BY created_at DESC
      LIMIT 20
    `
    return { data: rows as unknown as any[], error: null }
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

/** RPC: per-client unread counts for admin list (optional client id filter). */
export async function rpcAdminUnreadMessageCountsByClient(
  readerUserId: string,
  clientIds?: string[] | null
) {
  try {
    const resolvedClientIds = clientIds != null && clientIds.length > 0 ? clientIds : null
    const rows = await sql`
      SELECT * FROM admin_unread_message_counts_by_client(
        ${readerUserId},
        ${resolvedClientIds as any}
      )
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** RPC: per-conversation unread counts for user. */
export async function rpcCountUnreadMessagesForUser(
  conversationIds: string[],
  userId: string
) {
  try {
    const rows = await sql`
      SELECT * FROM count_unread_messages_for_user(${conversationIds as any}, ${userId})
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

/** Mark notification as read by id. */
export async function markNotificationAsRead(notificationId: string) {
  try {
    await sql`
      UPDATE notifications SET is_read = true WHERE id = ${notificationId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Delete notification by id and user_id. */
export async function deleteNotificationByIdAndUser(
  notificationId: string,
  userId: string
) {
  try {
    await sql`
      DELETE FROM notifications WHERE id = ${notificationId} AND user_id = ${userId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get unread notifications count for user. */
export async function getUnreadNotificationsCount(userId: string) {
  try {
    const rows = await sql`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ${userId} AND is_read = false
    `
    return { data: rows[0] as any, error: null }
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
