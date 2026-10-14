import { redirect } from 'next/navigation'
import { requireAgencyCapability } from '@/lib/feature-access'

/** Reports are available to agency company owners and care coordinators only. */
export async function assertAgencyReportsPageAccess(profile: { role?: string | null } | null) {
  if (profile?.role === 'admin') redirect('/pages/admin')
  if (profile?.role === 'expert') redirect('/pages/expert/clients')
  if (profile?.role !== 'company_owner' && profile?.role !== 'care_coordinator') {
    redirect('/pages/agency')
  }
  try {
    await requireAgencyCapability('analytics_reporting')
  } catch {
    redirect('/pages/agency')
  }
}
