'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  FileText, 
  Calendar, 
  Search,
  Clock,
  User,
  Loader2,
  Check,
  X,
  MapPin,
  Users
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'
import { acceptApplicationRequest } from '@/app/actions/applications'

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
  playbook_id?: string | null
  user_profiles: {
    full_name: string | null
    email: string | null
  } | null
}

interface Expert {
  id: string
  user_id: string
  first_name: string
  last_name: string
  email: string
  status: string
}

interface AdminLicensesContentProps {
  requestedApplications: Application[]
  allApplications: Application[]
  experts: Expert[]
  playbookSet?: Set<string>
}

export default function AdminLicensesContent({
  requestedApplications,
  allApplications,
  experts,
  playbookSet,
}: AdminLicensesContentProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'requested' | 'all'>('requested')
  const [searchQuery, setSearchQuery] = useState('')
  const [assignExpertModalOpen, setAssignExpertModalOpen] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [selectedExpertId, setSelectedExpertId] = useState<string>('')
  const [pendingAssignApplicationId, setPendingAssignApplicationId] = useState<string | null>(null)
  const [pendingApproveApplicationId, setPendingApproveApplicationId] = useState<string | null>(null)

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStateAbbr = (state: string) => {
    return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
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

  const handleAssignExpert = (application: Application) => {
    setSelectedApplication(application)
    const currentExpert = experts.find(e => e.id === application.assigned_expert_id)
    setSelectedExpertId(currentExpert ? currentExpert.id : '')
    setAssignExpertModalOpen(true)
  }

  const handleSaveExpertAssignment = async () => {
    if (!selectedApplication || !selectedExpertId) {
      alert('Please select an expert')
      return
    }

    setIsLoading(selectedApplication.id)
    try {
      const supabase = createClient()
      
      const expert = experts.find(e => e.id === selectedExpertId)
      if (!expert) {
        throw new Error('Expert not found')
      }

      const { error } = await q.updateApplicationById(supabase, selectedApplication.id, {
        assigned_expert_id: expert.id,
        last_updated_date: new Date().toISOString().split('T')[0]
      })

      if (error) {
        throw error
      }

      setAssignExpertModalOpen(false)
      setSelectedApplication(null)
      setSelectedExpertId('')
      setPendingAssignApplicationId(selectedApplication.id)
      router.refresh()
    } catch (err: any) {
      console.error('Error assigning expert:', err)
      alert('Failed to assign expert. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

   useEffect(() => {
    if (!pendingAssignApplicationId) return
    const app = requestedApplications.find(a => a.id === pendingAssignApplicationId)
    if (app?.assigned_expert_id) {
      setPendingAssignApplicationId(null)
    }
  }, [pendingAssignApplicationId, requestedApplications])

  useEffect(() => {
    if (!pendingApproveApplicationId) return
    const stillInList = requestedApplications.some(a => a.id === pendingApproveApplicationId)
    if (!stillInList) {
      setPendingApproveApplicationId(null)
    }
  }, [pendingApproveApplicationId, requestedApplications])

  const handleApprove = async (applicationId: string) => {
    const application = requestedApplications.find(a => a.id === applicationId)
    if (!application || !application.assigned_expert_id) {
      alert('Please assign an expert before approving the application')
      return
    }
    setIsLoading(applicationId)
    try {
      const { error } = await acceptApplicationRequest(applicationId)
      if (error) throw new Error(error)
      setPendingApproveApplicationId(applicationId)
      router.refresh()
    } catch (err: unknown) {
      console.error('Error approving application:', err)
      alert('Failed to approve application. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  const handleReject = async (applicationId: string) => {
    setIsLoading(applicationId)
    try {
      const supabase = createClient()
      
      // Update application status to 'rejected'
      const { error } = await q.updateApplicationById(supabase, applicationId, {
        status: 'rejected',
        last_updated_date: new Date().toISOString().split('T')[0]
      })

      if (error) {
        throw error
      }

      router.refresh()
    } catch (err: any) {
      console.error('Error rejecting application:', err)
      alert('Failed to reject application. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  // Filter applications based on search query
  const filterApplications = (apps: Application[]) => {
    if (!searchQuery) return apps
    const query = searchQuery.toLowerCase()
    return apps.filter(app => 
      app.application_name.toLowerCase().includes(query) ||
      app.state.toLowerCase().includes(query) ||
      app.user_profiles?.full_name?.toLowerCase().includes(query) ||
      app.user_profiles?.email?.toLowerCase().includes(query)
    )
  }

  const filteredRequested = filterApplications(requestedApplications)
  const filteredAll = filterApplications(allApplications)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search by application name, state, or owner..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('requested')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold transition-colors border-b-2 ${
            activeTab === 'requested'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-5 h-5" />
          Requested
          {requestedApplications.length > 0 && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              {requestedApplications.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold transition-colors border-b-2 ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-5 h-5" />
          All Applications
          {allApplications.length > 0 && (
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              {allApplications.length}
            </span>
          )}
        </button>
      </div>

      {/* Requested Applications Tab */}
      {activeTab === 'requested' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          {filteredRequested.length > 0 ? (
            <div className="space-y-4">
              {filteredRequested.map((application) => (
                <div key={application.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {getStateAbbr(application.state)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900 text-lg">{application.application_name}</h3>
                            {(!!application.playbook_id || playbookSet?.has(`${application.state}|${application.application_name}`)) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Program</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">
                              {application.user_profiles?.full_name || application.user_profiles?.email || 'Unknown Owner'}
                            </span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(application.status)}`}>
                          {getStatusDisplay(application.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 ml-16">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Submitted {formatDate(application.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {application.state}
                        </span>
                        {application.assigned_expert_id && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                            <Users className="w-3 h-3" />
                            Expert Assigned
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleAssignExpert(application)}
                        disabled={isLoading === application.id || pendingAssignApplicationId === application.id}
                        className="px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title={pendingAssignApplicationId === application.id ? 'Waiting for update...' : undefined}
                      >
                        {pendingAssignApplicationId === application.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                        {application.assigned_expert_id ? 'Change Expert' : 'Assign Expert'}
                      </button>
                      <button
                        onClick={() => handleReject(application.id)}
                        disabled={isLoading === application.id}
                        className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isLoading === application.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <X className="w-4 h-4" />
                            Reject
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleApprove(application.id)}
                        disabled={isLoading === application.id || !application.assigned_expert_id || pendingApproveApplicationId === application.id}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title={!application.assigned_expert_id ? 'Please assign an expert first before approving' : pendingApproveApplicationId === application.id ? 'Approved' : ''}
                      >
                        {isLoading === application.id || pendingApproveApplicationId === application.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            {(!!application.playbook_id || playbookSet?.has(`${application.state}|${application.application_name}`)) ? 'Approve & Launch' : 'Approve'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No requested applications</h3>
              <p className="text-gray-600">All application requests have been reviewed</p>
            </div>
          )}
        </div>
      )}

      {/* All Applications Tab */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {filteredAll.length > 0 ? (
            filteredAll.map((application) => (
              <div 
                key={application.id} 
                onClick={() => router.push(`/pages/admin/licenses/applications/${application.id}`)}
                className="bg-white rounded-xl shadow-md border border-gray-100 p-6 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                      {getStateAbbr(application.state)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{application.application_name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(application.status)}`}>
                          {getStatusDisplay(application.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {application.user_profiles?.full_name || application.user_profiles?.email || 'Unknown Owner'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Started {formatDate(application.started_date)}
                        </span>
                        {application.progress_percentage !== null && (
                          <span>{application.progress_percentage}% complete</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No applications found</h3>
              <p className="text-gray-600">Applications will appear here once they are approved</p>
            </div>
          )}
        </div>
      )}

      {/* Expert Assignment Modal */}
      <Modal 
        isOpen={assignExpertModalOpen} 
        onClose={() => {
          setAssignExpertModalOpen(false)
          setSelectedApplication(null)
          setSelectedExpertId('')
        }} 
        title="Assign Expert"
        size="md"
      >
        <div className="space-y-4">
          {selectedApplication && (
            <>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Application</p>
                <p className="font-semibold text-gray-900">{selectedApplication.application_name}</p>
                <p className="text-sm text-gray-600 mt-1">{selectedApplication.state}</p>
              </div>

              <div>
                <label htmlFor="expert-select" className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Expert <span className="text-red-500">*</span>
                </label>
                <select
                  id="expert-select"
                  value={selectedExpertId}
                  onChange={(e) => setSelectedExpertId(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  <option value="">Select an expert...</option>
                  {experts.map((expert) => (
                    <option key={expert.id} value={expert.id}>
                      {expert.first_name} {expert.last_name} ({expert.email})
                    </option>
                  ))}
                </select>
                {experts.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500">No active experts available. Please create experts first.</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setAssignExpertModalOpen(false)
                    setSelectedApplication(null)
                    setSelectedExpertId('')
                  }}
                  disabled={isLoading === selectedApplication.id}
                  className="px-6 py-2.5 text-gray-700 font-medium rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveExpertAssignment}
                  disabled={isLoading === selectedApplication.id || !selectedExpertId}
                  className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading === selectedApplication.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Assign Expert
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
