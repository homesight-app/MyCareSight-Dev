import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import CaregiverVisitExecutionContent from '@/components/CaregiverVisitExecutionContent'
import { getCachedCaregiverVisitExecutionDetail } from '@/lib/server-cache/caregiver-visit-execution-detail'

type PageProps = {
  params: Promise<{ visitId: string }>
}

export default async function CaregiverVisitExecutionPage({ params }: PageProps) {
  const { visitId } = await params
  if (!visitId || visitId === 'null') notFound()

  const session = await getSession()

  const supabase = await createClient()
  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(supabase, session!.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const { data, error } = await getCachedCaregiverVisitExecutionDetail(
    visitId,
    staffMember.id,
    staffMember.agency_id ?? null,
    session!.user.id
  )

  if (error || !data) notFound()

  return <CaregiverVisitExecutionContent initial={data} />
}
