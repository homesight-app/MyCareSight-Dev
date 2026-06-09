'use server'

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
