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
      contact_zip
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

  return query
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
}
