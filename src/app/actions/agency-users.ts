'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

function revalidateAgencyDetailPages(agencyId: string) {
  revalidatePath(`/pages/admin/agencies/${agencyId}`)
  revalidatePath(`/pages/expert/agencies/${agencyId}`)
}

async function requirePlatformStaff() {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', session: null }
  const role = session.profile?.role
  if (role !== 'admin' && role !== 'expert') return { error: 'Forbidden', session: null }
  return { error: null, session }
}

// Polls for the user_profiles row created by DB trigger after auth user insert.
async function waitForProfile(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500))
    const { data } = await supabaseAdmin.from('user_profiles').select('id').eq('id', userId).single()
    if (data) return true
  }
  return false
}

// Shared creation flow: auth user + profile update + role-table insert.
// On any failure after auth user creation, rolls back by deleting the auth user.
async function createUserForAgency(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  agencyId: string,
  role: 'company_owner' | 'care_coordinator' | 'staff_member',
  opts: { firstName: string; lastName: string; email: string; phone?: string }
): Promise<{ userId: string; error?: never } | { error: string; userId?: never }> {
  const normalizedEmail = opts.email.toLowerCase().trim()
  const fullName = `${opts.firstName} ${opts.lastName}`

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: randomBytes(16).toString('hex'),
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (authError) return { error: authError.message }

  const userId = authData.user.id

  const profileAppeared = await waitForProfile(supabaseAdmin, userId)
  if (!profileAppeared) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { error: 'User profile did not initialize in time. Please try again.' }
  }

  await supabaseAdmin
    .from('user_profiles')
    .update({ full_name: fullName, role, agency_id: agencyId, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (role === 'care_coordinator') {
    const { error: roleErr } = await supabaseAdmin.from('care_coordinators').insert({
      user_id: userId,
      agency_id: agencyId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: normalizedEmail,
      status: 'active',
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create coordinator record: ${roleErr.message}` }
    }
  } else if (role === 'staff_member') {
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('agency_admin_ids')
      .eq('id', agencyId)
      .single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    const { error: roleErr } = await supabaseAdmin.from('caregiver_members').insert({
      user_id: userId,
      company_owner_id: adminIds[0] ?? null,
      agency_id: agencyId,
      first_name: opts.firstName,
      last_name: opts.lastName,
      email: normalizedEmail,
      role: 'Caregiver',
      status: 'active',
      documents: {},
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create caregiver record: ${roleErr.message}` }
    }
  } else if (role === 'company_owner') {
    const { error: roleErr } = await supabaseAdmin.from('agency_admins').insert({
      user_id: userId,
      company_owner_id: userId,
      contact_name: fullName,
      contact_email: normalizedEmail,
      contact_phone: opts.phone ?? null,
      status: 'active',
      agency_id: agencyId,
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { error: `Failed to create admin record: ${roleErr.message}` }
    }
    // Link to agency.agency_admin_ids
    const { data: agency } = await supabaseAdmin
      .from('agencies')
      .select('agency_admin_ids')
      .eq('id', agencyId)
      .single()
    const adminIds = (agency?.agency_admin_ids as string[] | null) ?? []
    await supabaseAdmin
      .from('agencies')
      .update({ agency_admin_ids: [...adminIds, userId], updated_at: new Date().toISOString() })
      .eq('id', agencyId)
  }

  return { userId }
}

// ——— Status toggles ——————————————————————————————————————

export async function updateAgencyAdminStatus(
  agencyId: string,
  adminId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agency_admins')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', adminId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }
  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCaregiverStatus(
  agencyId: string,
  caregiverId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('caregiver_members')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }
  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCareCoordinatorStatus(
  agencyId: string,
  coordinatorId: string,
  status: 'active' | 'inactive'
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('care_coordinators')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }
  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

// ——— Create new users ————————————————————————————————————

export async function addCaregiverForAgency(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'staff_member', opts)
  if ('error' in result) return { error: result.error }

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function addCareCoordinatorForAgency(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'care_coordinator', opts)
  if ('error' in result) return { error: result.error }

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function createAndLinkAgencyAdmin(
  agencyId: string,
  opts: { firstName: string; lastName: string; email: string; phone?: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()
  const result = await createUserForAgency(supabaseAdmin, agencyId, 'company_owner', opts)
  if ('error' in result) return { error: result.error }

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

// ——— Edit existing users ————————————————————————————————

export async function updateCaregiverProfile(
  agencyId: string,
  caregiverId: string,
  updates: { first_name: string; last_name: string; phone?: string; job_title?: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()

  const { data: cg, error: fetchErr } = await supabaseAdmin
    .from('caregiver_members')
    .select('user_id')
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)
    .single()
  if (fetchErr || !cg) return { error: 'Caregiver not found' }

  const { error: updateErr } = await supabaseAdmin
    .from('caregiver_members')
    .update({
      first_name: updates.first_name,
      last_name: updates.last_name,
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.job_title !== undefined && { job_title: updates.job_title }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', caregiverId)
    .eq('agency_id', agencyId)
  if (updateErr) return { error: updateErr.message }

  if (cg.user_id) {
    await supabaseAdmin
      .from('user_profiles')
      .update({ full_name: `${updates.first_name} ${updates.last_name}`, updated_at: new Date().toISOString() })
      .eq('id', cg.user_id)
  }

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateCareCoordinatorProfile(
  agencyId: string,
  coordinatorId: string,
  updates: { first_name: string; last_name: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()

  const { data: cc, error: fetchErr } = await supabaseAdmin
    .from('care_coordinators')
    .select('user_id')
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)
    .single()
  if (fetchErr || !cc) return { error: 'Coordinator not found' }

  const { error: updateErr } = await supabaseAdmin
    .from('care_coordinators')
    .update({
      first_name: updates.first_name,
      last_name: updates.last_name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', coordinatorId)
    .eq('agency_id', agencyId)
  if (updateErr) return { error: updateErr.message }

  await supabaseAdmin
    .from('user_profiles')
    .update({ full_name: `${updates.first_name} ${updates.last_name}`, updated_at: new Date().toISOString() })
    .eq('id', cc.user_id)

  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}

export async function updateAgencyAdminProfile(
  agencyId: string,
  adminId: string,
  updates: { contact_name: string; contact_phone?: string }
) {
  const { error: authErr } = await requirePlatformStaff()
  if (authErr) return { error: authErr }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('agency_admins')
    .update({
      contact_name: updates.contact_name,
      ...(updates.contact_phone !== undefined && { contact_phone: updates.contact_phone }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId)
    .eq('agency_id', agencyId)

  if (error) return { error: error.message }
  revalidateAgencyDetailPages(agencyId)
  return { error: null }
}
