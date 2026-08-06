'use server'

import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'

async function requireAdminSupabase() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { supabase, user: null, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase, user, error: 'Forbidden' }
  return { supabase, user, error: null }
}

export type FilteredAgencyAdminsPayload = {
  clients: Record<string, unknown>[]
  totalCount: number
  statesByClient: Record<string, string[]>
  casesByClient: Record<string, unknown[]>
  unreadMessagesByClient: Record<string, number>
  expertsByUserId: Record<string, Record<string, unknown>>
}

export async function fetchFilteredAgencyAdminsAction(filters: {
  search: string
  selectedState: string
  selectedStatus: string
  selectedExpert: string
  page?: number
  pageSize?: number
}): Promise<{ error: string | null; data: FilteredAgencyAdminsPayload | null }> {
  const ctx = await requireAdminSupabase()
  if (ctx.error) return { error: ctx.error, data: null }
  const { supabase, user } = ctx
  if (!user) return { error: 'Not authenticated', data: null }

  const page     = filters.page     ?? 0
  const pageSize = filters.pageSize ?? 50

  const { data: allClients, error } = await q.getAgencyAdminsFiltered(supabase, {
    search: filters.search.trim() || undefined,
    status: filters.selectedStatus,
    expertUserId: filters.selectedExpert,
    state: filters.selectedState,
  })

  if (error) return { error: error.message, data: null }

  const allRows    = (allClients ?? []) as Record<string, unknown>[]
  const totalCount = allRows.length
  const from       = page * pageSize
  const rows       = allRows.slice(from, from + pageSize)
  const clientIds  = rows.map((c) => String(c.id)).filter(Boolean)

  if (clientIds.length === 0) {
    return {
      error: null,
      data: {
        clients: [],
        totalCount,
        statesByClient: {},
        casesByClient: {},
        unreadMessagesByClient: {},
        expertsByUserId: {},
      },
    }
  }

  const [{ data: clientStates }, { data: casesData }, { data: unreadRows, error: unreadErr }] = await Promise.all([
    q.getClientStatesByClientIds(supabase, clientIds),
    q.getCasesByClientIds(supabase, clientIds, 'client_id, progress_percentage, status'),
    q.rpcAdminUnreadMessageCountsByClient(supabase, user.id, clientIds),
  ])

  if (unreadErr) {
    console.error('admin_unread_message_counts_by_client RPC failed:', unreadErr.message)
  }

  type UnreadRow = { client_id: string; unread_count: number | string }
  const unreadMessagesByClient: Record<string, number> = {}
  for (const row of (unreadRows ?? []) as UnreadRow[]) {
    const cid = row.client_id
    const n = Number(row.unread_count ?? 0)
    if (!cid || !Number.isFinite(n) || n <= 0) continue
    unreadMessagesByClient[cid] = (unreadMessagesByClient[cid] || 0) + n
  }

  type ClientStateRow = { client_id: string; state: string }
  const statesByClient: Record<string, string[]> = {}
  ;(clientStates as ClientStateRow[] | null)?.forEach((cs) => {
    if (!statesByClient[cs.client_id]) statesByClient[cs.client_id] = []
    statesByClient[cs.client_id].push(cs.state)
  })

  const casesByClient: Record<string, unknown[]> = {}
  const cases = casesData as { client_id: string }[] | null
  cases?.forEach((c) => {
    if (!casesByClient[c.client_id]) casesByClient[c.client_id] = []
    casesByClient[c.client_id].push(c)
  })

  const expertIds = Array.from(
    new Set(rows.map((c) => c.expert_id as string | null | undefined).filter((id): id is string => Boolean(id)))
  )
  const { data: experts } =
    expertIds.length > 0 ? await q.getLicensingExpertsByIds(supabase, expertIds, '*') : { data: [] }
  type ExpertRow = { user_id: string }
  const expertsByUserId: Record<string, Record<string, unknown>> = {}
  for (const e of (experts ?? []) as unknown as ExpertRow[]) {
    if (e?.user_id) expertsByUserId[e.user_id] = e as Record<string, unknown>
  }

  return {
    error: null,
    data: {
      clients: rows,
      totalCount,
      statesByClient,
      casesByClient,
      unreadMessagesByClient,
      expertsByUserId,
    },
  }
}

export type FilteredExpertsPayload = {
  experts: Record<string, unknown>[]
  statesByExpert: Record<string, string[]>
  clientsByExpert: Record<string, number>
}

export async function fetchFilteredExpertsAction(filters: {
  search: string
  selectedState: string
  selectedStatus: string
}): Promise<{ error: string | null; data: FilteredExpertsPayload | null }> {
  const ctx = await requireAdminSupabase()
  if (ctx.error) return { error: ctx.error, data: null }
  const { supabase } = ctx

  const { data: experts, error } = await q.getLicensingExpertsFiltered(supabase, {
    search: filters.search.trim() || undefined,
    status: filters.selectedStatus,
    state: filters.selectedState,
  })

  if (error) return { error: error.message, data: null }
  const expertRows = (experts ?? []) as Record<string, unknown>[]
  const expertIds = expertRows.map((e) => String(e.id)).filter(Boolean)

  if (expertIds.length === 0) {
    return { error: null, data: { experts: [], statesByExpert: {}, clientsByExpert: {} } }
  }

  const [{ data: expertStates }, { data: clients }] = await Promise.all([
    q.getExpertStatesByExpertIds(supabase, expertIds),
    q.getClientsByExpertIds(supabase, expertIds),
  ])

  const statesByExpert: Record<string, string[]> = {}
  ;(expertStates as { expert_id: string; state: string }[] | null)?.forEach((es) => {
    if (!statesByExpert[es.expert_id]) statesByExpert[es.expert_id] = []
    statesByExpert[es.expert_id].push(es.state)
  })

  const clientsByExpert: Record<string, number> = {}
  ;(clients as { expert_id: string | null }[] | null)?.forEach((c) => {
    if (c.expert_id) {
      clientsByExpert[c.expert_id] = (clientsByExpert[c.expert_id] || 0) + 1
    }
  })

  return {
    error: null,
    data: {
      experts: expertRows,
      statesByExpert,
      clientsByExpert,
    },
  }
}
