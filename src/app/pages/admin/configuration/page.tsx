import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ConfigurationContent from '@/components/ConfigurationContent'
import { getCurrentPricing } from '@/app/actions/pricing'
import { getCachedLicenseTypesForConfiguration } from '@/lib/server-cache/reference-lists'
import {
  getCertificationTypes,
  getNonSkilledTaskCategories,
  getNonSkilledTasks,
  getSkilledTaskCategories,
  getSkilledTasks,
  getStaffRoles,
} from '@/app/actions/system-lists'

export default async function ConfigurationPage() {
  await requireAdmin()
  const supabase = await createClient()

  const pricingResult = await getCurrentPricing()
  const pricingData = pricingResult.data
  const { data: licenseTypes } = await getCachedLicenseTypesForConfiguration()

  // Get system lists data
  
  const certTypesResult = await getCertificationTypes()
  const certificationTypes = certTypesResult.data || []
  
  
  const rolesResult = await getStaffRoles()
  const staffRoles = rolesResult.data || []
  const skilledTasksResult = await getSkilledTasks()
  const skilledTasks = skilledTasksResult.data || []
  const nonSkilledTasksResult = await getNonSkilledTasks()
  const nonSkilledTasks = nonSkilledTasksResult.data || []
  const skilledTaskCategoriesResult = await getSkilledTaskCategories()
  const skilledTaskCategories = skilledTaskCategoriesResult.data || []
  const nonSkilledTaskCategoriesResult = await getNonSkilledTaskCategories()
  const nonSkilledTaskCategories = nonSkilledTaskCategoriesResult.data || []

  return (
      <ConfigurationContent
        initialPricing={pricingData || { owner_admin_license: 50, staff_license: 25 }}
        licenseTypes={(licenseTypes ?? []) as unknown as Parameters<typeof ConfigurationContent>[0]['licenseTypes']}
        certificationTypes={certificationTypes}
        staffRoles={staffRoles}
        skilledTasks={skilledTasks}
        nonSkilledTasks={nonSkilledTasks}
        skilledTaskCategories={skilledTaskCategories}
        nonSkilledTaskCategories={nonSkilledTaskCategories}
      />
  )
}
