import type { SupabaseClient } from '@supabase/supabase-js'

export async function getLeads(
  supabase: SupabaseClient,
  opts: {
    leadType: 'agency' | 'patient'
    agencyId?: string
    stage?: string
    search?: string
    includeArchived?: boolean
  }
) {
  let query = supabase
    .from('leads')
    .select(`
      id,
      lead_type,
      agency_id,
      contact_first_name,
      contact_last_name,
      contact_email,
      contact_phone,
      company_name,
      service_type,
      stage,
      source,
      price,
      retainer_amount,
      retainer_paid_date,
      installments,
      installment_amount,
      signed_date,
      notes,
      converted_agency_id,
      converted_client_id,
      converted_at,
      status,
      created_at,
      updated_at,
      assigned_to,
      created_by,
      contact_address1,
      contact_address2,
      contact_city,
      contact_state,
      contact_zip,
      lead_owner_id,
      proposal_sent_date,
      service_states,
      lead_owner:user_profiles!leads_lead_owner_id_fkey(id, full_name)
    `)
    .eq('lead_type', opts.leadType)
    .order('created_at', { ascending: false })

  if (!opts.includeArchived) {
    query = query.eq('status', 'active')
  }

  if (opts.agencyId) {
    query = query.eq('agency_id', opts.agencyId)
  }

  if (opts.stage) {
    query = query.eq('stage', opts.stage)
  }

  if (opts.search) {
    const term = opts.search.trim()
    query = query.or(
      `contact_first_name.ilike.%${term}%,contact_last_name.ilike.%${term}%,company_name.ilike.%${term}%,contact_email.ilike.%${term}%`
    )
  }

  return query.limit(1000)
}

const LEADS_SELECT = `
  id, lead_type, agency_id,
  contact_first_name, contact_last_name, contact_email, contact_phone,
  company_name, service_type, stage, source, price, retainer_amount,
  retainer_paid_date, installments, installment_amount, signed_date, notes,
  converted_agency_id, converted_client_id, converted_at,
  status, created_at, updated_at, assigned_to, created_by,
  contact_address1, contact_address2, contact_city, contact_state, contact_zip,
  lead_owner_id, proposal_sent_date, service_states,
  lead_owner:user_profiles!leads_lead_owner_id_fkey(id, full_name)
`

export interface GetLeadsPaginatedOpts {
  leadType: 'agency' | 'patient'
  agencyId?: string
  page?: number
  pageSize?: number
  search?: string
  stageFilter?: string   // 'active' | 'all' | 'archived' | specific stage key
  serviceType?: string
  source?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}

function applyLeadFilters(query: any, opts: GetLeadsPaginatedOpts): any {
  let q = query.eq('lead_type', opts.leadType)
  if (opts.agencyId) q = q.eq('agency_id', opts.agencyId)
  if (opts.stageFilter === 'archived') {
    q = q.eq('status', 'archived')
  } else if (opts.stageFilter === 'active') {
    q = q.eq('status', 'active').not('stage', 'in', '("on_hold","lost","signed")')
  } else if (opts.stageFilter && opts.stageFilter !== 'all') {
    q = q.eq('status', 'active').eq('stage', opts.stageFilter)
  }
  // 'all': include archived — no status filter
  if (opts.serviceType && opts.serviceType !== 'all') q = q.eq('service_type', opts.serviceType)
  if (opts.source && opts.source !== 'all') q = q.eq('source', opts.source)
  if (opts.search?.trim()) {
    const term = opts.search.trim()
    q = q.or(`contact_first_name.ilike.%${term}%,contact_last_name.ilike.%${term}%,company_name.ilike.%${term}%,contact_email.ilike.%${term}%`)
  }
  return q
}

export async function getLeadsPaginated(supabase: SupabaseClient, opts: GetLeadsPaginatedOpts) {
  const page     = opts.page     ?? 0
  const pageSize = opts.pageSize ?? 50
  const from     = page * pageSize
  const to       = from + pageSize - 1

  const sortCol  = opts.sortKey === 'price' ? 'price'
                 : opts.sortKey === 'signed_date' ? 'signed_date'
                 : opts.sortKey === 'name' ? 'contact_last_name'
                 : opts.sortKey === 'company' ? 'company_name'
                 : opts.sortKey === 'stage' ? 'stage'
                 : opts.sortKey === 'source' ? 'source'
                 : 'created_at'
  const ascending = (opts.sortDir ?? 'desc') === 'asc'

  const dataQuery  = applyLeadFilters(supabase.from('leads').select(LEADS_SELECT).order(sortCol, { ascending }).range(from, to), opts)
  const countQuery = applyLeadFilters(supabase.from('leads').select('id', { count: 'exact', head: true }), opts)

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery])
  return {
    data:  (dataResult as { data: unknown[] | null }).data  ?? [],
    count: (countResult as { count: number | null }).count ?? 0,
    error: (dataResult as { error: unknown }).error ?? (countResult as { error: unknown }).error,
  }
}

