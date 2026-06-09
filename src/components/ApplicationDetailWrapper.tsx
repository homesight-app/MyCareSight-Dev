'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from './DashboardLayout'
import ApplicationDetailContent from './ApplicationDetailContent'
import { ArrowLeft, Loader2 } from 'lucide-react'

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
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
}

interface ApplicationDetailWrapperProps {
  application: Application
  documents: Document[]
  user: {
    id?: string
    email?: string | null
  }
  profile: {
    full_name?: string | null
    role?: string | null
  } | null
  unreadNotifications?: number
}

export default function ApplicationDetailWrapper({
  application,
  documents,
  user,
  profile,
  unreadNotifications = 0
}: ApplicationDetailWrapperProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'checklist' | 'documents' | 'next-steps' | 'requirements' | 'templates' | 'message' | 'expert-process' | 'internal-notes'>('next-steps')
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)

  // Map activeTab to a valid license tab type for DashboardLayout
  const getLicenseTab = (tab: typeof activeTab): 'overview' | 'checklist' | 'documents' => {
    if (tab === 'overview' || tab === 'checklist' || tab === 'documents') {
      return tab
    }
    return 'overview' // Default fallback
  }

  // Handle tab change from DashboardLayout (only for license tabs)
  const handleLicenseTabChange = (tab: 'overview' | 'checklist' | 'documents' ) => {
    setActiveTab(tab)
  }

  // Handle tab change from ApplicationDetailContent
  const handleTabChange = (tab: 'next-steps' | 'documents' | 'requirements' | 'templates' | 'message' | 'expert-process' | 'internal-notes') => {
    setActiveTab(tab)
  }

  const handleBackToLicenses = () => {
    setIsNavigatingBack(true)
    router.push('/pages/agency/licenses')
  }

  return (
    <DashboardLayout
      user={user}
      profile={profile}
      unreadNotifications={unreadNotifications}
      application={{
        id: application.id,
        state: application.state,
        progress_percentage: application.progress_percentage
      }}
      activeLicenseTab={getLicenseTab(activeTab)}
      onLicenseTabChange={handleLicenseTabChange}
    >
      
      <button
          type="button"
          onClick={handleBackToLicenses}
          disabled={isNavigatingBack}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isNavigatingBack ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <ArrowLeft className="w-4 h-4" />
              Back to Licenses
            </>
          )}
        </button>
      <ApplicationDetailContent
        application={application}
        documents={documents}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        showInlineTabs={true}
      />
    </DashboardLayout>
  )
}
