import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export async function requireAdmin() {
  const session = await getSession() // free — memoized by React.cache
  if (!session) redirect('/pages/auth/login')
  if (!session.profile || (session.profile as { role?: string | null }).role !== 'admin') {
    redirect('/pages/agency')
  }
  return { user: session.user, profile: session.profile }
}
