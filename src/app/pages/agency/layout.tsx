import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAgencyAllowedFeatures } from '@/lib/feature-access'
import DashboardLayout from '@/components/DashboardLayout'
import { getAgencyBrandingAction } from '@/app/actions/agencies'
import { hexDarken, hexLighten } from '@/lib/color-utils'

export default async function AgencyRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const role = (session.profile as { role?: string | null } | null)?.role
  if (role !== 'company_owner' && role !== 'care_coordinator') redirect('/pages/auth/login')

  const agencyId = (session.profile as { agency_id?: string | null } | null)?.agency_id ?? null
  const [allowedFeatures, branding] = await Promise.all([
    getAgencyAllowedFeatures(agencyId),
    agencyId ? getAgencyBrandingAction(agencyId) : Promise.resolve({ logoUrl: null, logoIconUrl: null, primaryColor: null, sidebarColor: null }),
  ])

  const cssVarParts: string[] = []
  if (branding.primaryColor) {
    cssVarParts.push(`--brand: ${branding.primaryColor};`)
    cssVarParts.push(`--brand-hover: ${hexDarken(branding.primaryColor)};`)
    cssVarParts.push(`--brand-subtle: ${hexLighten(branding.primaryColor)};`)
  }
  if (branding.sidebarColor) {
    cssVarParts.push(`--sidebar-bg: ${branding.sidebarColor};`)
  }
  const cssVars = cssVarParts.length > 0 ? cssVarParts.join(' ') : null

  return (
    <>
      {cssVars && <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />}
      <DashboardLayout
        user={{ id: session.user.id, email: session.user.email }}
        profile={session.profile}
        allowedFeatures={allowedFeatures}
        logoSrc={branding.logoUrl ?? undefined}
        logoIconSrc={branding.logoIconUrl ?? undefined}
      >
        {children}
      </DashboardLayout>
    </>
  )
}
