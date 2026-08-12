import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'

export default async function LicenseRequirementDetailPage({
  params: _params
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  redirect('/pages/admin')
}
