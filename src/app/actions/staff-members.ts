'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import type { PatientDocument } from '@/lib/supabase/query/patients'

export async function updateStaffMemberDocumentsAction(
  staffMemberId: string,
  documents: PatientDocument[]
): Promise<{ error: string | null }> {
  const session = await getSession()
  if (!session) return { error: 'You must be logged in to update documents' }

  const { data, error } = await q.updateStaffMemberDocuments(staffMemberId, documents)
  if (error || !data) {
    return { error: error?.message ?? 'Update failed' }
  }

  const { error: auditErr } = await q.insertAuditLog({
    table_name: 'caregiver_members',
    record_id: staffMemberId,
    action: 'UPDATE',
    performed_by_user_id: session.user.id,
    details: { field: 'documents', staff_member_id: staffMemberId, document_count: documents.length },
  })
  if (auditErr) console.error('[staff-members/updateDocuments] Audit log failed. staffMemberId=%s err=%s', staffMemberId, auditErr.message)

  revalidatePath(`/pages/agency/caregiver/${staffMemberId}`)
  return { error: null }
}
