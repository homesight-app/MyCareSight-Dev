import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import LicenseTypesTable from '@/components/LicenseTypesTable'

export default async function LicenseRequirementsPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const { count: unreadNotifications } = await q.getUnreadNotificationsCount(supabase, user.id)
  const { data: licenseTypes } = await q.getLicenseTypesOrderedByStateAndName(
    supabase,
    'id, state, name, description, cost_display, service_fee_display, processing_time_display, processing_time_min, processing_time_max, renewal_period_display, is_active'
  )

  return (
    <AdminLayout 
      user={user} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-4 md:space-y-6">


        {/* License Types Table */}
        <LicenseTypesTable licenseTypes={(licenseTypes ?? []) as unknown as Parameters<typeof LicenseTypesTable>[0]['licenseTypes']} />
      </div>
    </AdminLayout>
  )
}
