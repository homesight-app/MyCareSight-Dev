'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  FileText,
  Download,
  Calendar,
  MapPin,
  User,
  Clock,
  Percent,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Check,
  Circle,
  Mail
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'

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
  assigned_expert_id: string | null
  license_type_id: string | null
  revision_reason?: string | null
  owner_profile: {
    id: string
    full_name: string | null
    email: string
    created_at: string
  } | null
}

interface Document {
  id: string
  document_name: string
  document_url: string
  document_type: string | null
  status: string
  created_at: string
}

interface ApplicationStep {
  id: string
  step_name: string
  step_order: number
  is_completed: boolean
  completed_at: string | null
  notes: string | null
  created_at: string
}

interface ExpertApplicationDetailModalProps {
  application: Application | null
  isOpen: boolean
  onClose: () => void
}

export default function ExpertApplicationDetailModal({
  application,
  isOpen,
  onClose
}: ExpertApplicationDetailModalProps) {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [steps, setSteps] = useState<ApplicationStep[]>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [isLoadingSteps, setIsLoadingSteps] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'deny' | null>(null)
  const [revisionReason, setRevisionReason] = useState('')

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return 'bg-blue-100 text-blue-700'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'under_review':
        return 'bg-yellow-100 text-yellow-700'
      case 'needs_revision':
        return 'bg-orange-100 text-orange-700'
      case 'approved':
        return 'bg-green-100 text-green-700'
      case 'rejected':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusDisplay = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const fetchDocuments = useCallback(async () => {
    if (!application) return
    
    setIsLoadingDocs(true)
    try {
      const supabase = createClient()
      const { data, error } = await q.getApplicationDocumentsByApplicationId(supabase, application.id)

      if (error) {
        console.error('Error fetching documents:', error)
        // Set empty array on error to avoid showing stale data
        setDocuments([])
      } else {
        setDocuments(data || [])
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
      setDocuments([])
    } finally {
      setIsLoadingDocs(false)
    }
  }, [application])

  const fetchSteps = useCallback(async () => {
    if (!application) return
    
    setIsLoadingSteps(true)
    try {
      const supabase = createClient()
      
      // First, try to fetch application_steps (steps specific to this application)
      const { data: applicationSteps, error: appStepsError } = await q.getApplicationStepsByApplicationId(supabase, application.id)

      if (appStepsError) {
        console.error('Error fetching application steps:', appStepsError)
      }

      // If application_steps exist, use them
      if (applicationSteps && applicationSteps.length > 0) {
        setSteps(applicationSteps.map((step: any) => ({
          id: step.id,
          step_name: step.step_name,
          step_order: step.step_order,
          is_completed: step.is_completed,
          completed_at: step.completed_at,
          notes: step.notes,
          created_at: step.created_at
        })))
        setIsLoadingSteps(false)
        return
      }

      // If no application_steps exist, fetch required steps from license_requirement_steps
      // We need to get the license_type_id and find the corresponding license_requirements
      if (application.license_type_id && application.state) {
        // Get license type name
        const { data: licenseType, error: licenseTypeError } = await q.getLicenseTypeById(supabase, application.license_type_id)

        if (licenseTypeError) {
          console.error('Error fetching license type:', licenseTypeError)
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        if (!licenseType || !licenseType.name) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        // Find license_requirement_id for this state and license type
        const { data: licenseRequirement, error: reqError } = await q.getLicenseRequirementByStateAndType(supabase, application.state, licenseType.name)

        if (reqError) {
          console.error('Error fetching license requirement:', reqError)
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        if (!licenseRequirement) {
          setSteps([])
          setIsLoadingSteps(false)
          return
        }

        // Fetch required steps from license_requirement_steps
        const { data: requiredSteps, error: stepsError } = await q.getStepsFromRequirement(supabase, licenseRequirement.id)

        if (stepsError) {
          console.error('Error fetching required steps:', stepsError)
          setSteps([])
        } else {
          // Map license_requirement_steps to application_steps format
          setSteps((requiredSteps || []).map((step: any, index: number) => ({
            id: step.id || `temp-${index}`,
            step_name: step.step_name,
            step_order: step.step_order || index + 1,
            is_completed: false, // These are required steps, not yet completed
            completed_at: null,
            notes: null,
            created_at: step.created_at || new Date().toISOString()
          })))
        }
      } else {
        setSteps([])
      }
    } catch (error) {
      console.error('Error:', error)
      setSteps([])
    } finally {
      setIsLoadingSteps(false)
    }
  }, [application])

  // Fetch documents and steps when modal opens
  useEffect(() => {
    if (isOpen && application) {
      fetchDocuments()
      fetchSteps()
    } else {
      setDocuments([])
      setSteps([])
      setReviewAction(null)
      setRevisionReason('')
    }
  }, [isOpen, application, fetchDocuments, fetchSteps])

  const handleDownload = async (documentPath: string, documentName: string) => {
    try {
      const supabase = createClient()
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, documentPath)
      if (!signedUrl) throw new Error('Failed to generate download URL')
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = documentName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Failed to download file')
    }
  }

  const handleReviewSubmit = async () => {
    if (!application || !reviewAction) return

    if (reviewAction === 'deny' && !revisionReason.trim()) {
      alert('Please provide a reason for denial')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()

      if (reviewAction === 'approve') {
        // Approve application - status becomes 'approved'
        // License creation will be handled by database trigger
        const { error } = await q.updateApplicationStatus(supabase, application.id, { status: 'approved', revision_reason: null })
        if (error) throw error
      } else {
        const { error } = await q.updateApplicationStatus(supabase, application.id, { status: 'needs_revision', revision_reason: revisionReason.trim() })

        if (error) throw error
      }

      router.refresh()
      onClose()
    } catch (error: any) {
      console.error('Error reviewing application:', error)
      alert('Failed to review application: ' + (error.message || 'Unknown error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!application) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Application Details"
      size="xl"
    >
      <div className="space-y-6">
        {/* Application Basic Information */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {application.application_name}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{application.state}</span>
                </div>
                {application.created_at && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Created: {formatDate(application.created_at)}</span>
                  </div>
                )}
                {application.started_date && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Started: {formatDate(application.started_date)}</span>
                  </div>
                )}
                {application.last_updated_date && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Last Updated: {formatDate(application.last_updated_date)}</span>
                  </div>
                )}
                {application.progress_percentage !== null && (
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    <span className="font-semibold text-blue-600">{application.progress_percentage}% Complete</span>
                  </div>
                )}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadge(application.status)}`}>
              {getStatusDisplay(application.status)}
            </span>
          </div>
        </div>

        {/* Owner/Client Information */}
        {application.owner_profile && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Client Information
            </h4>
            <div className="space-y-1 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{application.owner_profile.full_name || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="font-medium">Email:</span>
                <span>{application.owner_profile.email}</span>
              </div>
            </div>
          </div>
        )}

        {/* Revision Reason (if needs_revision) */}
        {application.status === 'needs_revision' && application.revision_reason && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-orange-900 mb-1">Revision Required</p>
                <p className="text-sm text-orange-700">{application.revision_reason}</p>
              </div>
            </div>
          </div>
        )}

        {/* Documents Section */}
        <div>
          <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Documents ({documents.length})
          </h4>
          {isLoadingDocs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.document_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.document_type || 'No type'} • Uploaded {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(doc.document_url, doc.document_name)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Download document"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          )}
        </div>

        {/* Steps Section */}
        <div>
          <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Required Steps ({steps.length > 0 ? `${steps.filter(s => s.is_completed).length}/${steps.length}` : '0'})
          </h4>
          {isLoadingSteps ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : steps.length > 0 ? (
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  {step.is_completed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${step.is_completed ? 'text-gray-900' : 'text-gray-600'}`}>
                      {step.step_order}. {step.step_name}
                    </p>
                    {step.is_completed && step.completed_at && (
                      <p className="text-xs text-gray-500 mt-1">
                        Completed: {formatDate(step.completed_at)}
                      </p>
                    )}
                    {step.notes && (
                      <p className="text-xs text-gray-600 mt-1 italic">
                        Notes: {step.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No steps defined for this application</p>
            </div>
          )}
        </div>

        {/* Review Actions (for under_review status) */}
        {application.status === 'under_review' && (
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-base font-semibold text-gray-900 mb-4">Review Actions</h4>
            
            {reviewAction === null ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setReviewAction('approve')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Approve Application
                </button>
                <button
                  onClick={() => setReviewAction('deny')}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  <XCircle className="w-5 h-5" />
                  Deny Application
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {reviewAction === 'approve' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      Approving this application will create an active license for the owner. This action cannot be undone.
                    </p>
                  </div>
                )}

                {reviewAction === 'deny' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Denial (Required)
                    </label>
                    <textarea
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      placeholder="Please provide a detailed reason for denial..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
                      rows={4}
                      required
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setReviewAction(null)
                      setRevisionReason('')
                    }}
                    disabled={isSubmitting}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReviewSubmit}
                    disabled={isSubmitting || (reviewAction === 'deny' && !revisionReason.trim())}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                      reviewAction === 'approve'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {reviewAction === 'approve' ? (
                          <>
                            <Check className="w-4 h-4" />
                            Confirm Approval
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4" />
                            Confirm Denial
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
