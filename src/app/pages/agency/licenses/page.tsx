import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function LicensesPage() {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  redirect('/pages/agency')
}
