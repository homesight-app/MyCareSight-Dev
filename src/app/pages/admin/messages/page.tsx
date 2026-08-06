import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminMessagesContent from '@/components/AdminMessagesContent'

export default async function MessagesPage() {
  const { user } = await requireAdmin()
  const supabase = await createClient()

  const { data: conversations } = await q.getConversationsByAdminId(supabase, user.id)

  type ConvRow = { id: string; client_id: string; expert_id: string | null; admin_id?: string; last_message_at?: string }
  const convList = (conversations ?? []) as unknown as ConvRow[]
  const clientIds = convList.map(c => c.client_id).filter(Boolean)
  const expertIds = convList.map(c => c.expert_id).filter(Boolean) as string[]

  const { data: clientsData } =
    clientIds.length > 0 ? await q.getClientsByIds(supabase, clientIds, 'id, company_name') : { data: [] }
  const { data: expertsData } =
    expertIds.length > 0 ? await q.getLicensingExpertsByIds(supabase, expertIds) : { data: [] }
  type ClientRow = { id: string; company_name?: string }
  type ExpertRow = { id: string; user_id?: string; first_name?: string; last_name?: string }
  const clients = (clientsData ?? []) as unknown as ClientRow[]
  const experts = (expertsData ?? []) as unknown as ExpertRow[]

  const clientsById: Record<string, ClientRow> = {}
  clients.forEach(c => {
    clientsById[c.id] = c
  })

  const expertsById: Record<string, ExpertRow> = {}
  experts.forEach(e => {
    expertsById[e.id] = e
  })

  const conversationIds = convList.map(c => c.id)
  const { data: unreadRpcRows } =
    conversationIds.length > 0
      ? await q.rpcCountUnreadMessagesForUser(supabase, conversationIds, user.id)
      : { data: [] }

  const unreadCountsByConv: Record<string, number> = {}
  unreadRpcRows?.forEach((row: { conversation_id: string; unread_count: number }) => {
    unreadCountsByConv[row.conversation_id] = Number(row.unread_count)
  })

  // Prepare conversations with related data
  // Only include conversations that actually exist and have a client
  const conversationsWithData = convList
    .filter(conv => conv.client_id && clientsById[conv.client_id]) // Only show if client exists
    .map(conv => ({
      id: conv.id,
      client_id: conv.client_id,
      expert_id: conv.expert_id,
      admin_id: conv.admin_id ?? null,
      last_message_at: conv.last_message_at ?? '',
      client: clientsById[conv.client_id],
      expert: conv.expert_id ? expertsById[conv.expert_id] : null,
      unread_count: unreadCountsByConv[conv.id] || 0
    }))

  return (
      <AdminMessagesContent
        initialConversations={conversationsWithData as unknown as Parameters<typeof AdminMessagesContent>[0]['initialConversations']}
        userId={user.id}
      />
  )
}

