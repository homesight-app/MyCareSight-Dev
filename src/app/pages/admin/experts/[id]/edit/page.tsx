import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AddExpertForm from '@/components/AddExpertForm'

export default async function EditExpertPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: expert } = await q.getLicensingExpertById(supabase, id)

  if (!expert) {
    redirect('/pages/admin/users?tab=experts')
  }

  return (
      <div className="space-y-6">
        <Link
          href={`/pages/admin/users?tab=experts`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Expert Profile
        </Link>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Expert Information</h1>
          <AddExpertForm />
        </div>
      </div>
  )
}
