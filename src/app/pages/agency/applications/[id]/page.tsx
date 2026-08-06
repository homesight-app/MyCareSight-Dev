import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ApplicationDetailWrapper from '@/components/ApplicationDetailWrapper'

export default async function ApplicationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  const { id } = await params
  const supabase = await createClient()

  const { data: application } = await q.getApplicationById(supabase, id)

  if (!application) redirect('/pages/agency/licenses')

  const { data: documents } = await q.getApplicationDocumentsByApplicationId(supabase, id)

  return (
    <ApplicationDetailWrapper
      application={application}
      documents={documents || []}
    />
  )
}
