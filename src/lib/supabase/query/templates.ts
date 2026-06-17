import type { SupabaseClient } from '@supabase/supabase-js'

export async function getTemplates(
  supabase: SupabaseClient,
  opts: {
    type?: 'document' | 'email'
    category?: string
    agencyId?: string
    search?: string
    includeInactive?: boolean
  } = {}
) {
  let query = supabase
    .from('templates')
    .select(`
      id,
      name,
      type,
      category,
      description,
      subject,
      variables_used,
      is_global,
      agency_id,
      created_by,
      is_active,
      created_at,
      updated_at,
      agency:agencies!templates_agency_id_fkey(id, name)
    `)
    .order('is_global', { ascending: false })
    .order('created_at', { ascending: false })

  if (!opts.includeInactive) {
    query = query.eq('is_active', true)
  }

  if (opts.type) {
    query = query.eq('type', opts.type)
  }

  if (opts.category) {
    query = query.eq('category', opts.category)
  }

  if (opts.agencyId) {
    query = query.or(`is_global.eq.true,agency_id.eq.${opts.agencyId}`)
  }

  if (opts.search) {
    query = query.ilike('name', `%${opts.search.trim()}%`)
  }

  return query
}

export async function getTemplateById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('templates')
    .select(`
      id,
      name,
      type,
      category,
      description,
      subject,
      content,
      variables_used,
      is_global,
      agency_id,
      created_by,
      is_active,
      created_at,
      updated_at
    `)
    .eq('id', id)
    .single()
}
