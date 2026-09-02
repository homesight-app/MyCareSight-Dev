'use client'

import { useState } from 'react'
import Modal from './Modal'
import Button from '@/components/ui/PrimaryButton'
import { CaregiverDocumentsPanel } from './CaregiverDocumentsPanel'
import type { PatientDocument } from '@/lib/supabase/query/patients'

interface ManageCaregiverDocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  staffId: string
  staffName: string
  initialDocuments: PatientDocument[] | null | undefined
}

export default function ManageCaregiverDocumentsModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  initialDocuments,
}: ManageCaregiverDocumentsModalProps) {
  const [documentsBusy, setDocumentsBusy] = useState(false)

  const handleClose = () => {
    if (documentsBusy) return
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Manage Documents — ${staffName}`}
      size="xl"
    >
      <div className="space-y-6">
        <CaregiverDocumentsPanel
          active={isOpen}
          staffMemberId={staffId}
          caregiverName={staffName}
          initialDocuments={initialDocuments}
          showTopSeparator={false}
          onBusyChange={setDocumentsBusy}
        />

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={documentsBusy}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
