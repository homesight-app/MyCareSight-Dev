import { requireAdmin } from '@/lib/auth-helpers'
import * as q from '@/lib/supabase/query'
import PlanManagementContent from '@/components/PlanManagementContent'

export default async function AdminPlansPage() {
  await requireAdmin()
  const { data: plans } = await q.getFeaturePlans()

  return <PlanManagementContent plans={plans ?? []} />
}
