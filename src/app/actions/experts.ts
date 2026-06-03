'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'

export interface CreateExpertData {
  firstName: string
  lastName: string
  email: string
  phone?: string
  password: string
  expertise?: string
  role?: string
  status?: 'active' | 'inactive'
}

export async function createExpert(data: CreateExpertData) {
  let supabaseAdmin
  try {
    supabaseAdmin = createAdminClient()
  } catch (e: any) {
    return {
      error:
        e?.message ||
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to environment for admin user creation.',
      data: null,
    }
  }

  try {
    const normalizedEmail = data.email.toLowerCase().trim()
    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim()
    const expertRole = data.role || 'Licensing Specialist'
    const expertStatus = data.status || 'active'

    // Use Supabase Admin API (same model as working Users tab) to avoid direct auth.users schema coupling.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'expert',
        temporary_password: data.password,
      },
    })

    let userId = created?.user?.id ?? null

    if (createError) {
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already exists') ||
        createError.message.includes('User already registered')
      ) {
        const { data: profileByEmail } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle()
        userId = profileByEmail?.id ?? null
        if (!userId) {
          return { error: 'User already exists but profile was not found.', data: null }
        }
      } else {
        return { error: createError.message, data: null }
      }
    }

    if (!userId) {
      return { error: 'Failed to create expert user account.', data: null }
    }

    // Ensure profile has expert role/name in case existing account path was used.
    await supabaseAdmin
      .from('user_profiles')
      .upsert(
        {
          id: userId,
          email: normalizedEmail,
          full_name: fullName,
          role: 'expert',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )

    // Ensure licensing_experts row exists and is updated with modal fields.
    const { data: existingExpert } = await q.getLicensingExpertByUserId(supabaseAdmin, userId)
    if (existingExpert?.id) {
      const { error: expertUpdateError } = await q.updateLicensingExpertById(supabaseAdmin, existingExpert.id, {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: normalizedEmail,
        phone: data.phone || null,
        expertise: data.expertise || null,
        role: expertRole,
        status: expertStatus,
        updated_at: new Date().toISOString(),
      })
      if (expertUpdateError) {
        return { error: `Failed to update expert record: ${expertUpdateError.message}`, data: null }
      }
    } else {
      const { error: expertInsertError } = await supabaseAdmin.from('licensing_experts').insert({
        user_id: userId,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: normalizedEmail,
        phone: data.phone || null,
        expertise: data.expertise || null,
        role: expertRole,
        status: expertStatus,
      })
      if (expertInsertError) {
        return { error: `Failed to create expert record: ${expertInsertError.message}`, data: null }
      }
    }

    const { data: refreshedExpert, error: refreshedExpertError } = await q.getLicensingExpertByUserId(
      supabaseAdmin,
      userId
    )

    if (refreshedExpertError || !refreshedExpert?.id) {
      return { error: null, data: { user_id: userId } }
    }

    const { data: expert } = await q.getLicensingExpertById(supabaseAdmin, refreshedExpert.id)

    revalidatePath('/pages/admin/users')
    revalidatePath('/pages/admin/experts')
    return { error: null, data: expert || refreshedExpert }
  } catch (err: any) {
    return { error: err.message || 'Failed to create expert', data: null }
  }
}
