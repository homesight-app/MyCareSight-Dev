import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ApplicationsContent from '@/components/ApplicationsContent'

export default async function ApplicationsPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const { data: applicationsData } = agencyId
    ? await q.getApplicationsByAgencyId(supabase, agencyId)
    : { data: [] }
  const applications = applicationsData ?? []

  const appIds = applications.map((a: { id: string }) => a.id)
  const { data: docRows } = appIds.length > 0
    ? await q.getApplicationDocumentsApplicationIds(supabase, appIds)
    : { data: [] }
  const documentCounts = (docRows || []).reduce((acc: Record<string, number>, doc: { application_id: string }) => {
    acc[doc.application_id] = (acc[doc.application_id] || 0) + 1
    return acc
  }, {})

  return (
    <ApplicationsContent
      applications={applications || []}
      documentCounts={documentCounts}
    />
  )
}

