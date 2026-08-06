import { getSession } from '@/lib/auth'
import ProfileTabs from '@/components/ProfileTabs'

export default async function ExpertProfilePage() {
  const session = await getSession()
  const profile = session!.profile

  // Get recent activity (placeholder - you can create an activity log table later)
  const recentActivity = [
    { id: '1', action: 'Profile information updated', icon: 'person', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { id: '2', action: 'Password changed', icon: 'key', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { id: '3', action: 'New device login', icon: 'shield', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { id: '4', action: 'Notification preferences updated', icon: 'bell', date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    { id: '5', action: 'Company details updated', icon: 'building', date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-20">
        {/* Main Profile Section */}
        <div className="lg:col-span-2">
          <ProfileTabs user={session!.user} profile={profile} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4 sm:space-y-6">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Recent Activity</h3>
                <p className="text-xs text-gray-500">Your account activity over the last 30 days</p>
              </div>
            </div>

            <div className="space-y-3">
              {recentActivity.map((activity) => {
                const getIcon = (icon: string) => {
                  const iconClass = "w-4 h-4 text-gray-400"
                  switch (icon) {
                    case 'person':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )
                    case 'key':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      )
                    case 'shield':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      )
                    case 'bell':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      )
                    case 'building':
                      return (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )
                    default:
                      return null
                  }
                }

                const getDaysAgo = (date: Date) => {
                  const now = new Date()
                  const diffTime = Math.abs(now.getTime() - date.getTime())
                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
                  if (diffDays === 0) return 'Today'
                  if (diffDays === 1) return '1 day ago'
                  return `${diffDays} days ago`
                }

                return (
                  <div key={activity.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="mt-0.5">{getIcon(activity.icon)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900">{activity.action}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{getDaysAgo(activity.date)}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button className="w-full mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
              View All Activity
            </button>
          </div>

          {/* Account Status */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6">
            <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4">Account Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Profile Completion</span>
                <span className="text-sm font-semibold text-gray-900">85%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Security Score</span>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  Strong
                </span>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}

