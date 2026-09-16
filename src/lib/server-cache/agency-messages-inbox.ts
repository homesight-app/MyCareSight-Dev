import { unstable_cache } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { CACHE_TAG_AGENCY_MESSAGES_INBOX } from '@/lib/cache-tags'

export type AgencyConversationRow = {
  id: string
  client_id: string
  expert_id: string | null
  last_message_at: string
  expert?: { user_id: string; first_name: string; last_name: string }
  unread_count: number
  conversation_type: 'admin' | 'expert'
}

export type AgencyMessagesInboxPayload =
  | { ok: true; clientId: string; conversationsWithData: AgencyConversationRow[]; adminUserId: string | null }
  | { ok: false; reason: 'no_client' }

async function loadAgencyMessagesInboxUncached(viewerUserId: string): Promise<AgencyMessagesInboxPayload> {
  const { data: client, error: clientError } = await q.getClientByCompanyOwnerId(viewerUserId)
  if (clientError || !client) {
    return { ok: false, reason: 'no_client' }
  }

  const { data: conversationsData } = await q.getConversationsByClientId(client.id)
  const conversations = conversationsData ?? []

  const { data: adminProfile } = await q.getFirstAdminUserId()
  const adminUserId = adminProfile?.id ?? null

  const conversationIds = conversations.map((c) => c.id)
  const { data: unreadRpcRows } =
    conversationIds.length > 0
      ? await q.rpcCountUnreadMessagesForUser(conversationIds, viewerUserId)
      : { data: [] }

  const unreadCountsByConv: Record<string, number> = {}
  ;(unreadRpcRows ?? []).forEach((row: { conversation_id: string; unread_count: number }) => {
    unreadCountsByConv[row.conversation_id] = Number(row.unread_count)
  })

  const conversationsWithData: AgencyConversationRow[] = []

  const expertRecordIds = conversations.map((c) => c.expert_id).filter(Boolean) as string[]
  const { data: expertRecordsData } =
    expertRecordIds.length > 0 ? await q.getLicensingExpertsByIds(expertRecordIds) : { data: [] }
  type ExpertRow = { id: string; user_id?: string; first_name?: string; last_name?: string }
  const expertRecords = (expertRecordsData ?? []) as unknown as ExpertRow[]

  const expertsById: Record<string, ExpertRow> = {}
  expertRecords.forEach((e) => {
    expertsById[e.id] = e
  })

  conversations.forEach((conv) => {
    if (conv.admin_id && !conv.expert_id) {
      conversationsWithData.push({
        id: conv.id,
        client_id: conv.client_id,
        expert_id: null,
        last_message_at: conv.last_message_at,
        expert: undefined,
        unread_count: unreadCountsByConv[conv.id] || 0,
        conversation_type: 'admin',
      })
    } else if (conv.expert_id && !conv.admin_id) {
      const expertRecord = expertsById[conv.expert_id]
      if (expertRecord) {
        conversationsWithData.push({
          id: conv.id,
          client_id: conv.client_id,
          expert_id: conv.expert_id,
          last_message_at: conv.last_message_at,
          expert: {
            user_id: expertRecord.user_id ?? '',
            first_name: expertRecord.first_name ?? '',
            last_name: expertRecord.last_name ?? '',
          },
          unread_count: unreadCountsByConv[conv.id] || 0,
          conversation_type: 'expert',
        })
      }
    }
  })

  conversationsWithData.sort((a, b) => {
    const dateA = new Date(a.last_message_at).getTime()
    const dateB = new Date(b.last_message_at).getTime()
    return dateB - dateA
  })

  return {
    ok: true,
    clientId: client.id,
    conversationsWithData,
    adminUserId,
  }
}

const getAgencyMessagesInboxCached = unstable_cache(
  async (viewerUserId: string) => {
    return loadAgencyMessagesInboxUncached(viewerUserId)
  },
  ['agency-messages-inbox'],
  { revalidate: 30, tags: [CACHE_TAG_AGENCY_MESSAGES_INBOX] }
)

/** Cached inbox payload; scoped by viewer. Short TTL — list also refreshes client-side. */
export function getCachedAgencyMessagesInbox(viewerUserId: string) {
  return getAgencyMessagesInboxCached(viewerUserId)
}
