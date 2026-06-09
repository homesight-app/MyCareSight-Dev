import { createAdminClient } from '@/lib/supabase/admin'
import * as q from '@/lib/supabase/query'
import AgencyOnboardingForm from '@/components/AgencyOnboardingForm'

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: tokenData } = await q.getOnboardingTokenByValue(supabase, token)

  const isExpired = !tokenData || new Date(tokenData.expires_at) <= new Date()

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center border border-gray-100">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Expired or Invalid</h1>
          <p className="text-gray-600 text-sm">
            This onboarding link is no longer valid. Please contact HomeSights to receive a new link.
          </p>
        </div>
      </div>
    )
  }

  const [{ data: agency }, { data: keyStaff }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', tokenData.agency_id).single(),
    q.getKeyStaffByAgencyId(supabase, tokenData.agency_id),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <AgencyOnboardingForm
        tokenValue={token}
        agency={agency}
        keyStaff={keyStaff ?? []}
      />
    </div>
  )
}
