'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'

export async function updateStaffMemberDocumentsAction(
  staffMemberId: string,
  documents: PatientDocument[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in to update documents' }
  }

  const { data, error } = await q.updateStaffMemberDocuments(supabase, staffMemberId, documents)
  if (error || !data) {
    return { error: error?.message ?? 'Update failed' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    table_name: 'caregiver_members',
    record_id: staffMemberId,
    action: 'UPDATE',
    performed_by_user_id: user.id,
    details: { field: 'documents', staff_member_id: staffMemberId, document_count: documents.length },
  })
  if (auditErr) console.error('[staff-members/updateDocuments] Audit log failed. staffMemberId=%s err=%s', staffMemberId, auditErr.message)

  revalidatePath(`/pages/agency/caregiver/${staffMemberId}`)
  return { error: null }
}
