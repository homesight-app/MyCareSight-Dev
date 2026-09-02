'use client'

import BrandingForm, { type BrandingValues } from '@/components/ui/BrandingForm'
import { uploadAgencyLogoAction, updateAgencyBrandingAction, resetAgencyBrandingAction } from '@/app/actions/agencies'

interface Props {
  agencyId: string
  initialValues: BrandingValues
}

export default function AgencyBrandingSection({ agencyId, initialValues }: Props) {
  const handleSaveLogo = async (file: File, variant: 'full' | 'icon') => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadAgencyLogoAction(agencyId, formData, variant)
  }

  const handleSaveColors = async (primaryColor: string, sidebarColor: string) => {
    const result = await updateAgencyBrandingAction(agencyId, { primaryColor, sidebarColor })
    return { error: result.error }
  }

  const handleReset = async () => {
    const result = await resetAgencyBrandingAction(agencyId)
    return { error: result.error }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="font-semibold text-gray-900">Agency Branding</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload your agency logo and set custom colors. These apply to all portals for your agency
          and override the platform defaults.
        </p>
      </div>
      <BrandingForm
        currentValues={initialValues}
        onSaveLogo={handleSaveLogo}
        onSaveColors={handleSaveColors}
        onReset={handleReset}
        resetLabel="Reset to Platform Defaults"
      />
    </div>
  )
}
