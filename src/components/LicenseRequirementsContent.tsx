'use client'

import { useState } from 'react'
import LicenseTypesManager from '@/components/LicenseTypesManager'
import LicenseTypeDetails from '@/components/LicenseTypeDetails'

interface LicenseType {
  id: string
  state: string
  name: string
  description: string
  processing_time_display: string
  cost_display: string
  service_fee_display?: string
  renewal_period_display: string
}


export default function LicenseRequirementsContent() {
  const [selectedLicenseType, setSelectedLicenseType] = useState<LicenseType | null>(null)
  const [selectedState, setSelectedState] = useState('California')

  
  const handleSelectLicenseType = (licenseType: LicenseType | null) => {
    setSelectedLicenseType(licenseType)
  }
  
  return (
    <div className="space-y-4 md:space-y-6">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Panel - License Types */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-md border border-gray-100 p-4 md:p-6">
          <LicenseTypesManager 
            initialState={selectedState}
            selectedLicenseTypeId={selectedLicenseType?.id || null}
            onSelectLicenseType={handleSelectLicenseType}
            onStateChange={(state) => {
              setSelectedState(state)
              setSelectedLicenseType(null) // Clear selection when state changes
            }}
          />
        </div>

        {/* Right Panel - License Type Details */}
        <div className="lg:col-span-2">
          <LicenseTypeDetails 
            licenseType={selectedLicenseType}
            selectedState={selectedState}
          />
        </div>
      </div>
    </div>
  )
}
