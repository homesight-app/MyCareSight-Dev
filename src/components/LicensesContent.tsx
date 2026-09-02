'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  FileText,
  Calendar,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
  Upload,
  Clock,
  Plus,
  ClipboardList,
  FileCheck,
  RefreshCw,
  Loader2,
  X,
  ChevronDown,
  Download
} from 'lucide-react'
import NewLicenseApplicationModal from './NewLicenseApplicationModal'
import SelectLicenseTypeModal from './SelectLicenseTypeModal'
import ReviewLicenseRequestModal from './ReviewLicenseRequestModal'
import ReviewPlaybookRequestModal from './ReviewPlaybookRequestModal'
import CreateLicenseModal from './CreateLicenseModal'
import Button from '@/components/ui/PrimaryButton'
import Tabs from '@/components/ui/Tabs'
import StatusBadge from '@/components/ui/StatusBadge'
import SearchInput from '@/components/ui/SearchInput'
import { LicenseType } from '@/types/license'
import type { StandalonePlaybook } from '@/lib/supabase/query/playbooks'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { useRouter } from 'next/navigation'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'

interface License {
  id: string
  license_name: string
  state: string
  status: string
  activated_date: string | Date | null
  expiry_date: string | Date | null
  renewal_due_date: string | Date | null
}

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
  submitted_date?: string | Date | null
  created_at?: string | Date | null
  revision_reason?: string | null
}

interface LicensesContentProps {
  licenses: License[]
  documentCounts: Record<string, number>
  applications?: Application[]
  applicationDocumentCounts?: Record<string, number>
  playbookSet?: Set<string>
}

