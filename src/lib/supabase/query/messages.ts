import type { Supabase } from '../types'

export async function getConversationByApplicationId(supabase: Supabase, applicationId: string) {
  return supabase
    .from('conversations')
    .select('id')
    .eq('application_id', applicationId)
    .maybeSingle()
}

export async function insertConversation(
  supabase: Supabase,
  data: { client_id?: string | null; application_id: string }
) {
  return supabase.from('conversations').insert(data).select().single()
}

export async function getMessagesByConversationId(supabase: Supabase, conversationId: string) {
  return supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, created_at, is_read')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
}

/** Get all messages in given conversation ids (for expert unread list). */
export async function getMessagesByConversationIds(supabase: Supabase, conversationIds: string[]) {
  if (conversationIds.length === 0) return { data: [], error: null }
  return supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, created_at, is_read')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })
    .limit(5000)
}

/** Unread messages for a user across conversations (newest first), server-capped. Prefer over {@link getMessagesByConversationIds}. */
export async function rpcGetUnreadMessagesForUserInConversations(
  supabase: Supabase,
  conversationIds: string[],
  userId: string,
  maxRows = 1500
) {
  if (conversationIds.length === 0) return { data: [], error: null }
  return supabase.rpc('get_unread_messages_for_user_in_conversations', {
    conversation_ids: conversationIds,
    p_user_id: userId,
    max_rows: maxRows,
  })
}

/** Mark all messages in a conversation as read except those sent by excludeSenderId. */
export async function markConversationMessagesAsReadExceptSender(
  supabase: Supabase,
  conversationId: string,
  excludeSenderId: string
) {
  return supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', excludeSenderId)
}

export async function rpcMarkMessageAsReadByUser(
  supabase: Supabase,
  messageId: string,
  userId: string
) {
  return supabase.rpc('mark_message_as_read_by_user', {
    message_id: messageId,
    user_id: userId,
  })
}

/** Mark many messages read for one user (single RPC; same semantics as {@link rpcMarkMessageAsReadByUser}). */
export async function rpcMarkMessagesAsReadByUser(
  supabase: Supabase,
  messageIds: string[],
  userId: string
) {
  if (messageIds.length === 0) return { data: null, error: null }
  return supabase.rpc('mark_messages_as_read_by_user', {
    p_message_ids: messageIds,
    p_user_id: userId,
  })
}

export async function insertMessage(
  supabase: Supabase,
  data: { conversation_id: string; sender_id: string; content: string }
) {
  return supabase.from('messages').insert(data).select().single()
}

export async function updateConversationLastMessageAt(supabase: Supabase, conversationId: string) {
  return supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)
}

/** RPC: get total unread message count for user in given conversations. */
export async function rpcGetTotalUnreadCountForUser(
  supabase: Supabase,
  conversationIds: string[],
  userId: string
) {
  return supabase.rpc('get_total_unread_count_for_user', {
    conversation_ids: conversationIds,
    user_id: userId,
  })
}

/** Get unread notifications for user (id, type, title). */
export async function getUnreadNotificationsByUserId(supabase: Supabase, userId: string) {
  return supabase
    .from('notifications')
    .select('id, type, title')
    .eq('user_id', userId)
    .eq('is_read', false)
}

/** Get unread notification items for dropdown, limit 20. */
export async function getUnreadNotificationItems(
  supabase: Supabase,
  userId: string
) {
  return supabase
    .from('notifications')
    .select('id, title, message, type, created_at, action_url')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20)
}

/** Get conversation application_ids (for admin dropdown). */
export async function getConversationApplicationIds(supabase: Supabase, limitCount = 100) {
  return supabase
    .from('conversations')
    .select('application_id')
    .not('application_id', 'is', null)
    .limit(limitCount)
}

/** Get conversation ids (for admin badge count). */
export async function getConversationIds(supabase: Supabase, limitCount = 500) {
  return supabase.from('conversations').select('id').limit(limitCount)
}

/** Get conversations by admin_id (for admin messages page). */
export async function getConversationsByAdminId(supabase: Supabase, adminId: string) {
  return supabase
    .from('conversations')
    .select('id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id')
    .eq('admin_id', adminId)
    .order('last_message_at', { ascending: false })
}

/** Get conversations by client ids. */
export async function getConversationsByClientIds(supabase: Supabase, clientIds: string[]) {
  if (clientIds.length === 0) return { data: [], error: null }
  return supabase
    .from('conversations')
    .select('id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id')
    .in('client_id', clientIds)
    .order('last_message_at', { ascending: false })
}

/** Get conversation by client_id (single). */
export async function getConversationByClientId(supabase: Supabase, clientId: string) {
  return supabase
    .from('conversations')
    .select('id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at, application_id')
    .eq('client_id', clientId)
    .maybeSingle()
}

/** Get conversations by client_id (list, for client messages page). */
export async function getConversationsByClientId(supabase: Supabase, clientId: string) {
  return supabase
    .from('conversations')
    .select('id, client_id, expert_id, admin_id, last_message_at, created_at, updated_at')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
}

/** Get conversations with application embed by application ids (for expert messages). */
export async function getConversationsWithApplicationByApplicationIds(
  supabase: Supabase,
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  return supabase
    .from('conversations')
    .select(`
      *,
      application:applications!inner(id, application_name, state, company_owner_id)
    `)
    .in('application_id', applicationIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
}

/** RPC: per-client unread counts for admin list (optional client id filter). */
export async function rpcAdminUnreadMessageCountsByClient(
  supabase: Supabase,
  readerUserId: string,
  clientIds?: string[] | null
) {
  return supabase.rpc('admin_unread_message_counts_by_client', {
    p_reader_id: readerUserId,
    p_client_ids: clientIds != null && clientIds.length > 0 ? clientIds : null,
  })
}

/** RPC: per-conversation unread counts for user. */
export async function rpcCountUnreadMessagesForUser(
  supabase: Supabase,
  conversationIds: string[],
  userId: string
) {
  return supabase.rpc('count_unread_messages_for_user', {
    conversation_ids: conversationIds,
    user_id: userId,
  })
}

/** Get conversations with application (id, application_id, last_message_at, applications). */
export async function getConversationsWithApplications(
  supabase: Supabase,
  applicationIds: string[]
) {
  if (applicationIds.length === 0) return { data: [], error: null }
  return supabase
    .from('conversations')
    .select('id, application_id, last_message_at, applications(id, application_name, state, company_owner_id)')
    .in('application_id', applicationIds)
    .order('last_message_at', { ascending: false })
}

/** Mark notification as read by id. */
export async function markNotificationAsRead(supabase: Supabase, notificationId: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
}

/** Delete notification by id and user_id. */
export async function deleteNotificationByIdAndUser(
  supabase: Supabase,
  notificationId: string,
  userId: string
) {
  return supabase.from('notifications').delete().eq('id', notificationId).eq('user_id', userId)
}

/** Get unread notifications count for user. */
export async function getUnreadNotificationsCount(supabase: Supabase, userId: string) {
  return supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
}

/** Get unread notifications for user (full rows), optional limit, for dashboard. */
export async function getUnreadNotificationsForUser(
  supabase: Supabase,
  userId: string,
  limit = 10
) {
  return supabase
    .from('notifications')
    .select('id, user_id, title, type, is_read, created_at, message, icon_type')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit)
}
