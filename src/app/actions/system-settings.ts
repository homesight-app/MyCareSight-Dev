'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSystemSettingsByCategory, upsertSystemSetting } from '@/lib/supabase/query/system-settings'
import { STORAGE_BUCKET } from '@/lib/supabase/storage'
import { hexDarken, hexLighten } from '@/lib/color-utils'
// Note: buildBrandingStyleVars lives in src/lib/color-utils.ts (not in this 'use server' file)

export interface SystemBranding {
  logoUrl: string | null
  logoIconUrl: string | null
  primaryColor: string | null
  sidebarColor: string | null
}

function buildPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET.AGENCY_PUBLIC}/${path}`
}

export async function getSystemBranding(): Promise<SystemBranding> {
  const supabase = await createClient()
  const settings = await getSystemSettingsByCategory(supabase, 'branding')
  return {
    logoUrl: buildPublicUrl(settings.platform_logo_path),
    logoIconUrl: buildPublicUrl(settings.platform_logo_icon_path),
    primaryColor: settings.platform_primary_color ?? null,
    sidebarColor: settings.platform_sidebar_color ?? null,
  }
}

export async function updateSystemBranding(payload: {
  primaryColor: string
  sidebarColor: string
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const adminSupabase = createAdminClient()
  await upsertSystemSetting(adminSupabase, 'branding', 'platform_primary_color', payload.primaryColor, user.id)
  await upsertSystemSetting(adminSupabase, 'branding', 'platform_sidebar_color', payload.sidebarColor, user.id)
  revalidatePath('/', 'layout')
  return { success: true, error: null }
}

export async function uploadPlatformLogo(
  formData: FormData,
  variant: 'full' | 'icon'
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'Unauthorized' }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { url: null, error: 'No file provided' }
  if (!file.type.startsWith('image/')) return { url: null, error: 'File must be an image' }
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'File must be under 5MB' }

  const settingKey = variant === 'full' ? 'platform_logo_path' : 'platform_logo_icon_path'
  const pathPrefix = variant === 'full' ? 'platform/logo' : 'platform/logo-icon'

  const adminSupabase = createAdminClient()
  const settings = await getSystemSettingsByCategory(adminSupabase, 'branding')
  if (settings[settingKey]) {
    await adminSupabase.storage.from(STORAGE_BUCKET.AGENCY_PUBLIC).remove([settings[settingKey]!])
  }

  const ext = file.name.split('.').pop() || 'png'
  const path = `${pathPrefix}.${ext}`

  const { error: uploadError } = await adminSupabase.storage
    .from(STORAGE_BUCKET.AGENCY_PUBLIC)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { url: null, error: uploadError.message }

  await upsertSystemSetting(adminSupabase, 'branding', settingKey, path, user.id)
  revalidatePath('/', 'layout')

  const url = buildPublicUrl(path)
  return { url, error: null }
}

export async function resetSystemBranding(): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const adminSupabase = createAdminClient()
  const settings = await getSystemSettingsByCategory(adminSupabase, 'branding')

  const pathsToRemove = [settings.platform_logo_path, settings.platform_logo_icon_path].filter(Boolean) as string[]
  if (pathsToRemove.length > 0) {
    await adminSupabase.storage.from(STORAGE_BUCKET.AGENCY_PUBLIC).remove(pathsToRemove)
  }

  await upsertSystemSetting(adminSupabase, 'branding', 'platform_logo_path', null, user.id)
  await upsertSystemSetting(adminSupabase, 'branding', 'platform_logo_icon_path', null, user.id)
  await upsertSystemSetting(adminSupabase, 'branding', 'platform_primary_color', '#4F66E8', user.id)
  await upsertSystemSetting(adminSupabase, 'branding', 'platform_sidebar_color', '#0F172A', user.id)

  revalidatePath('/', 'layout')
  return { success: true, error: null }
}
