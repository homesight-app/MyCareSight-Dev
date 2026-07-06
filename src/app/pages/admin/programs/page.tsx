import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import AdminLayout from '@/components/AdminLayout'
import { CheckCircle2, Clock, AlertCircle, Circle, ChevronRight } from 'lucide-react'

type Status = 'not_started' | 'in_progress' | 'review_needed' | 'approved' | 'not_applicable'

function computeProgress(items: { status: Status }[]) {
  const approved = items.filter(i => i.status === 'approved').length
  const inProgress = items.filter(i => i.status === 'in_progress').length
  const reviewNeeded = items.filter(i => i.status === 'review_needed').length
  const notStarted = items.filter(i => i.status === 'not_started').length
  const notApplicable = items.filter(i => i.status === 'not_applicable').length
  const countable = items.length - notApplicable
  const pct = countable > 0 ? Math.round((approved / countable) * 100) : 0
  return { approved, inProgress, reviewNeeded, notStarted, notApplicable, pct }
}

export default async function AdminProgramsPage() {
  const { user, profile } = await requireAdmin()
  const supabase = await createClient()

  const [{ count: unreadNotifications }, { data: appsData }] = await Promise.all([
    q.getUnreadNotificationsCount(supabase, user.id),
    q.getApplicationsWithPrograms(supabase),
  ])

  // Group items by application
  type RawRow = {
    id: string
    application_name: string
    state: string
    status: string
    agency_id: string | null
    assigned_expert_id: string | null
    agencies: { id: string; name: string } | null
    application_playbook_items: { status: Status; requirement_type: string }[]
  }

  const apps = (appsData ?? []) as unknown as RawRow[]
  // Filter to only applications that have playbook items
  const programs = apps.filter(a => a.application_playbook_items && a.application_playbook_items.length > 0)

  return (
    <AdminLayout user={user} profile={profile} unreadNotifications={unreadNotifications || 0}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active license application programs — track requirements, status, and progress.
          </p>
        </div>

        {programs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">No active programs yet</p>
            <p className="text-sm text-gray-500">
              Open a license application and click the Requirements tab to start tracking.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Agency</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Application</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">State</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Items</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {programs.map(app => {
                  const prog = computeProgress(app.application_playbook_items)
                  return (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {app.agencies?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{app.application_name}</td>
                      <td className="px-4 py-3 text-gray-500">{app.state}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${prog.pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{prog.pct}%</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {prog.approved > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-green-600">
                              <CheckCircle2 className="w-3 h-3" /> {prog.approved}
                            </span>
                          )}
                          {prog.reviewNeeded > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-600">
                              <AlertCircle className="w-3 h-3" /> {prog.reviewNeeded}
                            </span>
                          )}
                          {prog.inProgress > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-blue-600">
                              <Clock className="w-3 h-3" /> {prog.inProgress}
                            </span>
                          )}
                          {prog.notStarted > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-500">
                              <Circle className="w-3 h-3" /> {prog.notStarted}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {app.application_playbook_items.length} items
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/pages/admin/programs/${app.id}`}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