export default function LicensesContent({
  licenses,
  documentCounts,
  applications = [],
  applicationDocumentCounts = {},
  playbookSet,
}: LicensesContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'requested' | 'applications' | 'licenses'>('requested')
  const [isStateModalOpen, setIsStateModalOpen] = useState(false)
  const [isLicenseTypeModalOpen, setIsLicenseTypeModalOpen] = useState(false)
  const [resubmittingId, setResubmittingId] = useState<string | null>(null)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [isPlaybookReviewModalOpen, setIsPlaybookReviewModalOpen] = useState(false)
  const [isCreateLicenseModalOpen, setIsCreateLicenseModalOpen] = useState(false)
  const [selectedState, setSelectedState] = useState<string>('')
  const [selectedLicenseType, setSelectedLicenseType] = useState<LicenseType | null>(null)
  const [selectedPlaybook, setSelectedPlaybook] = useState<StandalonePlaybook | null>(null)
  const [loadingLicenseId, setLoadingLicenseId] = useState<string | null>(null)
  const [loadingApplicationId, setLoadingApplicationId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set())
  const [downloadingApplicationId, setDownloadingApplicationId] = useState<string | null>(null)
  const [downloadingLicenseId, setDownloadingLicenseId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter states for each tab
  const [requestFilter, setRequestFilter] = useState<'pending' | 'cancelled' | 'all'>('pending')
  const [applicationFilter, setApplicationFilter] = useState<'active' | 'approved' | 'denied' | 'all'>('active')
  const [licenseFilter, setLicenseFilter] = useState<'active' | 'expired' | 'all'>('active')

  // Clear optimistically cancelled ids when applications data updates (e.g. after router.refresh())
  useEffect(() => {
    setCancelledIds(new Set())
  }, [applications])

  // Check for 'new' query parameter and open modal automatically
  useEffect(() => {
    const newParam = searchParams.get('new')
    if (newParam === 'true') {
      setIsStateModalOpen(true)
      // Remove the query parameter from URL without reloading
      const url = new URL(window.location.href)
      url.searchParams.delete('new')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

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

  const handleResubmit = async (applicationId: string) => {
    setResubmittingId(applicationId)
    
    try {
      const supabase = createClient()
      
      // Change status from 'needs_revision' to 'in_progress' to allow resubmission
      const { error } = await q.updateApplicationById(supabase, applicationId, {
        status: 'in_progress',
        revision_reason: null
      })

      if (error) throw error

      router.refresh()
    } catch (error: any) {
      console.error('Error resubmitting application:', error)
      alert('Failed to resubmit application: ' + (error.message || 'Unknown error'))
    } finally {
      setResubmittingId(null)
    }
  }

  const handleCancelRequest = async (applicationId: string) => {
    if (!confirm('Are you sure you want to cancel this request? This action cannot be undone.')) {
      return
    }

    setCancellingId(applicationId)
    
    try {
      const supabase = createClient()
      
      const { error } = await q.updateApplicationById(supabase, applicationId, { status: 'cancelled' })

      if (error) throw error

      // Remove from list immediately so button stays disabled until row is gone
      setCancelledIds(prev => new Set(prev).add(applicationId))
      router.refresh()
    } catch (error: any) {
      console.error('Error cancelling request:', error)
      alert('Failed to cancel request: ' + (error.message || 'Unknown error'))
    } finally {
      setCancellingId(null)
    }
  }

  const handleViewLicenseDetails = (licenseId: string) => {
    setLoadingLicenseId(licenseId)
    router.push(`/pages/agency/licenses/${licenseId}`)
  }

  const handleViewApplicationDetails = (applicationId: string) => {
    setLoadingApplicationId(applicationId)
    router.push(`/pages/agency/applications/${applicationId}`)
  }

  const handleDownloadLatestDocument = async (applicationId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    setDownloadingApplicationId(applicationId)
    
    try {
      const supabase = createClient()
      
      // Fetch the latest document for this application
      const { data: documents, error } = await q.getLatestApplicationDocumentByApplicationId(supabase, applicationId)

      if (error || !documents) {
        if (error?.code === 'PGRST116') {
          // No documents found
          alert('No documents available for this application')
          return
        }
        throw error || new Error('Failed to fetch document')
      }

      // Download the document
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documents.document_url)
      if (!signedUrl) throw new Error('Failed to generate download URL')
      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = documents.document_name || 'document'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Error downloading document:', error)
      alert('Failed to download document: ' + (error.message || 'Unknown error'))
    } finally {
      setDownloadingApplicationId(null)
    }
  }

  const handleDownloadLatestLicenseDocument = async (licenseId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    setDownloadingLicenseId(licenseId)
    
    try {
      const supabase = createClient()
      
      // Fetch the latest document for this license
      const { data: documents, error } = await q.getLatestLicenseDocumentByLicenseId(supabase, licenseId)

      if (error || !documents) {
        if (error?.code === 'PGRST116') {
          // No documents found
          alert('No documents available for this license')
          return
        }
        throw error || new Error('Failed to fetch document')
      }

      // Download the document
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documents.document_url)
      if (!signedUrl) throw new Error('Failed to generate download URL')
      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = documents.document_name || 'document'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Error downloading document:', error)
      alert('Failed to download document: ' + (error.message || 'Unknown error'))
    } finally {
      setDownloadingLicenseId(null)
    }
  }

  // Categorize licenses — only recomputes when the licenses array changes
  const {
    expiringLicenses,
    activeLicenses,
    expiredLicenses,
    expiringLicensesList,
    activeLicensesList,
    expiredLicensesList,
    totalDisplayedLicenses,
  } = useMemo(() => {
    const today = new Date()
    const expiring = (licenses ?? []).filter(l => {
      if (l.expiry_date && l.status === 'active') {
        const daysUntilExpiry = Math.ceil((new Date(l.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntilExpiry <= 60 && daysUntilExpiry > 0
      }
      return false
    })
    const active = (licenses ?? []).filter(l => {
      if (l.status === 'active') {
        if (l.expiry_date) {
          const expiryDate = new Date(l.expiry_date)
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          return daysUntilExpiry > 60 && expiryDate >= today
        }
        return true
      }
      return false
    })
    const expired = (licenses ?? []).filter(l => {
      if (l.expiry_date) return new Date(l.expiry_date) < today
      return l.status === 'expired'
    })
    return {
      expiringLicenses:     expiring.length,
      activeLicenses:       active.length,
      expiredLicenses:      expired.length,
      expiringLicensesList: expiring,
      activeLicensesList:   active,
      expiredLicensesList:  expired,
      totalDisplayedLicenses: active.length + expiring.length + expired.length,
    }
  }, [licenses])

  // Format date helper
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  // Get state abbreviation (first 2 letters)
  const getStateAbbr = (state: string) => {
    return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
  }

  // Categorize applications — only recomputes when the applications array changes
  const {
    requestedCount,
    inProgressCount,
    underReviewCount,
    needsRevisionCount,
    requestedApps,
    cancelledApps,
    inProgressApps,
    underReviewApps,
    needsRevisionApps,
    approvedApps,
    rejectedApps,
  } = useMemo(() => ({
    requestedCount:     (applications ?? []).filter(a => a.status === 'requested').length,
    inProgressCount:    (applications ?? []).filter(a => a.status === 'in_progress').length,
    underReviewCount:   (applications ?? []).filter(a => a.status === 'under_review').length,
    needsRevisionCount: (applications ?? []).filter(a => a.status === 'needs_revision').length,
    requestedApps:      (applications ?? []).filter(a => a.status === 'requested'),
    cancelledApps:      (applications ?? []).filter(a => a.status === 'cancelled'),
    inProgressApps:     (applications ?? []).filter(a => a.status === 'in_progress'),
    underReviewApps:    (applications ?? []).filter(a => a.status === 'under_review'),
    needsRevisionApps:  (applications ?? []).filter(a => a.status === 'needs_revision'),
    approvedApps:       (applications ?? []).filter(a => a.status === 'approved'),
    rejectedApps:       (applications ?? []).filter(a => a.status === 'rejected'),
  }), [applications])

  const filteredApplications = useMemo(() => {
    if (applicationFilter === 'active')   return [...inProgressApps, ...underReviewApps, ...needsRevisionApps]
    if (applicationFilter === 'approved') return approvedApps
    if (applicationFilter === 'denied')   return rejectedApps
    return applications ?? []
  }, [applicationFilter, inProgressApps, underReviewApps, needsRevisionApps, approvedApps, rejectedApps, applications])

  const filteredRequests = useMemo(() => {
    const withoutCancelled = requestedApps.filter(a => !cancelledIds.has(a.id))
    if (requestFilter === 'pending')    return withoutCancelled
    if (requestFilter === 'cancelled')  return cancelledApps
    return [...withoutCancelled, ...cancelledApps]
  }, [requestFilter, requestedApps, cancelledApps, cancelledIds])

  const filteredLicenses = useMemo(() => {
    if (licenseFilter === 'active')   return [...activeLicensesList, ...expiringLicensesList]
    if (licenseFilter === 'expired')  return expiredLicensesList
    return licenses ?? []
  }, [licenseFilter, activeLicensesList, expiringLicensesList, expiredLicensesList, licenses])

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'under_review':
        return 'bg-yellow-100 text-yellow-700'
      case 'needs_revision':
        return 'bg-orange-100 text-orange-700'
      case 'approved':
        return 'bg-green-100 text-green-700'
      case 'rejected':
      case 'denied':
        return 'bg-red-100 text-red-700'
      case 'cancelled':
      case 'closed':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Get status display name
  const getStatusDisplay = (status: string) => {
    if (status === 'cancelled') return 'Cancelled'
    if (status === 'rejected') return 'Denied'
    if (status === 'closed') return 'Closed'
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  return (
    <>
      <div className="space-y-4 sm:space-y-6 min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-2xl font-bold text-gray-900 mb-2">License Management</h1>
            <p className="text-gray-600 text-xs sm:text-sm lg:text-sm">
              Manage your license applications and active licenses
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" type="button" icon={FileCheck} onClick={() => setIsCreateLicenseModalOpen(true)}>
              Create License Record
            </Button>
            <Button variant="primary" type="button" icon={Plus} onClick={() => setIsStateModalOpen(true)}>
              New Application Request
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by state..."
        />

        {/* Tabs */}
        <Tabs
          variant="underline"
          items={[
            { key: 'requested',    label: 'Requested',        count: requestedCount > 0 ? requestedCount : undefined },
            { key: 'applications', label: 'Applications',     count: (inProgressCount + underReviewCount + needsRevisionCount) > 0 ? (inProgressCount + underReviewCount + needsRevisionCount) : undefined },
            { key: 'licenses',     label: 'Current Licenses', count: totalDisplayedLicenses > 0 ? totalDisplayedLicenses : undefined },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'requested' | 'applications' | 'licenses')}
        />

        {/* Summary Cards */}
        {activeTab === 'requested' ? (
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold text-gray-600">Pending Approval</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{requestedCount}</div>
              <p className="text-sm text-gray-500 mt-1">Waiting for admin approval</p>
            </div>
          </div>
        ) : activeTab === 'applications' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold text-gray-600">In Progress</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{inProgressCount}</div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-6 h-6 text-yellow-600" />
                <span className="text-sm font-semibold text-gray-600">Under Review</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{underReviewCount}</div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-6 h-6 text-orange-600" />
                <span className="text-sm font-semibold text-gray-600">Needs Revision</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{needsRevisionCount}</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <span className="text-sm font-semibold text-gray-600">Active</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{activeLicenses}</div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-6 h-6 text-orange-600" />
                <span className="text-sm font-semibold text-gray-600">Expiring Soon</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{expiringLicenses}</div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <XCircle className="w-6 h-6 text-red-600" />
                <span className="text-sm font-semibold text-gray-600">Expired</span>
              </div>
              <div className="text-xl font-bold text-gray-900">{expiredLicenses}</div>
            </div>
          </div>
        )}

        {/* Requested Tab Content */}
        {activeTab === 'requested' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Requested Applications</h2>
              <div className="relative">
                <select
                  value={requestFilter}
                  onChange={(e) => setRequestFilter(e.target.value as 'pending' | 'cancelled' | 'all')}
                  className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="all">All</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            {filteredRequests.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
                <div className="space-y-4">
                  {filteredRequests.map((application) => (
                    <div key={application.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {getStateAbbr(application.state)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-900">{application.application_name}</h3>
                            <StatusBadge status={application.status} label={getStatusDisplay(application.status)} size="sm" />
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                            <span>Submitted {formatDate(application.created_at ?? application.submitted_date ?? null)}</span>
                            <span>State: {application.state}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {application.status === 'cancelled' ? 'Request has been cancelled' : 'Waiting for admin approval'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {application.status === 'requested' ? (
                          <>
                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                              Pending Review
                            </span>
                            <Button
                              variant="danger"
                              size="sm"
                              type="button"
                              icon={X}
                              onClick={() => handleCancelRequest(application.id)}
                              disabled={cancellingId === application.id}
                              loading={cancellingId === application.id}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <StatusBadge status={application.status} label={getStatusDisplay(application.status)} size="sm" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Applications Tab Content */}
        {activeTab === 'applications' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Applications</h2>
              <div className="relative flex-shrink-0">
                <select
                  value={applicationFilter}
                  onChange={(e) => setApplicationFilter(e.target.value as 'active' | 'approved' | 'denied' | 'all')}
                  className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="all">All</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            {filteredApplications.length > 0 ? (
              <div className="min-w-0 w-full bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto -mx-0">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">State</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Application Name</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Progress</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Started Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Updated</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Expert Feedback</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">download document</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Filtered Applications */}
                      {filteredApplications.map((application) => (
                          <tr key={application.id} className={`hover:bg-gray-50 transition-colors cursor-pointer ${loadingApplicationId === application.id ? 'bg-blue-50/50' : ''}`}
                        onClick={() => handleViewApplicationDetails(application.id)}>
                          <td className="px-6 py-4 whitespace-nowrap relative">
                            {loadingApplicationId === application.id ? (
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                {getStateAbbr(application.state)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900">{application.application_name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={application.status} label={getStatusDisplay(application.status)} size="sm" />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="w-32">
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{ width: `${application.progress_percentage || 0}%` }}
                                />
                              </div>
                              <div className="text-xs text-gray-500">{application.progress_percentage || 0}%</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {application.started_date ? formatDate(application.started_date) : <span className="text-gray-400">N/A</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {application.last_updated_date ? formatDate(application.last_updated_date) : <span className="text-gray-400">N/A</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                            {application.revision_reason ? (
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                                <span className="text-orange-700 line-clamp-2">{application.revision_reason}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={(e) => handleDownloadLatestDocument(application.id, e)}
                              disabled={downloadingApplicationId === application.id}
                              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Download latest document"
                            >
                              {downloadingApplicationId === application.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <Download className="w-4 h-4" />
                                  Download
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleViewApplicationDetails(application.id); }}
                                disabled={loadingApplicationId === application.id}
                                className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {loadingApplicationId === application.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  <>
                                    View Details
                                    <ArrowRight className="w-4 h-4" />
                                  </>
                                )}
                              </button>
                              {application.status === 'needs_revision' && (
                                <Button
                                  variant="primary"
                                  type="button"
                                  size="sm"
                                  icon={RefreshCw}
                                  onClick={() => handleResubmit(application.id)}
                                  disabled={resubmittingId === application.id}
                                  loading={resubmittingId === application.id}
                                >
                                  Resubmit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No {applicationFilter === 'active' ? 'active' : applicationFilter === 'approved' ? 'approved' : applicationFilter === 'denied' ? 'denied' : ''} applications
                </h3>
                <p className="text-gray-600 mb-6">
                  {applicationFilter === 'active' 
                    ? 'Approved applications will appear here once they are in progress'
                    : applicationFilter === 'approved'
                    ? "You don't have any approved applications yet"
                    : applicationFilter === 'denied'
                    ? "You don't have any denied applications yet"
                    : "You don't have any applications yet"}
                </p>
                {applicationFilter === 'active' && (
                  <Button variant="primary" type="button" icon={Plus} onClick={() => setIsStateModalOpen(true)}>
                    New Application Request
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* Licenses Tab Content */}
        {activeTab === 'licenses' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Current Licenses</h2>
              <div className="relative flex-shrink-0">
                <select
                  value={licenseFilter}
                  onChange={(e) => setLicenseFilter(e.target.value as 'active' | 'expired' | 'all')}
                  className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="all">All</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            {/* All Licenses Table */}
            {filteredLicenses.length > 0 ? (
              <div className="min-w-0 w-full bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto -mx-0">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">State</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">License Name</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Activated Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Expiry Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Renewal Due Date</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Documents</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Download Document</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Filtered Licenses */}
                      {filteredLicenses.map((license) => {
                        // Determine if license is expiring soon
                        const now = new Date()
                        const isExpiringSoon = license.expiry_date && license.status === 'active' ? (() => {
                          const expiryDate = new Date(license.expiry_date)
                          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                          return daysUntilExpiry <= 60 && daysUntilExpiry > 0
                        })() : false

                        const isExpired = license.expiry_date ? new Date(license.expiry_date) < now : license.status === 'expired'
                        
                        return (
                          <tr key={license.id} 
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${loadingLicenseId === license.id ? 'bg-blue-50/50' : ''}`}
                          onClick={() => handleViewLicenseDetails(license.id)}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {loadingLicenseId === license.id ? (
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
                                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                  {getStateAbbr(license.state)}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">{license.license_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <StatusBadge
                                status={isExpired ? 'expired' : isExpiringSoon ? 'expiring_soon' : 'active'}
                                size="sm"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {license.activated_date ? (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {formatDate(license.activated_date)}
                                </div>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {license.expiry_date ? (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {formatDate(license.expiry_date)}
                                </div>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {license.renewal_due_date ? (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {formatDate(license.renewal_due_date)}
                                </div>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <FileText className="w-4 h-4" />
                                {documentCounts[license.id] || 0}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={(e) => handleDownloadLatestLicenseDocument(license.id, e)}
                                disabled={downloadingLicenseId === license.id}
                                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Download latest document"
                              >
                                {downloadingLicenseId === license.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Downloading...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-4 h-4" />
                                    Download
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {isExpiringSoon && !isExpired ? (
                                <div className="flex items-center gap-3 justify-end">
                                  <Button variant="primary" type="button" size="sm" icon={Upload}>
                                    Upload
                                  </Button>
                                  <button
                                    onClick={() => handleViewLicenseDetails(license.id)}
                                    disabled={loadingLicenseId === license.id}
                                    className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {loadingLicenseId === license.id ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading...
                                      </>
                                    ) : (
                                      <>
                                        View Details
                                        <ArrowRight className="w-4 h-4" />
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleViewLicenseDetails(license.id)}
                                  disabled={loadingLicenseId === license.id}
                                  className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1 justify-end disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {loadingLicenseId === license.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Loading...
                                    </>
                                  ) : (
                                    <>
                                      View Details
                                      <ArrowRight className="w-4 h-4" />
                                    </>
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Empty State for Licenses */
              <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No {licenseFilter === 'active' ? 'active' : licenseFilter === 'expired' ? 'expired' : ''} licenses
                </h3>
                <p className="text-gray-600 mb-6">
                  {licenseFilter === 'active' 
                    ? 'Get started by adding your first license application'
                    : licenseFilter === 'expired'
                    ? "You don't have any expired licenses"
                    : "You don't have any licenses yet"}
                </p>
                {licenseFilter === 'active' && (
                  <Button variant="primary" type="button" icon={Plus} onClick={() => setIsStateModalOpen(true)}>
                    New Application Request
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* State Selection Modal */}
      <NewLicenseApplicationModal
        isOpen={isStateModalOpen}
        onClose={handleCloseAll}
        onStateSelect={handleStateSelect}
      />

      {/* License Type / Program Selection Modal */}
      {selectedState && (
        <SelectLicenseTypeModal
          isOpen={isLicenseTypeModalOpen}
          onClose={handleCloseAll}
          state={selectedState}
          onSelectLicenseType={handleLicenseTypeSelect}
          onSelectPlaybook={handlePlaybookSelect}
          onBack={handleBackToStateSelection}
        />
      )}

      {/* Review License Request Modal */}
      {selectedState && selectedLicenseType && (
        <ReviewLicenseRequestModal
          isOpen={isReviewModalOpen}
          onClose={handleCloseAll}
          state={selectedState}
          licenseType={selectedLicenseType}
          onBack={handleBackToLicenseTypes}
          hasPlaybook={playbookSet?.has(`${selectedState}|${selectedLicenseType?.name}`) ?? false}
        />
      )}

      {/* Review Program Request Modal */}
      {selectedState && selectedPlaybook && (
        <ReviewPlaybookRequestModal
          isOpen={isPlaybookReviewModalOpen}
          onClose={handleCloseAll}
          state={selectedState}
          playbook={selectedPlaybook}
          onBack={handleBackToTypesFromPlaybook}
        />
      )}

      {/* Create License Modal */}
      <CreateLicenseModal
        isOpen={isCreateLicenseModalOpen}
        onClose={() => setIsCreateLicenseModalOpen(false)}
        onSuccess={() => {
          setActiveTab('licenses')
          router.refresh()
        }}
      />
    </>
  )
}

