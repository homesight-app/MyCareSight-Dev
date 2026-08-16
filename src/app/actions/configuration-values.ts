'use server'

import { unstable_cache, revalidateTag } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { CACHE_TAG_CONFIGURATION_VALUES } from '@/lib/cache-tags'

async function assertAdmin() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

// ── Cached read ───────────────────────────────────────────────────────────────

const _getConfigurationValues = unstable_cache(
  async (typeCode: string) => {
    const supabase = createAdminClient()
    const { data, error } = await q.getConfigurationValuesWithSubcategories(supabase, typeCode)
    if (error) return { error: error.message, data: null }
    return { error: null, data }
  },
  ['configuration-values'],
  { tags: [CACHE_TAG_CONFIGURATION_VALUES] }
)

export async function getConfigurationValues(typeCode: string) {
  return _getConfigurationValues(typeCode)
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

export async function createConfigurationValue(data: {
  type_code: string
  parent_id?: string
  name: string
  description?: string
}) {
  const { error: authErr, session } = await assertAdmin()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = await createClient()

  const typeResult = await supabase
    .from('configuration_types')
    .select('id')
    .eq('code', data.type_code)
    .single()

  if (typeResult.error || !typeResult.data) {
    return { error: `Configuration type '${data.type_code}' not found`, data: null }
  }

  const { data: row, error } = await q.insertConfigurationValue(supabase, {
    type_id:     typeResult.data.id,
    parent_id:   data.parent_id ?? null,
    name:        data.name.trim(),
    description: data.description?.trim() || null,
    created_by:  session.user.id,
  })
  if (error) return { error: error.message, data: null }

  revalidateTag(CACHE_TAG_CONFIGURATION_VALUES)
  return { error: null, data: row }
}

export async function updateConfigurationValue(
  id: string,
  data: Partial<{ name: string; description: string | null; is_active: boolean; sort_order: number }>
) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const payload: Parameters<typeof q.updateConfigurationValue>[2] = {}
  if (data.name !== undefined)        payload.name = data.name.trim()
  if (data.description !== undefined) payload.description = data.description?.trim() || null
  if (data.is_active !== undefined)   payload.is_active = data.is_active
  if (data.sort_order !== undefined)  payload.sort_order = data.sort_order

  const { error } = await q.updateConfigurationValue(supabase, id, payload)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_CONFIGURATION_VALUES)
  return { error: null }
}

export async function deleteConfigurationValue(id: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const counts = await q.getConfigurationValueReferenceCount(supabase, id)

  if (counts.childCount > 0) {
    const n = counts.childCount
    return { error: `Delete the ${n} subcategor${n === 1 ? 'y' : 'ies'} first.` }
  }

  const usageParts: string[] = []
  if (counts.playbookCount)    usageParts.push(`${counts.playbookCount} playbook${counts.playbookCount === 1 ? '' : 's'}`)
  if (counts.applicationCount) usageParts.push(`${counts.applicationCount} program${counts.applicationCount === 1 ? '' : 's'}`)
  if (counts.licenseCount)     usageParts.push(`${counts.licenseCount} certification${counts.licenseCount === 1 ? '' : 's'}`)

  if (usageParts.length > 0) {
    return { error: `This value is used by ${usageParts.join(', ')}. Remove those references first.` }
  }

  const { error } = await q.deleteConfigurationValue(supabase, id)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_CONFIGURATION_VALUES)
  return { error: null }
}
