'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ClipboardList,
  Clock,
  FileText,
  AlertCircle,
  ArrowRight,
  Plus
} from 'lucide-react'
import NewApplicationModal from './NewApplicationModal'
import UploadDocumentButton from './UploadDocumentButton'
import ApplicationDocumentsPanel from './ApplicationDocumentsPanel'
import Button from '@/components/ui/PrimaryButton'
import SearchInput from '@/components/ui/SearchInput'
import StatusBadge from '@/components/ui/StatusBadge'

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage: number | null
  started_date: string | Date | null
  last_updated_date: string | Date | null
}

interface ApplicationsContentProps {
  applications: Application[]
  documentCounts: Record<string, number>
}

export default function ApplicationsContent({ applications, documentCounts }: ApplicationsContentProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')

  // Calculate statistics
  const inProgressCount = applications?.filter(a => a.status === 'in_progress').length || 0
  const underReviewCount = applications?.filter(a => a.status === 'under_review').length || 0
  const needsRevisionCount = applications?.filter(a => a.status === 'needs_revision').length || 0

  // Categorize applications
  const inProgressApps = applications?.filter(a => a.status === 'in_progress') || []
  const underReviewApps = applications?.filter(a => a.status === 'under_review') || []
  const needsRevisionApps = applications?.filter(a => a.status === 'needs_revision') || []

  // Format date helper
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  // Get state abbreviation
  const getStateAbbr = (state: string) => {
    return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">License Applications</h1>
            <p className="text-gray-600 text-sm">
              Manage your in-process license applications and supporting documents
            </p>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
            New Application
          </Button>
        </div>

        {/* Search Bar */}
        <SearchInput
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Search applications by state..."
        />

        {/* Summary Cards */}
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

        {/* In Progress Section */}
        {inProgressApps.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">In Progress</h2>
            </div>

            <div className="space-y-4">
              {inProgressApps.map((application) => (
                <div key={application.id}>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {getStateAbbr(application.state)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{application.application_name}</h3>
                          <StatusBadge status={application.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                          <span>Started {formatDate(application.started_date)}</span>
                          <span>Last Updated {formatDate(application.last_updated_date)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-brand h-2 rounded-full transition-all"
                            style={{ width: `${application.progress_percentage || 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mb-2">{application.progress_percentage || 0}% complete</div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <button
                            onClick={() => setExpandedApplicationId(
                              expandedApplicationId === application.id ? null : application.id
                            )}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                            Application Documents {documentCounts[application.id] || 0}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UploadDocumentButton applicationId={application.id} />
                      <Link
                        href={`/pages/agency/applications/${application.id}`}
                        className="text-brand font-medium text-sm flex items-center gap-1"
                      >
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                  {expandedApplicationId === application.id && (
                    <div className="mt-4">
                      <ApplicationDocumentsPanel
                        applicationId={application.id}
                        documentCount={documentCounts[application.id] || 0}
                        onDocumentUploaded={() => {
                          // Refresh the page to update document counts
                          window.location.reload()
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Under Review Section */}
        {underReviewApps.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-yellow-600" />
              <h2 className="text-lg font-bold text-gray-900">Under Review</h2>
            </div>

            <div className="space-y-4">
              {underReviewApps.map((application) => (
                <div key={application.id}>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {getStateAbbr(application.state)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{application.application_name}</h3>
                          <StatusBadge status={application.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                          <span>Started {formatDate(application.started_date)}</span>
                          <span>Last Updated {formatDate(application.last_updated_date)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-brand h-2 rounded-full transition-all"
                            style={{ width: `${application.progress_percentage || 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mb-2">{application.progress_percentage || 0}% complete</div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <button
                            onClick={() => setExpandedApplicationId(
                              expandedApplicationId === application.id ? null : application.id
                            )}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                            Application Documents {documentCounts[application.id] || 0}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UploadDocumentButton applicationId={application.id} />
                      <Link
                        href={`/pages/agency/applications/${application.id}`}
                        className="text-brand font-medium text-sm flex items-center gap-1"
                      >
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                  {expandedApplicationId === application.id && (
                    <div className="mt-4">
                      <ApplicationDocumentsPanel
                        applicationId={application.id}
                        documentCount={documentCounts[application.id] || 0}
                        onDocumentUploaded={() => {
                          // Refresh the page to update document counts
                          window.location.reload()
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Needs Revision Section */}
        {needsRevisionApps.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-bold text-gray-900">Needs Revision</h2>
            </div>

            <div className="space-y-4">
              {needsRevisionApps.map((application) => (
                <div key={application.id}>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {getStateAbbr(application.state)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{application.application_name}</h3>
                          <StatusBadge status={application.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                          <span>Started {formatDate(application.started_date)}</span>
                          <span>Last Updated {formatDate(application.last_updated_date)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-brand h-2 rounded-full transition-all"
                            style={{ width: `${application.progress_percentage || 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mb-2">{application.progress_percentage || 0}% complete</div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <button
                            onClick={() => setExpandedApplicationId(
                              expandedApplicationId === application.id ? null : application.id
                            )}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                            Application Documents {documentCounts[application.id] || 0}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UploadDocumentButton applicationId={application.id} />
                      <Link
                        href={`/pages/agency/applications/${application.id}`}
                        className="text-brand font-medium text-sm flex items-center gap-1"
                      >
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                  {expandedApplicationId === application.id && (
                    <div className="mt-4">
                      <ApplicationDocumentsPanel
                        applicationId={application.id}
                        documentCount={documentCounts[application.id] || 0}
                        onDocumentUploaded={() => {
                          // Refresh the page to update document counts
                          window.location.reload()
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {applications?.length === 0 && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
            <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No applications yet</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first license application</p>
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              New Application
            </Button>
          </div>
        )}
      </div>

      <NewApplicationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

