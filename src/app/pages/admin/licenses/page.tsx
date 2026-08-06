import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLicensesContent from '@/components/AdminLicensesContent'

export default async function AdminLicensesPage() {
  await requireAdmin()
  const supabase = await createClient()

  const [
    { data: requestedApplicationsData, error: requestedError },
    { data: allApplicationsData, error: allAppsError },
    { data: playbooksData },
  ] = await Promise.all([
    q.getApplicationsByStatus(supabase, 'requested'),
    q.getApplicationsByStatuses(supabase, [
    'in_progress',
    'under_review',
    'needs_revision',
    'approved',
    'rejected',
    ],
  ),
    q.getPlaybooksWithRequirements(supabase),
  ])

  const requestedOwnerIds = requestedApplicationsData?.map(app => app.company_owner_id).filter(id => id !== null) || []
  const allOwnerIds = allApplicationsData?.map(app => app.company_owner_id).filter(id => id !== null) || []
  const ownerIds = Array.from(new Set(requestedOwnerIds.concat(allOwnerIds)))

  type OwnerProfileRow = { id: string; full_name: string | null; email: string | null }
  const { data: ownerProfilesRaw, error: profilesError } =
    ownerIds.length > 0 ? await q.getUserProfilesByIds(supabase, ownerIds, 'id, full_name, email') : { data: [], error: null }
  const ownerProfiles = (ownerProfilesRaw ?? []) as unknown as OwnerProfileRow[]

  // Create a map of owner profiles by ID for quick lookup
  const ownerProfilesMap = new Map(
    (ownerProfiles || []).map(profile => [profile.id, profile])
  )

  // Build playbook availability set: "state|licenseTypeName"
  const playbookSet = new Set(
    (playbooksData ?? []).map(p => {
      const lr = p.license_requirement as unknown as { state: string; license_type: string } | null
      return lr ? `${lr.state}|${lr.license_type}` : null
    }).filter(Boolean) as string[]
  )

  // Merge owner profiles with applications
  const requestedApplications = (requestedApplicationsData || []).map(app => ({
    ...app,
    user_profiles: ownerProfilesMap.get(app.company_owner_id) || null
  }))

  const allApplications = (allApplicationsData || []).map(app => ({
    ...app,
    user_profiles: ownerProfilesMap.get(app.company_owner_id) || null
  }))

  // Log errors if any (for debugging)
  if (requestedError) {
    console.error('Error fetching requested applications:', requestedError)
  }
  if (allAppsError) {
    console.error('Error fetching all applications:', allAppsError)
  }
  if (profilesError) {
    console.error('Error fetching owner profiles:', profilesError)
  }


  type ExpertProfileRow = { id: string; email: string | null; full_name: string | null; role: string | null }
  const { data: expertsDataRaw, error: expertsError } = await q.getUserProfilesByRole(
    supabase,
    'expert',
    'id, email, full_name, role'
  )
  const expertsData = (expertsDataRaw ?? []) as unknown as ExpertProfileRow[]

  const experts = expertsData.map(expert => {
    const nameParts = (expert.full_name || '').trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    return {
      id: expert.id, // This is the user_id (auth.users.id), same as what assigned_expert_id stores
      user_id: expert.id, // Keep for compatibility with existing component logic
      first_name: firstName,
      last_name: lastName,
      email: expert.email ?? '',
      status: 'active' // All experts from user_profiles are considered active
    }
  })

  // Log errors if any (for debugging)
  if (expertsError) {
    console.error('Error fetching experts:', expertsError)
  }

  return (
      <AdminLicensesContent
        requestedApplications={requestedApplications || []}
        allApplications={allApplications || []}
        experts={experts || []}
        playbookSet={playbookSet}
      />
  )
}
