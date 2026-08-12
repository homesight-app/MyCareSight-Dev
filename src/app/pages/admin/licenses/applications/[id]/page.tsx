import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'

export default async function AdminApplicationDetailPage({
  params: _params,
  searchParams: _searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  await requireAdmin()
  redirect('/pages/admin')
}
