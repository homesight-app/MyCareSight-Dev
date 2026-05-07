import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import CaseTabs from '@/components/CaseTabs'
import Link from 'next/link'
import { 
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  Clock
} from 'lucide-react'

export default async function CaseDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { user, profile } = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: caseItem }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getCaseById(supabase, id)
  ])

  if (!caseItem) {
    redirect('/pages/admin')
  }

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'in progress'
      case 'under_review':
        return 'under review'
      case 'approved':
        return 'approved'
      case 'rejected':
        return 'rejected'
      default:
        return status.replace('_', ' ')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'under_review':
        return 'bg-yellow-100 text-yellow-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Calculate days active
  const startDate = caseItem.started_date || caseItem.created_at
  const daysActive = startDate 
    ? Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  // Mock checklist items (you can replace this with actual data from your database)
  const checklistItems = [
    // Business Setup
    {
      id: '1',
      title: 'Establish Business Entity',
      completed: true,
      completedDate: '2025-09-19',
      category: 'business_setup' as const
    },
    {
      id: '2',
      title: 'Obtain EIN',
      completed: true,
      completedDate: '2025-09-21',
      category: 'business_setup' as const
    },
    // Licensing
    {
      id: '3',
      title: 'Apply for Business License',
      completed: true,
      completedDate: '2025-09-30',
      category: 'licensing' as const
    },
    {
      id: '4',
      title: 'Background Check',
      completed: true,
      completedDate: '2025-10-04',
      category: 'licensing' as const
    },
    {
      id: '5',
      title: 'Facility Inspection',
      completed: false,
      category: 'licensing' as const
    },
    {
      id: '6',
      title: 'Obtain Insurance',
      completed: false,
      category: 'licensing' as const
    },
    {
      id: '7',
      title: 'Create Policies & Procedures',
      completed: false,
      category: 'licensing' as const
    },
    {
      id: '8',
      title: 'Complete Required Training',
      completed: false,
      category: 'licensing' as const
    }
  ]

  // Mock documents (you can replace this with actual data from your database)
  const documents = [
    {
      id: '1',
      title: 'License Application Form',
      category: 'Application',
      date: '2025-10-19',
      status: 'completed' as const
    },
    {
      id: '2',
      title: 'Business Plan',
      category: 'Business',
      date: '2025-10-20',
      status: 'completed' as const
    },
    {
      id: '3',
      title: 'Policies & Procedures Manual',
      category: 'Operational',
      date: '2025-10-18',
      status: 'completed' as const
    },
    {
      id: '4',
      title: 'Facility Floor Plan',
      category: 'Facility',
      date: '2025-10-17',
      status: 'completed' as const
    },
    {
      id: '5',
      title: 'Staff Roster & Qualifications',
      category: 'Personnel',
      date: '2025-10-21',
      status: 'draft' as const
    },
    {
      id: '6',
      title: 'Emergency Response Plan',
      category: 'Safety',
      date: '2025-10-16',
      status: 'pending' as const
    }
  ]

  // Mock activity log (you can replace this with actual data from your database)
  const activityLog = [
    {
      id: '1',
      type: 'document',
      title: 'Document uploaded',
      description: 'Staff Roster & Qualifications uploaded',
      actor: 'Maria Garcia',
      timestamp: '2025-10-22T14:30:00'
    },
    {
      id: '2',
      type: 'checklist',
      title: 'Checklist updated',
      description: 'Background Check marked as complete',
      actor: 'Maria Garcia',
      timestamp: '2025-10-21T10:15:00'
    },
    {
      id: '3',
      type: 'document',
      title: 'Document generated',
      description: 'Business Plan generated from template',
      actor: 'Maria Garcia',
      timestamp: '2025-10-20T16:45:00'
    },
    {
      id: '4',
      type: 'status',
      title: 'Status change',
      description: 'Case status changed to in progress',
      actor: 'System',
      timestamp: '2025-10-19T09:20:00'
    },
    {
      id: '5',
      type: 'created',
      title: 'Case created',
      description: 'New license application started',
      actor: 'Maria Garcia',
      timestamp: caseItem.started_date || caseItem.created_at || new Date().toISOString()
    }
  ]

  // Mock recent activity for Overview tab
  const recentActivity = [
    {
      type: 'document',
      message: 'Document uploaded: Staff Roster & Qualifications uploaded',
      date: new Date('2025-10-22T14:30:00')
    },
    {
      type: 'checklist',
      message: 'Checklist updated: Background Check marked as complete',
      date: new Date('2025-10-21T10:15:00')
    },
    {
      type: 'document',
      message: 'Document generated: Business Plan generated from template',
      date: new Date('2025-10-20T16:45:00')
    },
    {
      type: 'status',
      message: 'Status change: Case status changed to in-progress',
      date: new Date('2025-10-19T09:20:00')
    },
    {
      type: 'created',
      message: 'Case created: New license application started',
      date: new Date(caseItem.started_date || caseItem.created_at || new Date())
    }
  ]

  return (
    <AdminLayout 
      user={{ id: user.id, email: user.email }} 
      profile={profile} 
      unreadNotifications={unreadNotifications || 0}
    >
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Link 
              href="/pages/admin"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Cases
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{caseItem.business_name}</h1>
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(caseItem.status)}`}>
                {getStatusLabel(caseItem.status)}
              </span>
            </div>
            <p className="text-sm text-gray-600">Case ID: {caseItem.case_id}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Overall Progress</div>
            <div className="text-2xl font-bold text-gray-900">{caseItem.progress_percentage || 0}%</div>
          </div>
        </div>

        {/* Information Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Owner</div>
                <div className="text-sm font-semibold text-gray-900">{caseItem.owner_name || 'N/A'}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">State</div>
                <div className="text-sm font-semibold text-gray-900">{caseItem.state || 'N/A'}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Start Date</div>
                <div className="text-sm font-semibold text-gray-900">{formatDate(caseItem.started_date || caseItem.created_at)}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Last Activity</div>
                <div className="text-sm font-semibold text-gray-900">{formatDate(caseItem.last_activity)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Component with Overview, Checklist, Documents, and Activity Log */}
        <CaseTabs
          caseId={id}
          checklistItems={checklistItems}
          documents={documents}
          activityLog={activityLog}
          caseData={{
            steps_count: caseItem.steps_count,
            documents_count: caseItem.documents_count,
            updated_at: caseItem.updated_at,
            last_activity: caseItem.last_activity
          }}
          daysActive={daysActive}
          recentActivity={recentActivity}
        />
      </div>
    </AdminLayout>
  )
}
