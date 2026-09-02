import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import { getUnifiedCaregiverCertificationDetail } from '@/app/actions/staff-member-certifications'
import {
  Award,
  Calendar,
  MapPin,
  Building,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react'
import CertificationDocumentViewer from '@/components/CertificationDocumentViewer'
import PageHeader from '@/components/ui/PageHeader'

export default async function CertificationDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()

  if (!session) {
    redirect('/pages/auth/login')
  }

  const { id } = await params
  const supabase = await createClient()

  const unified = await getUnifiedCaregiverCertificationDetail(id)
  let certification = unified.data
  let isApplication = false
  let application = null

  if (!certification) {
    const { data: staffMember } = await q.getStaffMemberByUserId(supabase, session.user.id)

    if (staffMember) {
      const { data: appData, error: appError } = await q.getApplicationByIdAndStaffMemberId(
        supabase,
        id,
        staffMember.id
      )

      if (!appError && appData) {
        isApplication = true
        application = appData
        certification = {
          id: appData.id,
          type: appData.application_name,
          license_number: appData.license_number || 'N/A',
          state: appData.state,
          issue_date: appData.issue_date,
          expiration_date: appData.expiry_date,
          issuing_authority: appData.issuing_authority || 'N/A',
          status: appData.status === 'approved' ? 'Active' : appData.status === 'rejected' ? 'Expired' : 'Active',
          document_url: null,
          created_at: appData.created_at,
          updated_at: appData.updated_at || appData.created_at,
        }
      } else {
        redirect('/pages/caregiver/my-certifications?error=Certification or license not found')
      }
    } else {
      redirect('/pages/caregiver/my-certifications?error=Certification not found')
    }
  }

  if (!certification) {
    redirect('/pages/caregiver/my-certifications?error=Certification not found')
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A'
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string, expirationDate: string | null) => {
    const today = new Date()
    
    // Handle null expiration date
    if (!expirationDate) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 flex items-center gap-1">
          <Clock className="w-4 h-4" />
          No Expiry Date
        </span>
      )
    }
    
    const expiry = new Date(expirationDate)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (status === 'Expired' || daysUntilExpiry <= 0) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1">
          <XCircle className="w-4 h-4" />
          Expired
        </span>
      )
    } else if (daysUntilExpiry <= 90) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 flex items-center gap-1">
          <Clock className="w-4 h-4" />
          Expiring Soon
        </span>
      )
    } else {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1">
          <CheckCircle2 className="w-4 h-4" />
          Active
        </span>
      )
    }
  }

  return (
    <div className="space-y-5 mt-20">
        <PageHeader
          title={certification.type}
          subtitle="Certification Details"
          back={{
            href: isApplication ? '/pages/caregiver' : '/pages/caregiver/my-certifications',
            label: isApplication ? 'Back to Dashboard' : 'Back to Certifications',
          }}
          actions={getStatusBadge(certification.status, certification.expiration_date)}
        />

        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Certification Information */}
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  Certification Information
                </h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Certification Type</p>
                    <p className="text-base font-medium text-gray-900">{certification.type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">License/Certification Number</p>
                    <p className="text-base font-medium text-gray-900">{certification.license_number}</p>
                  </div>
                  {certification.state && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        State
                      </p>
                      <p className="text-base font-medium text-gray-900">{certification.state}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                      <Building className="w-4 h-4" />
                      Issuing Authority
                    </p>
                    <p className="text-base font-medium text-gray-900">{certification.issuing_authority}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates and Status */}
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Important Dates
                </h2>
                <div className="space-y-4">
                  {certification.issue_date && (
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Issue Date</p>
                      <p className="text-base font-medium text-gray-900">
                        {formatDate(certification.issue_date)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Expiration Date</p>
                    <p className="text-base font-medium text-gray-900">
                      {formatDate(certification.expiration_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Status</p>
                    <div className="mt-1">
                      {getStatusBadge(certification.status, certification.expiration_date)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Document Section */}
          <CertificationDocumentViewer
            documentUrl={certification.document_url}
            certificationName={certification.type}
          />

          {/* Metadata */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
              <div>
                <p className="mb-1">Created</p>
                <p className="font-medium text-gray-900">
                  {formatDate(certification.created_at)}
                </p>
              </div>
              <div>
                <p className="mb-1">Last Updated</p>
                <p className="font-medium text-gray-900">
                  {formatDate(certification.updated_at)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}
