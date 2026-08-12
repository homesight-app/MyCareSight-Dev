import { requireAdmin } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import PlanManagementContent from '@/components/PlanManagementContent'

export default async function AdminPlansPage() {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data: plans } = await q.getFeaturePlans(supabase)

  return <PlanManagementContent plans={plans ?? []} />
}
