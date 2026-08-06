import { requireAdmin } from '@/lib/auth-helpers'
import TemplateDetailContent from '@/components/TemplateDetailContent'

export default async function AdminNewTemplatePage() {
  await requireAdmin()

  return (
      <div className="p-4 sm:p-6">
        <TemplateDetailContent
          isAdmin={true}
          listPath="/pages/admin/templates"
        />
      </div>
  )
}
