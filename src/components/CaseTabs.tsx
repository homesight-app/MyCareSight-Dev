'use client'

import { useState } from 'react'
import { CheckCircle2, FileText, Activity } from 'lucide-react'
import Tabs from '@/components/ui/Tabs'

interface ChecklistItem {
  id: string
  title: string
  completed: boolean
  completedDate?: string
  category: 'business_setup' | 'licensing'
}

interface Document {
  id: string
  title: string
  category: string
  date: string
  status: 'completed' | 'draft' | 'pending'
}

interface ActivityLogItem {
  id: string
  type: string
  title: string
  description: string
  actor: string
  timestamp: string
}

interface CaseTabsProps {
  caseId: string
  checklistItems: ChecklistItem[]
  documents: Document[]
  activityLog: ActivityLogItem[]
  caseData: {
    steps_count?: number
    documents_count?: number
    updated_at?: string | Date | null
    last_activity?: string | Date | null
  }
  daysActive: number
  recentActivity: Array<{
    type: string
    message: string
    date: Date
  }>
}

export default function CaseTabs({ caseId, checklistItems, documents, activityLog, caseData, daysActive, recentActivity }: CaseTabsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'checklist' | 'documents' | 'activity'>('overview')

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
  }

  const formatDateTime = (date: string | Date | null | undefined) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const completedChecklistCount = checklistItems.filter(item => item.completed).length
  const totalChecklistCount = checklistItems.length
  const completedDocumentsCount = documents.filter(doc => doc.status === 'completed').length
  const totalDocumentsCount = documents.length

  const businessSetupItems = checklistItems.filter(item => item.category === 'business_setup')
  const licensingItems = checklistItems.filter(item => item.category === 'licensing')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100">
      {/* Tabs Navigation */}
      <Tabs
        variant="underline"
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'checklist', label: 'Checklist' },
          { key: 'documents', label: 'Documents' },
          { key: 'activity', label: 'Activity Log' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as 'overview' | 'checklist' | 'documents' | 'activity')}
      />

      {/* Tab Content */}
      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Progress Summary */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Progress Summary</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Steps Completed</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {caseData.steps_count || 0}/{8}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all"
                      style={{ width: `${((caseData.steps_count || 0) / 8) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Documents Completed</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {caseData.documents_count || 0}/{6}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-green-600 h-2.5 rounded-full transition-all"
                      style={{ width: `${((caseData.documents_count || 0) / 6) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Days Active</span>
                    <span className="text-sm font-semibold text-gray-900">{daysActive} days</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Updated</span>
                    <span className="text-sm font-semibold text-gray-900">{formatDate(caseData.updated_at || caseData.last_activity)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatDateTime(activity.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Checklist Tab */}
        {activeTab === 'checklist' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Licensing Checklist</h2>
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{completedChecklistCount}</span>/{totalChecklistCount} completed
              </div>
            </div>

            {/* Business Setup Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Setup</h3>
              <div className="space-y-3">
                {businessSetupItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {item.completed ? (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex-shrink-0 mt-0.5"></div>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{item.title}</div>
                      {item.completed && item.completedDate && (
                        <div className="text-xs text-gray-500 mt-1">Completed {formatDate(item.completedDate)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Licensing Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Licensing</h3>
              <div className="space-y-3">
                {licensingItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {item.completed ? (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex-shrink-0 mt-0.5"></div>
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{item.title}</div>
                      {item.completed && item.completedDate && (
                        <div className="text-xs text-gray-500 mt-1">Completed {formatDate(item.completedDate)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Documents</h2>
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{completedDocumentsCount}</span> / {totalDocumentsCount} completed
              </div>
            </div>

            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{doc.category}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-gray-600">{formatDate(doc.date)}</div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(doc.status)}`}>
                      {doc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Activity Log</h2>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              
              <div className="space-y-6">
                {activityLog.map((activity, index) => (
                  <div key={activity.id} className="relative flex items-start gap-4">
                    {/* Timeline icon */}
                    <div className="relative z-10 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Activity className="w-4 h-4 text-blue-600" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{activity.title}:</div>
                          <div className="text-sm text-gray-600 mt-1">{activity.description}</div>
                          <div className="text-xs text-gray-500 mt-1">by {activity.actor}</div>
                        </div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(activity.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
