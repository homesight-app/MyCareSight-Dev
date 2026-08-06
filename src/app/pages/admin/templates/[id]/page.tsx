import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplateById } from '@/lib/supabase/query'
import TemplateDetailContent from '@/components/TemplateDetailContent'

export default async function AdminEditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params

  const { data: template } = await getTemplateById(createAdminClient(), id)

  if (!template) notFound()

  return (
      <div className="p-4 sm:p-6">
        <TemplateDetailContent
          template={template}
          isAdmin={true}
          listPath="/pages/admin/templates"
        />
      </div>
  )
}
