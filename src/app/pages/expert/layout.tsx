import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ExpertDashboardLayout from '@/components/ExpertDashboardLayout'
import { getSystemBranding } from '@/app/actions/system-settings'
import { buildBrandingStyleVars } from '@/lib/color-utils'

export default async function ExpertRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')
  const role = (session.profile as { role?: string | null } | null)?.role
  if (role !== 'expert') redirect('/pages/auth/login')

  const branding = await getSystemBranding()
  const cssVars = buildBrandingStyleVars(branding)

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />}
      <ExpertDashboardLayout
        user={{ id: session.user.id, email: session.user.email }}
        profile={session.profile}
        logoSrc={branding.logoUrl ?? undefined}
        logoIconSrc={branding.logoIconUrl ?? undefined}
      >
        {children}
      </ExpertDashboardLayout>
    </>
  )
}
