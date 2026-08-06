import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'

export default async function ExpertRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = (session.profile as { role?: string | null } | null)?.role
  if (role !== 'expert') redirect('/pages/auth/login')

  return (
    <ExpertDashboardLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
    >
      {children}
    </ExpertDashboardLayout>
  )
}
