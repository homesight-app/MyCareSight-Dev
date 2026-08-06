import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getTemplates } from '@/lib/supabase/query'
import TemplatesContent from '@/components/TemplatesContent'

export default async function AgencyTemplatesPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { data: templates } = await getTemplates(supabase, { agencyId, includeInactive: true })

  return (
    <div className="p-4 sm:p-6">
      <TemplatesContent
        templates={templates ?? []}
        isAdmin={false}
        agencyId={agencyId}
        basePath="/pages/agency/templates"
      />
    </div>
  )
}
