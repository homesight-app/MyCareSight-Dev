'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import ApplicationDetailContent from './ApplicationDetailContent'

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
  submitted_date: string | Date | null
  license_type_id?: string | null
  assigned_expert_id?: string | null
  company_owner_id?: string
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
}

interface ExpertApplicationDetailWrapperProps {
  application: Application
  documents: Document[]
  agencyName?: string | null
}

export default function ExpertApplicationDetailWrapper({
  application,
  documents,
  agencyName,
}: ExpertApplicationDetailWrapperProps) {
  const searchParams = useSearchParams()
  const fromNotification = searchParams?.get('fromNotification') === 'true'
  const [activeTab, setActiveTab] = useState<'next-steps' | 'documents' | 'templates' | 'requirements' | 'message' | 'expert-process' | 'internal-notes'>(
    fromNotification ? 'message' : 'next-steps'
  )

  // Update tab if fromNotification changes
  useEffect(() => {
    if (fromNotification) {
      setActiveTab('message')
    }
  }, [fromNotification])

  return (
    <ApplicationDetailContent
      application={application}
      documents={documents}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      showInlineTabs={true}
      agencyName={agencyName}
    />
  )
}
