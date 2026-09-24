'use server'

import sql from '@/db'
import { revalidatePath } from 'next/cache'
import * as q from '@/lib/supabase/query'
import { hashPassword } from '@/lib/auth/password'
import { randomUUID } from 'crypto'
import { sendInvitationEmail } from '@/lib/email'

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
  try {
    const normalizedEmail = data.email.toLowerCase().trim()
    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim()
    const expertRole = data.role || 'Licensing Specialist'
    const expertStatus = data.status || 'active'

    const [existingProfile] = await sql<{ id: string }[]>`
      SELECT id FROM user_profiles WHERE email = ${normalizedEmail} LIMIT 1
    `

    let userId: string
    if (existingProfile?.id) {
      userId = existingProfile.id
      await sql`
        UPDATE user_profiles
        SET full_name = ${fullName}, role = 'expert', updated_at = now()
        WHERE id = ${userId}
      `
    } else {
      const passwordHash = await hashPassword(data.password)
      userId = randomUUID()
      await sql`
        INSERT INTO user_profiles (id, email, full_name, role, password_hash, is_active, created_at, updated_at)
        VALUES (${userId}, ${normalizedEmail}, ${fullName}, 'expert', ${passwordHash}, true, now(), now())
      `
      sendInvitationEmail(normalizedEmail, fullName, data.password).catch(err =>
        console.error('[createExpert] sendInvitationEmail failed:', err)
      )
    }

    const { data: existingExpert } = await q.getLicensingExpertByUserId(userId)
    if (existingExpert?.id) {
      const { error: expertUpdateError } = await q.updateLicensingExpertById(existingExpert.id, {
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
      await sql`INSERT INTO licensing_experts ${sql({
        user_id: userId,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: normalizedEmail,
        phone: data.phone || null,
        expertise: data.expertise || null,
        role: expertRole,
        status: expertStatus,
      })}`
    }

    const { data: refreshedExpert, error: refreshedExpertError } = await q.getLicensingExpertByUserId(userId)

    if (refreshedExpertError || !refreshedExpert?.id) {
      return { error: null, data: { user_id: userId } }
    }

    const { data: expert } = await q.getLicensingExpertById(refreshedExpert.id)

    revalidatePath('/pages/admin/users')
    revalidatePath('/pages/admin/experts')
    return { error: null, data: expert || refreshedExpert }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create expert', data: null }
  }
}
