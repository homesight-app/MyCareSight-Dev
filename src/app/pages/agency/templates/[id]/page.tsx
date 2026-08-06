import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getTemplateById } from '@/lib/supabase/query'
import TemplateDetailContent from '@/components/TemplateDetailContent'

export default async function AgencyEditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const { id } = await params
  const supabase = await createClient()

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  if (!agencyId) redirect('/pages/agency')

  const { data: template } = await getTemplateById(supabase, id)

  if (!template) notFound()

  // Prevent editing global templates from agency context
  if (template.is_global) redirect('/pages/agency/templates')

  return (
    <div className="p-4 sm:p-6">
      <TemplateDetailContent
        template={template}
        isAdmin={false}
        agencyId={agencyId}
        listPath="/pages/agency/templates"
      />
    </div>
  )
}
