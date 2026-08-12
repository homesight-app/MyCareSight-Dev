import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import LicenseTypesTable from '@/components/LicenseTypesTable'

export default async function LicenseRequirementsPage() {
  await requireAdmin()
  redirect('/pages/admin')
  const supabase = await createClient()

  const { data: licenseTypes } = await q.getLicenseTypesOrderedByStateAndName(
    supabase,
    'id, state, name, description, cost_display, service_fee_display, processing_time_display, processing_time_min, processing_time_max, renewal_period_display, is_active'
  )

  return (
      <div className="space-y-4 md:space-y-6">


        {/* License Types Table */}
        <LicenseTypesTable licenseTypes={(licenseTypes ?? []) as unknown as Parameters<typeof LicenseTypesTable>[0]['licenseTypes']} />
      </div>
  )
}
