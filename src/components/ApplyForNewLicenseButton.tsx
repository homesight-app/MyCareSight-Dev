'use client'

import { useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import NewLicenseApplicationModal from './NewLicenseApplicationModal'
import SelectLicenseTypeModal from './SelectLicenseTypeModal'
import ReviewLicenseRequestModal from './ReviewLicenseRequestModal'
import ReviewPlaybookRequestModal from './ReviewPlaybookRequestModal'
import { LicenseType } from '@/types/license'
import type { StandalonePlaybook } from '@/lib/supabase/query/playbooks'

interface ApplyForNewLicenseButtonProps {
  agencyId?: string
  agencyName?: string
  label?: string
  /** When true, the type-selection modal shows only programs (standalone playbooks), not license types. */
  programsOnly?: boolean
}

export default function ApplyForNewLicenseButton({ agencyId, agencyName, label, programsOnly = false }: ApplyForNewLicenseButtonProps = {}) {
  const [isStateModalOpen, setIsStateModalOpen] = useState(false)
  const [isLicenseTypeModalOpen, setIsLicenseTypeModalOpen] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [isPlaybookReviewModalOpen, setIsPlaybookReviewModalOpen] = useState(false)
  const [selectedState, setSelectedState] = useState<string>('')
  const [selectedLicenseType, setSelectedLicenseType] = useState<LicenseType | null>(null)
  const [selectedPlaybook, setSelectedPlaybook] = useState<StandalonePlaybook | null>(null)

  const handleStateSelect = (state: string) => {
    setSelectedState(state)
    setIsStateModalOpen(false)
    setIsLicenseTypeModalOpen(true)
  }

  const handleLicenseTypeSelect = (licenseType: LicenseType) => {
    setSelectedLicenseType(licenseType)
    setIsLicenseTypeModalOpen(false)
    setIsReviewModalOpen(true)
  }

  const handlePlaybookSelect = (playbook: StandalonePlaybook) => {
    setSelectedPlaybook(playbook)
    setIsLicenseTypeModalOpen(false)
    setIsPlaybookReviewModalOpen(true)
  }

  const handleBackToStateSelection = () => {
    setIsLicenseTypeModalOpen(false)
    setIsStateModalOpen(true)
  }

  const handleBackToLicenseTypes = () => {
    setIsReviewModalOpen(false)
    setIsLicenseTypeModalOpen(true)
  }

  const handleBackToTypesFromPlaybook = () => {
    setIsPlaybookReviewModalOpen(false)
    setIsLicenseTypeModalOpen(true)
  }

  const handleCloseAll = () => {
    setIsStateModalOpen(false)
    setIsLicenseTypeModalOpen(false)
    setIsReviewModalOpen(false)
    setIsPlaybookReviewModalOpen(false)
    setSelectedState('')
    setSelectedLicenseType(null)
    setSelectedPlaybook(null)
  }

  return (
    <>
      <button
        onClick={() => setIsStateModalOpen(true)}
        className="w-full text-center py-2 px-4 bg-black hover:bg-gray-800 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        {label ?? 'Apply for New License'}
      </button>

      {/* State Selection Modal */}
      <NewLicenseApplicationModal
        isOpen={isStateModalOpen}
        onClose={handleCloseAll}
        onStateSelect={handleStateSelect}
        programsOnly={programsOnly}
      />

      {/* License Type + Program Selection Modal */}
      <SelectLicenseTypeModal
        isOpen={isLicenseTypeModalOpen}
        onClose={handleCloseAll}
        state={selectedState}
        onSelectLicenseType={handleLicenseTypeSelect}
        onSelectPlaybook={handlePlaybookSelect}
        onBack={handleBackToStateSelection}
        programsOnly={programsOnly}
      />

      {/* Review License Request Modal */}
      {selectedLicenseType && (
        <ReviewLicenseRequestModal
          isOpen={isReviewModalOpen}
          onClose={handleCloseAll}
          state={selectedState}
          licenseType={selectedLicenseType}
          onBack={handleBackToLicenseTypes}
          agencyId={agencyId}
        />
      )}

      {/* Review Program Request Modal */}
      {selectedPlaybook && (
        <ReviewPlaybookRequestModal
          isOpen={isPlaybookReviewModalOpen}
          onClose={handleCloseAll}
          state={selectedState}
          playbook={selectedPlaybook}
          onBack={handleBackToTypesFromPlaybook}
          agencyId={agencyId}
        />
      )}
    </>
  )
}
