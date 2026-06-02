'use client'

import { useState } from 'react'
import ModalWrapper from './Modal'
import CaregiverProfileContent from './CaregiverProfileContent'
import type { PatientDocument } from '@/lib/supabase/query/patients'

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role: string
  job_title?: string | null
  status: string
  employee_id?: string | null
  start_date?: string | null
  currentPayRate?: number | null
  pay_rate?: string | number | null
  address?: string | null
  state?: string | null
  zip_code?: string | null
  skills?: string[] | null
  created_at?: string
  documents?: PatientDocument[] | null
}

interface StaffLicense {
  id: string
  caregiver_member_id: string
  license_type: string
  license_number: string
  state?: string | null
  status: string
  expiry_date?: string | null
  days_until_expiry?: number | null
}

interface ViewStaffDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  staff: StaffMember
  licenses: StaffLicense[]
  canManageNotes?: boolean
  agencyId?: string
}

export default function ViewStaffDetailsModal({
  isOpen,
  onClose,
  staff,
  licenses,
  canManageNotes,
  agencyId,
}: ViewStaffDetailsModalProps) {
  const [documentsBusy, setDocumentsBusy] = useState(false)

  const handleClose = () => {
    if (!documentsBusy) onClose()
  }

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={handleClose}
      title={`Caregiver Profile \u2014 ${staff.first_name} ${staff.last_name}`}
      subtitle="View detailed information about this caregiver, including their certifications, skills, contact details, and documents."
      size="xl"
    >
      <CaregiverProfileContent
        staff={staff}
        licenses={licenses}
        currentPayRate={staff.currentPayRate}
        documentsPanelActive={isOpen}
        onDocumentsBusyChange={setDocumentsBusy}
        canManageNotes={canManageNotes}
        agencyId={agencyId}
      />
    </ModalWrapper>
  )
}
