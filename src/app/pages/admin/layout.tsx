import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if ((session.profile as { role?: string | null } | null)?.role !== 'admin') redirect('/pages/agency')

  return (
    <AdminLayout
      user={{ id: session.user.id, email: session.user.email }}
      profile={session.profile}
    >
      {children}
    </AdminLayout>
  )
}
