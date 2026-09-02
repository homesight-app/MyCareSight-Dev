import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import ConfigurationNav from '@/components/ConfigurationNav'
import ConfigPricingSection from '@/components/ConfigPricingSection'
import ConfigLicenseSection from '@/components/ConfigLicenseSection'
import ConfigurableListSection from '@/components/ConfigurableListSection'
import SystemListsManagement from '@/components/SystemListsManagement'
import ConfigBrandingSection from '@/components/ConfigBrandingSection'
import { getCurrentPricing } from '@/app/actions/pricing'
import { getCachedLicenseTypesForConfiguration } from '@/lib/server-cache/reference-lists'
import { getConfigurationValues } from '@/app/actions/configuration-values'
import { getSystemBranding } from '@/app/actions/system-settings'
import {
  getSkilledTasks,
  getNonSkilledTasks,
  getSkilledTaskCategories,
  getNonSkilledTaskCategories,
} from '@/app/actions/system-lists'

const VALID_SECTIONS = [
  'pricing',
  'license-types',
  'certification-types',
  'staff-roles',
  'task-catalog',
  'playbook-categories',
  'branding',
] as const

type Section = (typeof VALID_SECTIONS)[number]

function SectionLoadingSkeleton() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-48 mb-2" />
      <div className="h-4 bg-gray-100 rounded w-72 mb-6" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  )
}

async function ConfigurationSectionContent({ section }: { section: Section }) {
  if (section === 'pricing') {
    const { data: pricingData } = await getCurrentPricing()
    return (
      <ConfigPricingSection
        initialPricing={pricingData ?? { owner_admin_license: 50, staff_license: 25 }}
      />
    )
  }

  if (section === 'license-types') {
    const { data: licenseTypes } = await getCachedLicenseTypesForConfiguration()
    return (
      <ConfigLicenseSection
        licenseTypes={
          (licenseTypes ?? []) as unknown as Parameters<typeof ConfigLicenseSection>[0]['licenseTypes']
        }
      />
    )
  }

  if (section === 'certification-types') {
    const { data: certTypes } = await getConfigurationValues('CERTIFICATION_TYPE')
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Certification Types</h2>
          <p className="text-sm text-gray-500 mt-1">
            Credential types available for caregivers to add to their profile.
          </p>
        </div>
        <ConfigurableListSection
          typeCode="CERTIFICATION_TYPE"
          initialValues={
            (certTypes ?? []) as unknown as Parameters<typeof ConfigurableListSection>[0]['initialValues']
          }
        />
      </div>
    )
  }

  if (section === 'staff-roles') {
    const { data: staffRoles } = await getConfigurationValues('STAFF_ROLE')
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Staff Roles</h2>
          <p className="text-sm text-gray-500 mt-1">Roles that can be assigned to staff members.</p>
        </div>
        <ConfigurableListSection
          typeCode="STAFF_ROLE"
          initialValues={
            (staffRoles ?? []) as unknown as Parameters<typeof ConfigurableListSection>[0]['initialValues']
          }
        />
      </div>
    )
  }

  if (section === 'task-catalog') {
    const [skilledResult, nonSkilledResult, skilledCatsResult, nonSkilledCatsResult] =
      await Promise.all([
        getSkilledTasks(),
        getNonSkilledTasks(),
        getSkilledTaskCategories(),
        getNonSkilledTaskCategories(),
      ])
    return (
      <SystemListsManagement
        initialSkilledTasks={skilledResult.data ?? []}
        initialNonSkilledTasks={nonSkilledResult.data ?? []}
        initialSkilledTaskCategories={skilledCatsResult.data ?? []}
        initialNonSkilledTaskCategories={nonSkilledCatsResult.data ?? []}
      />
    )
  }

  if (section === 'playbook-categories') {
    const { data: playbookCats } = await getConfigurationValues('PLAYBOOK_CATEGORY')
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Playbook Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Categories and subcategories used to classify playbooks, programs, and certifications.
          </p>
        </div>
        <ConfigurableListSection
          typeCode="PLAYBOOK_CATEGORY"
          initialValues={
            (playbookCats ?? []) as unknown as Parameters<typeof ConfigurableListSection>[0]['initialValues']
          }
        />
      </div>
    )
  }

  if (section === 'branding') {
    const branding = await getSystemBranding()
    return (
      <ConfigBrandingSection
        initialValues={{
          logoUrl: branding.logoUrl,
          logoIconUrl: branding.logoIconUrl,
          primaryColor: branding.primaryColor,
          sidebarColor: branding.sidebarColor,
        }}
      />
    )
  }

  redirect('/pages/admin/configuration')
}

export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  await requireAdmin()
  const { section: rawSection } = await searchParams
  const section: Section = VALID_SECTIONS.includes(rawSection as Section)
    ? (rawSection as Section)
    : 'pricing'

  return (
    <div className="flex gap-6 items-start">
      <ConfigurationNav activeSection={section} />
      <div className="flex-1 min-w-0">
        <Suspense key={section} fallback={<SectionLoadingSkeleton />}>
          <ConfigurationSectionContent section={section} />
        </Suspense>
      </div>
    </div>
  )
}
