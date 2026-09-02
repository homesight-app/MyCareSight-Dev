'use client'

import BrandingForm, { type BrandingValues } from '@/components/ui/BrandingForm'
import { uploadPlatformLogo, updateSystemBranding, resetSystemBranding } from '@/app/actions/system-settings'

interface Props {
  initialValues: BrandingValues
}

export default function ConfigBrandingSection({ initialValues }: Props) {
  const handleSaveLogo = async (file: File, variant: 'full' | 'icon') => {
    const formData = new FormData()
    formData.append('file', file)
    return uploadPlatformLogo(formData, variant)
  }

  const handleSaveColors = async (primaryColor: string, sidebarColor: string) => {
    const result = await updateSystemBranding({ primaryColor, sidebarColor })
    return { error: result.error }
  }

  const handleReset = async () => {
    const result = await resetSystemBranding()
    return { error: result.error }
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Platform Branding</h2>
        <p className="text-sm text-gray-500 mt-1">
          Customize the platform logo and colors. These apply to all portals unless overridden by agency-level branding.
        </p>
      </div>
      <BrandingForm
        currentValues={initialValues}
        onSaveLogo={handleSaveLogo}
        onSaveColors={handleSaveColors}
        onReset={handleReset}
        resetLabel="Reset to MyCareSight Defaults"
      />
    </div>
  )
}
