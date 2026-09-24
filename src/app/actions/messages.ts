'use server'

import * as q from '@/lib/supabase/query'
import { getSession } from '@/lib/auth'
import { withUserContext } from '@/db'

async function ctx<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session) return { data: null, error: 'Unauthorized' } as any
  try {
    return await withUserContext(
      session.user.id,
      session.profile.role ?? '',
      session.profile.agency_id ?? null,
      fn
    )
  } catch (err) {
    console.error('[messages action]', err)
    return { data: null, error: 'Internal error' } as any
  }
}

export async function getConversationByApplicationIdAction(applicationId: string) {
  return ctx(() => q.getConversationByApplicationId(applicationId))
}

export async function insertConversationAction(data: { client_id?: string | null; application_id: string }) {
  return ctx(() => q.insertConversation(data))
}

export async function getMessagesByConversationIdAction(conversationId: string) {
  return ctx(() => q.getMessagesByConversationId(conversationId))
}

export async function markConversationMessagesAsReadExceptSenderAction(conversationId: string, userId: string) {
  return q.markConversationMessagesAsReadExceptSender(conversationId, userId)
}

export async function rpcMarkMessageAsReadByUserAction(messageId: string, userId: string) {
  return q.rpcMarkMessageAsReadByUser(messageId, userId)
}

export async function rpcMarkMessagesAsReadByUserAction(messageIds: string[], userId: string) {
  return q.rpcMarkMessagesAsReadByUser(messageIds, userId)
}

export async function insertMessageAction(data: { conversation_id: string; sender_id: string; content: string }) {
  return ctx(() => q.insertMessage(data))
}

export async function updateConversationLastMessageAtAction(conversationId: string) {
  return ctx(() => q.updateConversationLastMessageAt(conversationId))
}

export async function getUserProfilesByIdsAction(ids: string[]) {
  return ctx(() => q.getUserProfilesByIds(ids))
}

export async function getUnreadNotificationsCountAction(userId: string) {
  return q.getUnreadNotificationsCount(userId)
}

export async function getUnreadNotificationsByUserIdAction(userId: string) {
  return q.getUnreadNotificationsByUserId(userId)
}

export async function getUnreadNotificationItemsAction(userId: string) {
  return q.getUnreadNotificationItems(userId)
}

export async function markNotificationAsReadAction(notificationId: string) {
  return q.markNotificationAsRead(notificationId)
}

export async function deleteNotificationByIdAndUserAction(notificationId: string, userId: string) {
  return q.deleteNotificationByIdAndUser(notificationId, userId)
}

export async function getUserProfileRoleByIdAction(userId: string) {
  return ctx(() => q.getUserProfileRoleById(userId))
}

export async function getAgencyIdFromProfileAction(userId: string) {
  return ctx(() => q.getAgencyIdFromProfile(userId))
}

export async function getApplicationIdsByAgencyIdAction(agencyId: string) {
  return ctx(() => q.getApplicationIdsByAgencyId(agencyId))
}

export async function getApplicationIdsByAssignedExpertIdAction(userId: string) {
  return ctx(() => q.getApplicationIdsByAssignedExpertId(userId))
}

export async function getConversationApplicationIdsAction(limitCount = 100) {
  return ctx(() => q.getConversationApplicationIds(limitCount))
}

export async function getConversationIdsAction(limitCount = 500) {
  return ctx(() => q.getConversationIds(limitCount))
}

export async function getConversationsWithApplicationsAction(applicationIds: string[]) {
  return ctx(() => q.getConversationsWithApplications(applicationIds))
}

export async function rpcCountUnreadMessagesForUserAction(conversationIds: string[], userId: string) {
  return q.rpcCountUnreadMessagesForUser(conversationIds, userId)
}

export async function rpcGetTotalUnreadCountForUserAction(conversationIds: string[], userId: string) {
  return q.rpcGetTotalUnreadCountForUser(conversationIds, userId)
}
