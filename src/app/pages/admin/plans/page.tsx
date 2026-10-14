import { requireAdmin } from '@/lib/auth-helpers'
import * as q from '@/lib/supabase/query'
import PlanManagementContent from '@/components/PlanManagementContent'
import { withUserContext } from '@/db'

export default async function AdminPlansPage() {
  const session = await requireAdmin()
  const { data: plans } = await withUserContext(
    session.user.id,
    'admin',
    null,
    () => q.getFeaturePlans()
  )

  return <PlanManagementContent plans={plans ?? []} />
}
