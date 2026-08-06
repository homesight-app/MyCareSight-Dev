import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertApplicationDetailWrapper from '@/components/ExpertApplicationDetailWrapper'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function ExpertApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const session = await getSession()

  const { id } = await params
  const { back } = await searchParams

  // Validate back path to prevent open redirect — must start with /pages/
  const backHref = back && decodeURIComponent(back).startsWith('/pages/')
    ? decodeURIComponent(back)
    : '/pages/expert/clients'
  const backLabel = back ? 'Back to Agency' : 'Back to Licenses'

  const supabase = await createClient()
  const { data: application } = await q.getApplicationById(supabase, id)
  if (!application) redirect('/pages/expert/clients')
  const [
    { data: documents },
    { data: agencyData },
  ] = await Promise.all([
    q.getApplicationDocumentsByApplicationId(supabase, id),
    (application as any).agency_id
      ? q.getAgencyNameById(supabase, (application as any).agency_id)
      : Promise.resolve({ data: null }),
  ])

  return (
    <div className="space-y-6 mt-[6rem]">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>
      <ExpertApplicationDetailWrapper
        application={application}
        documents={documents ?? []}
        agencyName={(agencyData as any)?.name ?? null}
      />
    </div>
  )
}
