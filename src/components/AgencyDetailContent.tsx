'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Globe,
  MapPin,
  Hash,
  Briefcase,
  FileText,
  Users,
  Calendar,
} from 'lucide-react'
import CreateLicenseModal from './CreateLicenseModal'
import AgencyAdminsSection from './AgencyAdminsSection'
import ApplyForNewLicenseButton from './ApplyForNewLicenseButton'

interface Agency {
  id: string
  name: string
  business_type?: string | null
  tax_id?: string | null
  primary_license_number?: string | null
  website?: string | null
  physical_street_address?: string | null
  physical_city?: string | null
  physical_state?: string | null
  physical_zip_code?: string | null
  mailing_street_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip_code?: string | null
  same_as_physical?: boolean | null
}

interface License {
  id: string
  license_name: string
  license_number?: string | null
  state: string
  status: string
  activated_date?: string | null
  expiry_date?: string | null
  renewal_due_date?: string | null
  created_at: string
}

interface Application {
  id: string
  application_name: string
  state: string
  status: string
  progress_percentage?: number | null
  submitted_date?: string | null
  started_date?: string | null
  last_updated_date?: string | null
  created_at: string
}

interface AgencyAdmin {
  id: string
  contact_name?: string | null
  contact_email?: string | null
}

interface AgencyDetailContentProps {
  agency: Agency
  licenses: License[]
  applications: Application[]
  agencyAdmins: AgencyAdmin[]
  availableAdmins: AgencyAdmin[]
  backPath: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-100 text-red-700',
}

const APP_STATUS_COLORS: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  under_review: 'bg-purple-100 text-purple-700',
  needs_revision: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  closed: 'bg-gray-100 text-gray-600',
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function isExpiringSoon(expiryDate?: string | null) {
  if (!expiryDate) return false
  const diff = new Date(expiryDate).getTime() - Date.now()
  return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000
}

export default function AgencyDetailContent({
  agency,
  licenses,
  applications,
  agencyAdmins,
  availableAdmins,
  backPath,
}: AgencyDetailContentProps) {
  const [addLicenseOpen, setAddLicenseOpen] = useState(false)

  const activeLicenses = licenses.filter((l) => l.status === 'active' && !isExpiringSoon(l.expiry_date))
  const expiringSoon = licenses.filter((l) => l.status === 'active' && isExpiringSoon(l.expiry_date))
  const expiredLicenses = licenses.filter((l) => l.status === 'expired')

  const physicalAddress = [
    agency.physical_street_address,
    agency.physical_city,
    agency.physical_state,
    agency.physical_zip_code,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={backPath}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agencies
      </Link>

      {/* Agency info card */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-7 h-7 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{agency.name}</h1>
            {agency.business_type && (
              <p className="text-sm text-gray-500 mt-0.5">{agency.business_type}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {agency.tax_id && (
            <div className="flex items-start gap-2">
              <Hash className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tax ID</p>
                <p className="text-gray-900">{agency.tax_id}</p>
              </div>
            </div>
          )}
          {agency.primary_license_number && (
            <div className="flex items-start gap-2">
              <Briefcase className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Primary License #</p>
                <p className="text-gray-900">{agency.primary_license_number}</p>
              </div>
            </div>
          )}
          {agency.website && (
            <div className="flex items-start gap-2">
              <Globe className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Website</p>
                <a
                  href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {agency.website}
                </a>
              </div>
            </div>
          )}
          {physicalAddress && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Address</p>
                <p className="text-gray-900">{physicalAddress}</p>
              </div>
            </div>
          )}
          {agencyAdmins.length > 0 && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Agency Admins</p>
                <p className="text-gray-900">
                  {agencyAdmins
                    .map((a) => a.contact_name || a.contact_email || 'Unknown')
                    .join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agency Admins */}
      {/* <AgencyAdminsSection
        agencyId={agency.id}
        agencyAdmins={agencyAdmins}
        availableAdmins={availableAdmins}
      /> */}

      {/* License stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Active Licenses</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{activeLicenses.length}</p>
          </div>
          <CheckCircle2 className="w-9 h-9 text-green-500" />
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Expiring Soon</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{expiringSoon.length}</p>
          </div>
          <Clock className="w-9 h-9 text-orange-400" />
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Expired</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{expiredLicenses.length}</p>
          </div>
          <AlertCircle className="w-9 h-9 text-red-400" />
        </div>
      </div>

      {/* Licenses section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">Client Licenses</h2>
          </div>
          <button
            type="button"
            onClick={() => setAddLicenseOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add License
          </button>
        </div>

        {licenses.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No licenses yet. Click &quot;Add License&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">License</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">License #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Activated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {licenses.map((license) => (
                  <tr key={license.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {license.license_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        {license.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {license.license_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(license.activated_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(license.expiry_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          STATUS_COLORS[license.status] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {isExpiringSoon(license.expiry_date) && license.status === 'active'
                          ? 'Expiring Soon'
                          : license.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Applications section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">License Applications</h2>
          </div>
          <div className="w-auto">
            <ApplyForNewLicenseButton
              agencyId={agency.id}
              agencyName={agency.name}
              label="New Application"
            />
          </div>
        </div>

        {applications.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No license applications found for this agency.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Application Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {applications.map((app) => {
                  const pct = app.progress_percentage ?? 0
                  const appDetailPath = `${backPath.startsWith('/pages/admin') ? '/pages/admin/licenses' : '/pages/expert'}/applications/${app.id}`
                  return (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900">{app.application_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {app.state}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${APP_STATUS_COLORS[app.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {app.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          {formatDate(app.started_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          {formatDate(app.last_updated_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={appDetailPath}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add License Modal */}
      <CreateLicenseModal
        isOpen={addLicenseOpen}
        onClose={() => setAddLicenseOpen(false)}
        onSuccess={() => setAddLicenseOpen(false)}
        agencyId={agency.id}
        agencyName={agency.name}
      />
    </div>
  )
}
