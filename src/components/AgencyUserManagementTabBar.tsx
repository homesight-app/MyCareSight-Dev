'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import Tabs from '@/components/ui/Tabs'

export default function AgencyUserManagementTabBar() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') === 'caregivers' ? 'caregivers' : 'people'

  const handleChange = (key: string) => {
    if (key === 'caregivers') {
      router.push('/pages/agency/user-management?tab=caregivers')
    } else {
      router.push('/pages/agency/user-management')
    }
  }

  return (
    <Tabs
      variant="underline"
      items={[
        { key: 'people', label: 'People' },
        { key: 'caregivers', label: 'Caregivers' },
      ]}
      active={activeTab}
      onChange={handleChange}
    />
  )
}