/** Lightweight — returns only stage + status, used to compute tab counts. */
export async function getLeadStageCounts(
  supabase: SupabaseClient,
  opts: Pick<GetLeadsPaginatedOpts, 'leadType' | 'agencyId' | 'search' | 'serviceType' | 'source'>
) {
  let q: any = supabase.from('leads').select('stage, status').eq('lead_type', opts.leadType)
  if (opts.agencyId) q = q.eq('agency_id', opts.agencyId)
  if (opts.serviceType && opts.serviceType !== 'all') q = q.eq('service_type', opts.serviceType)
  if (opts.source && opts.source !== 'all') q = q.eq('source', opts.source)
  if (opts.search?.trim()) {
    const term = opts.search.trim()
    q = q.or(`contact_first_name.ilike.%${term}%,contact_last_name.ilike.%${term}%,company_name.ilike.%${term}%,contact_email.ilike.%${term}%`)
  }
  const { data } = await q
  const rows = (data ?? []) as { stage: string; status: string }[]
  const nonArchived = rows.filter(r => r.status !== 'archived')
  const TERMINAL = ['on_hold', 'lost', 'signed']
  const counts: Record<string, number> = {
    all:      nonArchived.length,
    active:   nonArchived.filter(r => !TERMINAL.includes(r.stage)).length,
    archived: rows.filter(r => r.status === 'archived').length,
  }
  for (const r of nonArchived) {
    counts[r.stage] = (counts[r.stage] ?? 0) + 1
  }
  return counts
}

/** Lightweight — returns distinct non-null sources, used to populate the source dropdown. */
export async function getLeadDistinctSources(
  supabase: SupabaseClient,
  opts: Pick<GetLeadsPaginatedOpts, 'leadType' | 'agencyId'>
) {
  let q: any = supabase.from('leads').select('source').eq('lead_type', opts.leadType).not('source', 'is', null)
  if (opts.agencyId) q = q.eq('agency_id', opts.agencyId)
  const { data } = await q
  const sources = Array.from(new Set((data ?? []).map((r: { source: string }) => r.source).filter(Boolean))) as string[]
  return sources.sort()
}

export async function getLeadById(supabase: SupabaseClient, leadId: string) {
  return supabase
    .from('leads')
    .select(`
      id,
      lead_type,
      agency_id,
      contact_first_name,
      contact_last_name,
      contact_email,
      contact_phone,
      company_name,
      service_type,
      stage,
      source,
      price,
      retainer_amount,
      retainer_paid_date,
      installments,
      installment_amount,
      signed_date,
      notes,
      converted_agency_id,
      converted_client_id,
      converted_at,
      status,
      created_at,
      updated_at,
      assigned_to,
      created_by,
      contact_address1,
      contact_address2,
      contact_city,
      contact_state,
      contact_zip,
      lead_owner_id,
      proposal_sent_date,
      service_states,
      lead_owner:user_profiles!leads_lead_owner_id_fkey(id, full_name),
      converted_agency:agencies!leads_converted_agency_id_fkey(id, name)
    `)
    .eq('id', leadId)
    .single()
}

export async function getLeadNotes(supabase: SupabaseClient, leadId: string) {
  return supabase
    .from('lead_notes')
    .select(`
      id,
      lead_id,
      author_id,
      content,
      note_type,
      created_at,
      author:user_profiles!lead_notes_author_id_fkey(full_name)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(200)
}

export async function getLeadTasks(supabase: SupabaseClient, leadId: string) {
  return supabase
    .from('lead_tasks')
    .select(`
      id,
      lead_id,
      created_by,
      assigned_to,
      title,
      due_date,
      completed_at,
      created_at,
      updated_at
    `)
    .eq('lead_id', leadId)
    .order('completed_at', { ascending: true, nullsFirst: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(200)
}

export async function getLeadDocuments(supabase: SupabaseClient, leadId: string) {
  return supabase
    .from('lead_documents')
    .select('id, lead_id, document_name, file_url, file_name, document_type, description, uploaded_by, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(200)
}

export async function insertLeadDocument(
  supabase: SupabaseClient,
  data: { lead_id: string; document_name: string; file_url: string; file_name?: string | null; document_type?: string | null; description?: string | null; uploaded_by: string }
) {
  return supabase.from('lead_documents').insert(data).select('id').single()
}

export async function deleteLeadDocument(supabase: SupabaseClient, docId: string) {
  return supabase.from('lead_documents').delete().eq('id', docId)
}

export async function getLeadsByAgency(supabase: SupabaseClient, agencyId: string) {
  return supabase
    .from('leads')
    .select(`
      id,
      contact_first_name,
      contact_last_name,
      company_name,
      service_type,
      stage,
      source,
      price,
      retainer_amount,
      installment_amount,
      signed_date,
      converted_at,
      created_at
    `)
    .eq('lead_type', 'agency')
    .eq('converted_agency_id', agencyId)
    .order('created_at', { ascending: false })
}

export async function getLeadDocumentsByLeadIds(supabase: SupabaseClient, leadIds: string[]) {
  if (leadIds.length === 0) return { data: [], error: null }
  return supabase
    .from('lead_documents')
    .select('id, lead_id, document_name, file_url, file_name, document_type, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })
}

export async function getLeadTaskStatusByLeadIds(
  supabase: SupabaseClient,
  leadIds: string[],
  today: string
) {
  if (leadIds.length === 0) return { data: [], error: null }
  return supabase
    .from('lead_tasks')
    .select('lead_id, due_date')
    .in('lead_id', leadIds)
    .is('completed_at', null)
    .lte('due_date', today)
}

export async function linkLeadToExistingAgency(supabase: SupabaseClient, leadId: string, agencyId: string) {
  return supabase
    .from('leads')
    .update({ converted_agency_id: agencyId, updated_at: new Date().toISOString() })
    .eq('id', leadId)
}

export async function unlinkLeadFromAgency(supabase: SupabaseClient, leadId: string) {
  return supabase
    .from('leads')
    .update({ converted_agency_id: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
}

export async function getLeadNotesByLeadIds(supabase: SupabaseClient, leadIds: string[]) {
  if (leadIds.length === 0) return { data: [], error: null }
  return supabase
    .from('lead_notes')
    .select(`
      id,
      lead_id,
      author_id,
      content,
      note_type,
      created_at,
      author:user_profiles!lead_notes_author_id_fkey(full_name)
    `)
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })
}
