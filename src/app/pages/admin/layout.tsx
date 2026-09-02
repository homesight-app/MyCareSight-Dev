import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { getSystemBranding } from '@/app/actions/system-settings'
import { buildBrandingStyleVars } from '@/lib/color-utils'

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  if ((session.profile as { role?: string | null } | null)?.role !== 'admin') redirect('/pages/agency')

  const branding = await getSystemBranding()
  const cssVars = buildBrandingStyleVars(branding)

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />}
      <AdminLayout
        user={{ id: session.user.id, email: session.user.email }}
        profile={session.profile}
        logoSrc={branding.logoUrl ?? undefined}
        logoIconSrc={branding.logoIconUrl ?? undefined}
      >
        {children}
      </AdminLayout>
    </>
  )
}
