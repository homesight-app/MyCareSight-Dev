import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import StaffLayout from '@/components/StaffLayout'

export default async function CaregiverRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if ((session.profile as { role?: string | null } | null)?.role !== 'staff_member') redirect('/pages/auth/login')

  return (
    <StaffLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
    >
      {children}
    </StaffLayout>
  )
}
