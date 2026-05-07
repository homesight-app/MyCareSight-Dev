'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  MapPin,
  FileText,
  Search,
  Calendar,
  AlertCircle,
  Loader2,
  Building2,
} from 'lucide-react'

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
  agency_id?: string | null
}

interface ExpertClientsContentProps {
  applications: Application[]
  totalApplications: number
  activeApplications: number
  pendingReviews: number
  agencyNames?: Record<string, string>
}

export default function ExpertClientsContent({
  applications: applicationsProp,
  totalApplications,
  activeApplications,
  pendingReviews,
  agencyNames = {},
}: ExpertClientsContentProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingApplicationId, setLoadingApplicationId] = useState<string | null>(null)

  // Ensure applications is not null/undefined
  const applications = applicationsProp || []

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
      case 'closed':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusDisplay = (status: string) => {
    if (status === 'closed') return 'Closed'
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  // Filter applications based on search query
  const filteredApplications = applications.filter(app => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const name = (app.application_name || '').toLowerCase()
    const state = (app.state || '').toLowerCase()
    const agency = (app.agency_id ? (agencyNames[app.agency_id] || '') : '').toLowerCase()
    return name.includes(query) || state.includes(query) || agency.includes(query)
  })

  return (
    <div className="space-y-4 sm:space-y-6 mt-20">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Licenses</h1>
        <p className="text-gray-600 text-xs sm:text-sm">
          Manage and review your assigned license applications
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search applications by name or state..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          suppressHydrationWarning
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Applications */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{totalApplications}</div>
          <div className="text-xs sm:text-sm text-gray-600">Total Applications</div>
        </div>

        {/* Active Applications */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{activeApplications}</div>
          <div className="text-xs sm:text-sm text-gray-600">Active Applications</div>
        </div>

        {/* Pending Reviews */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{pendingReviews}</div>
          <div className="text-xs sm:text-sm text-gray-600">Pending Reviews</div>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          {filteredApplications.length > 0 ? (
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Application Name</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Agency</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">State</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Progress</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">Started</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Last Updated</th>
                  <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApplications.map((application) => (
                  <tr 
                    key={application.id} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/pages/expert/applications/${application.id}`)}
                  >
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{application.application_name}</div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-900">
                          {(application.agency_id && agencyNames[application.agency_id]) || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{application.state}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(application.status)}`}>
                        {getStatusDisplay(application.status)}
                      </span>
                      {(application.status === 'under_review' || application.status === 'needs_revision') && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-yellow-700">
                          <AlertCircle className="w-3 h-3" />
                          <span>Requires Review</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      {application.progress_percentage !== null ? (
                        <div className="w-32">
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${application.progress_percentage}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500">{application.progress_percentage}%</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600 hidden md:table-cell">
                      {application.started_date ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatDate(application.started_date)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-600 hidden lg:table-cell">
                      {application.last_updated_date ? (
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span>{formatDate(application.last_updated_date)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setLoadingApplicationId(application.id)
                          router.push(`/pages/expert/applications/${application.id}`)
                        }}
                        disabled={loadingApplicationId === application.id}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {loadingApplicationId === application.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'View Details'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 sm:p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No applications assigned</h3>
              <p className="text-gray-600">
                {searchQuery 
                  ? 'No applications match your search criteria.' 
                  : 'You don\'t have any assigned applications yet. Once applications are assigned to you, they will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
