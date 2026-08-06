import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardLayout from '@/components/DashboardLayout'

export default async function AgencyRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const role = (session.profile as { role?: string | null } | null)?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/auth/login')

  return (
    <DashboardLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
    >
      {children}
    </DashboardLayout>
  )
}
