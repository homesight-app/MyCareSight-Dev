import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTemplates } from '@/lib/supabase/query'
import TemplatesContent from '@/components/TemplatesContent'

export default async function AdminTemplatesPage() {
  await requireAdmin()

  const { data: templates } = await getTemplates(createAdminClient(), { includeInactive: true })

  return (
      <div className="p-4 sm:p-6">
        <TemplatesContent
          templates={templates ?? []}
          isAdmin={true}
          basePath="/pages/admin/templates"
        />
      </div>
  )
}
