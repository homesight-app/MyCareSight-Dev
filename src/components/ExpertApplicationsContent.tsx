'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  FileText, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Search,
  MapPin,
  User,
  Loader2,
  Clock,
  Percent
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
  submitted_date: string | Date | null
  created_at: string | Date | null
  company_owner_id: string
  assigned_expert_id?: string | null
  license_type_id?: string | null
  revision_reason?: string | null
  user_profiles: {
    full_name: string | null
    email: string | null
  } | null
}

interface ExpertApplicationsContentProps {
  applications: Application[]
}

export default function ExpertApplicationsContent({ 
  applications
}: ExpertApplicationsContentProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'deny' | null>(null)
  const [revisionReason, setRevisionReason] = useState('')

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'under_review':
        return 'bg-yellow-100 text-yellow-700'
      case 'needs_revision':
        return 'bg-orange-100 text-orange-700'
      case 'approved':
        return 'bg-green-100 text-green-700'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      case 'closed':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusDisplay = (status: string) => {
    if (status === 'closed') return 'Closed'
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const filteredApplications = applications.filter(app => {
    const query = searchQuery.toLowerCase()
    return (
      app.application_name.toLowerCase().includes(query) ||
      app.state.toLowerCase().includes(query) ||
      app.user_profiles?.full_name?.toLowerCase().includes(query) ||
      app.user_profiles?.email?.toLowerCase().includes(query)
    )
  })

  const requestedApps = filteredApplications.filter(app => app.status === 'requested')
  const inProgressApps = filteredApplications.filter(app => app.status === 'in_progress')
  const underReviewApps = filteredApplications.filter(app => app.status === 'under_review')
  const needsRevisionApps = filteredApplications.filter(app => app.status === 'needs_revision')
  const approvedApps = filteredApplications.filter(app => app.status === 'approved')
  const rejectedApps = filteredApplications.filter(app => app.status === 'rejected')
  const closedApps = filteredApplications.filter(app => app.status === 'closed')

  const handleReviewClick = (application: Application, action: 'approve' | 'deny') => {
    setSelectedApplication(application)
    setReviewAction(action)
    setRevisionReason(application.revision_reason || '')
    setReviewModalOpen(true)
  }

  const handleReviewSubmit = async () => {
    if (!selectedApplication || !reviewAction) return

    if (reviewAction === 'deny' && !revisionReason.trim()) {
      alert('Please provide a reason for denial')
      return
    }

    setIsLoading(selectedApplication.id)

    try {
      const supabase = createClient()

      if (reviewAction === 'approve') {
        const { error } = await q.updateApplicationStatus(supabase, selectedApplication.id, { status: 'approved', revision_reason: null })
        if (error) throw error
        router.refresh()
      } else {
        const { error } = await q.updateApplicationStatus(supabase, selectedApplication.id, { status: 'needs_revision', revision_reason: revisionReason.trim() })
        if (error) throw error
        router.refresh()
      }

      setReviewModalOpen(false)
      setSelectedApplication(null)
      setReviewAction(null)
      setRevisionReason('')
    } catch (error: any) {
      console.error('Error reviewing application:', error)
      alert('Failed to review application: ' + (error.message || 'Unknown error'))
    } finally {
      setIsLoading(null)
    }
  }

  const renderApplicationCard = (application: Application) => (
    <div
      key={application.id}
      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              {application.application_name}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{application.state}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{application.user_profiles?.full_name || application.user_profiles?.email || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Submitted: {formatDate(application.submitted_date || application.created_at)}</span>
            </div>
            {application.progress_percentage !== null && (
              <div className="flex items-center gap-1">
                <Percent className="w-4 h-4" />
                <span>{application.progress_percentage}% Complete</span>
              </div>
            )}
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadge(application.status)}`}>
          {getStatusDisplay(application.status)}
        </span>
      </div>

      {application.status === 'needs_revision' && application.revision_reason && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 mb-1">Revision Required</p>
              <p className="text-sm text-orange-700">{application.revision_reason}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {application.status === 'under_review' && (
          <>
            <button
              onClick={() => handleReviewClick(application, 'approve')}
              disabled={isLoading === application.id}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === application.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Approve
            </button>
            <button
              onClick={() => handleReviewClick(application, 'deny')}
              disabled={isLoading === application.id}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading === application.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Deny
            </button>
          </>
        )}
        <a
          href={`/pages/expert/applications/${application.id}`}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
        >
          <FileText className="w-4 h-4" />
          View Details
        </a>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Reviews</h1>
        <p className="text-gray-600">
          Review and approve or deny applications assigned to you
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search applications by name, state, or owner..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{requestedApps.length}</div>
              <div className="text-sm text-gray-600">Requested</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{inProgressApps.length}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{underReviewApps.length}</div>
              <div className="text-sm text-gray-600">Under Review</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{needsRevisionApps.length}</div>
              <div className="text-sm text-gray-600">Needs Revision</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{approvedApps.length}</div>
              <div className="text-sm text-gray-600">Approved</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{rejectedApps.length}</div>
              <div className="text-sm text-gray-600">Rejected</div>
            </div>
          </div>
        </div>
      </div>

      {/* Applications List */}
      {filteredApplications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No applications found</h3>
          <p className="text-gray-600">
            {searchQuery ? 'Try adjusting your search query' : 'No applications assigned to you yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {underReviewApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Under Review ({underReviewApps.length})</h2>
              <div className="space-y-4">
                {underReviewApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {requestedApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Requested ({requestedApps.length})</h2>
              <div className="space-y-4">
                {requestedApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {inProgressApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">In Progress ({inProgressApps.length})</h2>
              <div className="space-y-4">
                {inProgressApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {needsRevisionApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Needs Revision ({needsRevisionApps.length})</h2>
              <div className="space-y-4">
                {needsRevisionApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {approvedApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Approved ({approvedApps.length})</h2>
              <div className="space-y-4">
                {approvedApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {rejectedApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Rejected ({rejectedApps.length})</h2>
              <div className="space-y-4">
                {rejectedApps.map(renderApplicationCard)}
              </div>
            </div>
          )}

          {closedApps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Closed ({closedApps.length})</h2>
              <div className="space-y-4">
                {closedApps.map(renderApplicationCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false)
          setSelectedApplication(null)
          setReviewAction(null)
          setRevisionReason('')
        }}
        title={reviewAction === 'approve' ? 'Approve Application' : 'Deny Application'}
      >
        {selectedApplication && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Application: <span className="font-semibold text-gray-900">{selectedApplication.application_name}</span>
              </p>
              <p className="text-sm text-gray-600">
                State: <span className="font-semibold text-gray-900">{selectedApplication.state}</span>
              </p>
            </div>

            {reviewAction === 'deny' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Denial (Required)
                </label>
                <textarea
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="Please provide a detailed reason for denial..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={4}
                  required
                />
              </div>
            )}

            {reviewAction === 'approve' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  Approving this application will create an active license for the owner. This action cannot be undone.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => {
                  setReviewModalOpen(false)
                  setSelectedApplication(null)
                  setReviewAction(null)
                  setRevisionReason('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReviewSubmit}
                disabled={isLoading === selectedApplication.id || (reviewAction === 'deny' && !revisionReason.trim())}
                className={`px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  reviewAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isLoading === selectedApplication.id ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  reviewAction === 'approve' ? 'Approve' : 'Deny'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
