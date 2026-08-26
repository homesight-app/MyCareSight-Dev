'use client'

import { useSearchParams, useRouter } from 'next/navigation'

export default function AgencyUserManagementTabBar() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') === 'caregivers' ? 'caregivers' : 'people'

  return (
    <div className="border-b border-gray-200 flex gap-0">
      <button
        type="button"
        onClick={() => router.push('/pages/agency/user-management')}
        className={`px-6 py-3 text-sm font-medium transition-colors ${
          activeTab === 'people'
            ? 'border-b-2 border-blue-600 text-blue-700'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        People
      </button>
      <button
        type="button"
        onClick={() => router.push('/pages/agency/user-management?tab=caregivers')}
        className={`px-6 py-3 text-sm font-medium transition-colors ${
          activeTab === 'caregivers'
            ? 'border-b-2 border-blue-600 text-blue-700'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Caregivers
      </button>
    </div>
  )
}
