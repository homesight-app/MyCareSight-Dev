'use server'

import { unstable_cache, revalidateTag } from 'next/cache'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import { CACHE_TAG_PLAYBOOK_CATEGORIES } from '@/lib/cache-tags'

async function assertAdmin() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  if (session.profile?.role !== 'admin') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

// ── Cached read ───────────────────────────────────────────────────────────────

export const getPlaybookCategoriesWithSubs = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    const { data, error } = await q.getPlaybookCategoriesWithSubcategories(supabase)
    if (error) return { error: error.message, data: null }
    return { error: null, data }
  },
  ['playbook-categories-with-subs'],
  { tags: [CACHE_TAG_PLAYBOOK_CATEGORIES] }
)

// ── Admin CRUD: Categories ────────────────────────────────────────────────────

export async function createCategory(data: { name: string; description?: string }) {
  const { error: authErr, session } = await assertAdmin()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = await createClient()
  const { data: row, error } = await q.insertPlaybookCategory(supabase, {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    created_by: session.user.id,
  })
  if (error) return { error: error.message, data: null }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null, data: row }
}

export async function updateCategory(
  id: string,
  data: { name?: string; description?: string | null; is_active?: boolean; sort_order?: number }
) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const payload: Parameters<typeof q.updatePlaybookCategory>[2] = {}
  if (data.name !== undefined) payload.name = data.name.trim()
  if (data.description !== undefined) payload.description = data.description?.trim() || null
  if (data.is_active !== undefined) payload.is_active = data.is_active
  if (data.sort_order !== undefined) payload.sort_order = data.sort_order

  const { error } = await q.updatePlaybookCategory(supabase, id, payload)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null }
}

export async function deleteCategory(id: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const counts = await q.getCategoryReferenceCount(supabase, id)

  if (counts.subcategoryCount > 0) {
    const n = counts.subcategoryCount
    return { error: `Delete the ${n} subcategor${n === 1 ? 'y' : 'ies'} first.` }
  }

  const usageParts: string[] = []
  if (counts.playbookCount)    usageParts.push(`${counts.playbookCount} playbook${counts.playbookCount === 1 ? '' : 's'}`)
  if (counts.applicationCount) usageParts.push(`${counts.applicationCount} program${counts.applicationCount === 1 ? '' : 's'}`)
  if (counts.licenseCount)     usageParts.push(`${counts.licenseCount} certification${counts.licenseCount === 1 ? '' : 's'}`)

  if (usageParts.length > 0) {
    return { error: `This category is used by ${usageParts.join(', ')}. Remove those references first.` }
  }

  const { error } = await q.deletePlaybookCategory(supabase, id)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null }
}

// ── Admin CRUD: Subcategories ─────────────────────────────────────────────────

export async function createSubcategory(data: {
  category_id: string
  name: string
  description?: string
}) {
  const { error: authErr, session } = await assertAdmin()
  if (authErr || !session) return { error: authErr ?? 'Forbidden', data: null }

  const supabase = await createClient()
  const { data: row, error } = await q.insertPlaybookSubcategory(supabase, {
    category_id: data.category_id,
    name: data.name.trim(),
    description: data.description?.trim() || null,
    created_by: session.user.id,
  })
  if (error) return { error: error.message, data: null }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null, data: row }
}

export async function updateSubcategory(
  id: string,
  data: { name?: string; description?: string | null; is_active?: boolean; sort_order?: number }
) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const payload: Parameters<typeof q.updatePlaybookSubcategory>[2] = {}
  if (data.name !== undefined) payload.name = data.name.trim()
  if (data.description !== undefined) payload.description = data.description?.trim() || null
  if (data.is_active !== undefined) payload.is_active = data.is_active
  if (data.sort_order !== undefined) payload.sort_order = data.sort_order

  const { error } = await q.updatePlaybookSubcategory(supabase, id, payload)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null }
}

export async function deleteSubcategory(id: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const counts = await q.getSubcategoryReferenceCount(supabase, id)

  const usageParts: string[] = []
  if (counts.playbookCount)    usageParts.push(`${counts.playbookCount} playbook${counts.playbookCount === 1 ? '' : 's'}`)
  if (counts.applicationCount) usageParts.push(`${counts.applicationCount} program${counts.applicationCount === 1 ? '' : 's'}`)
  if (counts.licenseCount)     usageParts.push(`${counts.licenseCount} certification${counts.licenseCount === 1 ? '' : 's'}`)

  if (usageParts.length > 0) {
    return { error: `This subcategory is used by ${usageParts.join(', ')}. Remove those references first.` }
  }

  const { error } = await q.deletePlaybookSubcategory(supabase, id)
  if (error) return { error: error.message }

  revalidateTag(CACHE_TAG_PLAYBOOK_CATEGORIES)
  return { error: null }
}
