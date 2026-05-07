import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { getMyStaffCertifications, type MyStaffCertificationUi } from '@/app/actions/staff-member-certifications'
import StaffLayout from '@/components/StaffLayout'
import Link from 'next/link'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Calendar,
  ChevronRight
} from 'lucide-react'

export default async function StaffDashboardPage() {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const supabase = await createClient()

  const { data: profile, error: profileError } = await q.getUserProfileFull(supabase, session.user.id)
  if (profileError || !profile) {
    redirect('/pages/auth/login?error=Unable to load user profile')
  }
  if (profile.role !== 'staff_member') {
    redirect('/pages/auth/login?error=Access denied. Staff member role required.')
  }

  const { data: staffMember, error: staffMemberError } = await q.getStaffMemberByUserId(supabase, session.user.id)
  if (staffMemberError || !staffMember) {
    redirect('/pages/auth/login?error=Staff member record not found. Please contact your administrator.')
  }

  const { data: applicationsData } = await q.getApplicationsByStaffMemberIdsAll(supabase, [staffMember.id])
  const applicationsOrdered = (applicationsData ?? []).slice().sort((a, b) => {
    const aDate = a.expiry_date ? new Date(a.expiry_date).getTime() : 0
    const bDate = b.expiry_date ? new Date(b.expiry_date).getTime() : 0
    return aDate - bDate
  })

  const myCertsResult = await getMyStaffCertifications()

  const applicationIds = (applicationsOrdered ?? []).map((app: { id: string }) => app.id)
  const { data: applicationDocuments } =
    applicationIds.length > 0 ? await q.getApplicationDocumentsApplicationIds(supabase, applicationIds) : { data: [] }

  const documentCounts = (applicationDocuments ?? []).reduce((acc: Record<string, number>, doc: { application_id: string }) => {
    acc[doc.application_id] = (acc[doc.application_id] || 0) + 1
    return acc
  }, {})

  type AppRow = {
    id: string
    application_name: string
    license_number: string | null
    state: string
    status: string
    issue_date: string | null
    expiry_date: string | null
    days_until_expiry?: number
    issuing_authority: string | null
    created_at: string
    updated_at: string | null
  }
  const applicationsAsLicenses = (applicationsOrdered as AppRow[] | undefined)?.map(app => ({
    id: app.id,
    license_type: app.application_name,
    license_number: app.license_number || 'N/A',
    state: app.state,
    status:
      app.status === 'approved'
        ? 'active'
        : app.status === 'rejected' || app.status === 'closed'
          ? 'expired'
          : 'pending',
    issue_date: app.issue_date,
    expiry_date: app.expiry_date,
    days_until_expiry: app.days_until_expiry,
    issuing_authority: app.issuing_authority,
    activated_date: app.issue_date,
    renewal_due_date: app.expiry_date ? (() => {
      const expiry = new Date(app.expiry_date)
      const renewal = new Date(expiry)
      renewal.setDate(renewal.getDate() - 90)
      return renewal.toISOString().split('T')[0]
    })() : null,
    documents_count: documentCounts[app.id] || 0,
    source: 'application' as const
  })) || []

  /** Same rows as /pages/caregiver/my-certifications (caregiver_credentials). */
  function mapMyCertUiToDashboardLicense(c: MyStaffCertificationUi) {
    const expiryDate = c.expiration_date
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    let normStatus: 'active' | 'expiring' | 'expired' = 'active'
    if (daysUntilExpiry <= 0) normStatus = 'expired'
    else if (daysUntilExpiry <= 90) normStatus = 'expiring'

    return {
      id: c.id,
      license_type: c.type,
      license_number: c.license_number,
      state: c.state,
      status: normStatus,
      issue_date: c.issue_date,
      expiry_date: c.expiration_date,
      days_until_expiry: daysUntilExpiry,
      issuing_authority: c.issuing_authority,
      activated_date: c.issue_date,
      renewal_due_date: expiryDate
        ? (() => {
            const renewal = new Date(expiryDate)
            renewal.setDate(renewal.getDate() - 90)
            return renewal.toISOString().split('T')[0]
          })()
        : null,
      documents_count: c.document_url ? 1 : 0,
      source: 'my_certifications' as const,
    }
  }

  const myCertificationsAsLicenses = (myCertsResult.data ?? []).map(mapMyCertUiToDashboardLicense)

  // Applications (in-progress) + same certification list as My certifications page
  const allLicensesSorted = [...applicationsAsLicenses, ...myCertificationsAsLicenses].sort((a, b) => {
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
  }).reverse()

  const expiringList = allLicensesSorted

  const staffLicenses = [...applicationsAsLicenses, ...myCertificationsAsLicenses].sort((a, b) => {
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
  }).reverse().splice(0, 3)
  
  const { count: unreadNotificationsCount } = await q.getUnreadNotificationsCount(supabase, session.user.id)
  const unreadNotifications = unreadNotificationsCount ?? 0

  // Calculate statistics from full list (not only preview rows)
  const today = new Date()
  const activeLicenses = allLicensesSorted?.filter(l => {
    if (l.status === 'active' && l.expiry_date) {
      const expiryDate = new Date(l.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return daysUntilExpiry > 0
    }
    return false
  }).length || 0

  const expiringSoon = allLicensesSorted?.filter(l => {
    if (l.days_until_expiry !== null && l.days_until_expiry !== undefined) {
      return l.days_until_expiry <= 90 && l.days_until_expiry > 0 && l.status === 'active'
    }
    return false
  }).length || 0

  const expiredLicenses = allLicensesSorted?.filter(l => {
    if (l.status === 'expired') {
      return true
    }
    if (l.days_until_expiry !== null && l.days_until_expiry !== undefined) {
      return l.days_until_expiry <= 0
    }
    return false
  }).length || 0

  // Get licenses expiring within 90 days
  const licensesExpiringSoon = allLicensesSorted?.slice().reverse().filter(l => {
    if (l.days_until_expiry !== null && l.days_until_expiry !== undefined) {
      return l.days_until_expiry <= 90 && l.days_until_expiry > 0 && l.status === 'active'
    }
    return false
  }) || []

  // Format date helper (for display in cards)
  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Format date for table (MM/DD/YYYY)
  const formatTableDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }

  // Get state abbreviation (first 2 letters, uppercase)
  const getStateAbbr = (state: string | null | undefined) => {
    if (!state) return 'N/A'
    return state.substring(0, 2).toUpperCase()
  }

  // Calculate days until expiry
  const getDaysUntilExpiry = (expiryDate: string | Date) => {
    const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
    const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  return (
    <StaffLayout 
      user={session.user} 
      profile={profile} 
      unreadNotifications={unreadNotifications}
    >
      <div className="space-y-5 mt-20">
        {/* Title and Subtitle — match My Care Visits typography */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My License Dashboard</h1>
          <p className="text-sm text-gray-600">Track and manage your professional licenses and certifications.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Active Licenses */}
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{activeLicenses}</div>
              <div className="text-sm text-gray-600">Active Licenses</div>
            </div>
          </div>

          {/* Expiring Soon */}
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{expiringSoon}</div>
              <div className="text-sm text-gray-600">Expiring Soon</div>
            </div>
          </div>

          {/* Expired Licenses */}
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{expiredLicenses}</div>
              <div className="text-sm text-gray-600">Expired Licenses</div>
            </div>
          </div>
        </div>

        {/* Action Required: Licenses Expiring Soon */}
        {/* {licensesExpiringSoon.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 md:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-2">
                  Action Required: License Expiring Soon
                </h2>
                <p className="text-sm md:text-base text-gray-700 mb-3">
                  You have {licensesExpiringSoon.length} license(s) expiring within 90 days. Please renew them to maintain your active status.
                </p>
                {licensesExpiringSoon[0] && (
                  <p className="text-sm text-gray-600">
                    {licensesExpiringSoon[0].license_type} / Expires in {licensesExpiringSoon[0].days_until_expiry || getDaysUntilExpiry(licensesExpiringSoon[0].expiry_date)} days
                  </p>
                )}
              </div>
              <Link
                href={`/pages/caregiver/my-certifications/${licensesExpiringSoon[0].id}`}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm md:text-base whitespace-nowrap"
              >
                Renew
              </Link>
            </div>
          </div>
        )} */}

        {/* All Licenses & Certifications */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-lg font-bold text-gray-900">All Licenses & Certifications</h2>
            <Link
              href="/pages/caregiver/my-certifications?action=add"
              className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add License
            </Link>
          </div>

          {expiringList && expiringList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">STATE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">LICENSE NAME</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">STATUS</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ACTIVATED DATE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">EXPIRY DATE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">RENEWAL DUE DATE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">DOCUMENTS</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {expiringList.map((license) => {
                    const daysUntilExpiry = license.days_until_expiry !== null && license.days_until_expiry !== undefined
                      ? license.days_until_expiry
                      : license.expiry_date ? getDaysUntilExpiry(license.expiry_date) : 0
                    
                    let status = license.status
                    if (status === 'active' && daysUntilExpiry <= 0) {
                      status = 'expired'
                    } else if (status === 'active' && daysUntilExpiry <= 90 && daysUntilExpiry > 0) {
                      status = 'expiring'
                    }

                    return (
                      <tr key={license.id} className="hover:bg-gray-50 transition-colors">
                        {/* STATE */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center w-10 h-10 bg-blue-600 text-white text-xs font-semibold rounded">
                            {getStateAbbr(license.state)}
                          </span>
                        </td>

                        {/* LICENSE NAME */}
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">{license.license_type}</div>
                        </td>

                        {/* STATUS */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-black text-white">
                            {status === 'active'
                              ? 'Active'
                              : status === 'expiring'
                                ? 'Expiring Soon'
                                : status === 'pending'
                                  ? 'Pending'
                                  : 'Expired'}
                          </span>
                        </td>

                        {/* ACTIVATED DATE */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>{formatTableDate(license.activated_date)}</span>
                          </div>
                        </td>

                        {/* EXPIRY DATE */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>{formatTableDate(license.expiry_date)}</span>
                          </div>
                        </td>

                        {/* RENEWAL DUE DATE */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>{formatTableDate(license.renewal_due_date)}</span>
                          </div>
                        </td>

                        {/* DOCUMENTS */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span>{license.documents_count}</span>
                          </div>
                        </td>

                        {/* ACTIONS */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {/* <Link
                            href={license.source === 'certification' 
                              ? `/pages/caregiver/my-certifications/${license.id}`
                              : `/pages/caregiver/my-certifications/${license.id}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            View Details
                            <ChevronRight className="w-4 h-4" />
                          </Link> */}
                          
                          <Link
                            href={`/pages/caregiver/my-certifications/${license.id}`}
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
                          >
                            Renew
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">No licenses yet</h3>
              <p className="text-sm text-gray-600 mb-4">Get started by adding your first license or certification</p>
              <Link
                href="/pages/caregiver/my-certifications?action=add"
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add License
              </Link>
            </div>
          )}
        </div>

      </div>
    </StaffLayout>
  )
}

