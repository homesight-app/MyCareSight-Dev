'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'

function revalidateTemplatePaths() {
  revalidatePath('/pages/admin/templates')
  revalidatePath('/pages/agency/templates')
}

async function requirePlatformStaff() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

async function requireAuthenticated() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  return { error: null, session }
}

function extractVariables(html: string): string[] {
  const matches = [...html.matchAll(/data-key="([^"]+)"/g)]
  return [...new Set(matches.map(m => m[1]))]
}

// ——— Create ————————————————————————————————————————————————————

export async function createTemplate(payload: {
  name: string
  type: 'document' | 'email'
  category: string
  description?: string
  subject?: string
  content: string
  isGlobal?: boolean
  agencyId?: string
}) {
  const { error: authErr, session } = await requireAuthenticated()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const role = session.profile?.role
  const isPlatformStaff = role === 'admin' || role === 'expert'

  // Only platform staff can create global templates
  if (payload.isGlobal && !isPlatformStaff) {
    return { error: 'Forbidden' }
  }

  // Agency users must provide an agencyId
  if (!isPlatformStaff && !payload.agencyId) {
    return { error: 'Agency ID required' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: payload.name.trim(),
      type: payload.type,
      category: payload.category,
      description: payload.description?.trim() || null,
      subject: payload.type === 'email' ? (payload.subject?.trim() || null) : null,
      content: payload.content,
      variables_used: extractVariables(payload.content),
      is_global: isPlatformStaff ? (payload.isGlobal ?? false) : false,
      agency_id: payload.isGlobal ? null : (payload.agencyId ?? null),
      created_by: session.user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidateTemplatePaths()
  return { error: null, templateId: data.id }
}

// ——— Update ————————————————————————————————————————————————————

export async function updateTemplate(
  templateId: string,
  payload: {
    name?: string
    type?: 'document' | 'email'
    category?: string
    description?: string | null
    subject?: string | null
    content?: string
    isGlobal?: boolean
    isActive?: boolean
  }
) {
  const { error: authErr, session } = await requireAuthenticated()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const role = session.profile?.role
  const isPlatformStaff = role === 'admin' || role === 'expert'

  if (payload.isGlobal !== undefined && !isPlatformStaff) {
    return { error: 'Forbidden' }
  }

  const supabase = await createClient()

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (payload.name !== undefined)        updates.name = payload.name.trim()
  if (payload.type !== undefined)        updates.type = payload.type
  if (payload.category !== undefined)    updates.category = payload.category
  if (payload.description !== undefined) updates.description = payload.description?.trim() || null
  if (payload.subject !== undefined)     updates.subject = payload.subject?.trim() || null
  if (payload.isGlobal !== undefined)    updates.is_global = payload.isGlobal
  if (payload.isActive !== undefined)    updates.is_active = payload.isActive
  if (payload.content !== undefined) {
    updates.content = payload.content
    updates.variables_used = extractVariables(payload.content)
  }

  const { error } = await supabase
    .from('templates')
    .update(updates)
    .eq('id', templateId)

  if (error) return { error: error.message }
  revalidateTemplatePaths()
  revalidatePath(`/pages/admin/templates/${templateId}`)
  revalidatePath(`/pages/agency/templates/${templateId}`)
  return { error: null }
}

// ——— Toggle active ——————————————————————————————————————————————

export async function toggleTemplateActive(templateId: string, isActive: boolean) {
  return updateTemplate(templateId, { isActive })
}

// ——— Delete ————————————————————————————————————————————————————

export async function deleteTemplate(templateId: string) {
  const { error: authErr, session } = await requireAuthenticated()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId)

  if (error) return { error: error.message }
  revalidateTemplatePaths()
  return { error: null }
}

// ——— Duplicate (copy global template to agency) ————————————————

export async function duplicateTemplate(templateId: string, agencyId: string) {
  const { error: authErr, session } = await requireAuthenticated()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const supabase = await createClient()

  const { data: source, error: fetchErr } = await supabase
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (fetchErr || !source) return { error: 'Template not found' }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: `${source.name} (Copy)`,
      type: source.type,
      category: source.category,
      description: source.description,
      subject: source.subject,
      content: source.content,
      variables_used: source.variables_used,
      is_global: false,
      agency_id: agencyId,
      created_by: session.user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidateTemplatePaths()
  return { error: null, templateId: data.id }
}
