'use server'

import { revalidatePath } from 'next/cache'
import sql from '@/db'
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

  if (payload.isGlobal && !isPlatformStaff) return { error: 'Forbidden' }
  if (!isPlatformStaff && !payload.agencyId) return { error: 'Agency ID required' }

  const variables = extractVariables(payload.content)
  const isGlobal = isPlatformStaff ? (payload.isGlobal ?? false) : false
  const agencyId = isGlobal ? null : (payload.agencyId ?? null)
  const subject = payload.type === 'email' ? (payload.subject?.trim() || null) : null

  try {
    const [data] = await sql<{ id: string }[]>`
      INSERT INTO templates (name, type, category, description, subject, content, variables_used, is_global, agency_id, created_by)
      VALUES (
        ${payload.name.trim()}, ${payload.type}, ${payload.category},
        ${payload.description?.trim() || null}, ${subject}, ${payload.content},
        ${variables}, ${isGlobal}, ${agencyId}, ${session.user.id}
      )
      RETURNING id
    `
    if (!data) return { error: 'Insert failed' }
    revalidateTemplatePaths()
    return { error: null, templateId: data.id }
  } catch (err: any) {
    return { error: err.message || 'Failed to create template' }
  }
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
  if (payload.isGlobal !== undefined && !isPlatformStaff) return { error: 'Forbidden' }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
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

  try {
    await sql`UPDATE templates SET ${sql(updates)} WHERE id = ${templateId}`
  } catch (err: any) {
    return { error: err.message || 'Failed to update template' }
  }

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
  const { error: authErr } = await requireAuthenticated()
  if (authErr) return { error: authErr ?? 'Forbidden' }

  try {
    await sql`DELETE FROM templates WHERE id = ${templateId}`
  } catch (err: any) {
    return { error: err.message || 'Failed to delete template' }
  }

  revalidateTemplatePaths()
  return { error: null }
}

// ——— Duplicate (copy global template to agency) ————————————————

export async function duplicateTemplate(templateId: string, agencyId: string) {
  const { error: authErr, session } = await requireAuthenticated()
  if (authErr || !session) return { error: authErr ?? 'Forbidden' }

  const [source] = await sql<{
    name: string
    type: string
    category: string
    description: string | null
    subject: string | null
    content: string
    variables_used: string[]
  }[]>`
    SELECT name, type, category, description, subject, content, variables_used
    FROM templates WHERE id = ${templateId} LIMIT 1
  `
  if (!source) return { error: 'Template not found' }

  try {
    const [data] = await sql<{ id: string }[]>`
      INSERT INTO templates (name, type, category, description, subject, content, variables_used, is_global, agency_id, created_by)
      VALUES (
        ${`${source.name} (Copy)`}, ${source.type}, ${source.category},
        ${source.description}, ${source.subject}, ${source.content},
        ${source.variables_used}, false, ${agencyId}, ${session.user.id}
      )
      RETURNING id
    `
    if (!data) return { error: 'Insert failed' }
    revalidateTemplatePaths()
    return { error: null, templateId: data.id }
  } catch (err: any) {
    return { error: err.message || 'Failed to duplicate template' }
  }
}
