'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
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
  Download,
  Upload,
  Pencil,
  Loader2,
  X,
  ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { createSignedStorageUrl, STORAGE_BUCKET } from '@/lib/supabase/storage'
import { updateAgency, type AgencyFormData } from '@/app/actions/agencies'
import CreateLicenseModal from './CreateLicenseModal'
import AgencyAdminsSection from './AgencyAdminsSection'
import AgencyOnboardingLinkPanel from './AgencyOnboardingLinkPanel'
import AgencyKeyStaffSection from './AgencyKeyStaffSection'
import AgencyUsersTab from './AgencyUsersTab'
import ApplyForNewLicenseButton from './ApplyForNewLicenseButton'
import Modal from './Modal'
import type { OnboardingToken, AgencyKeyStaff } from '@/lib/supabase/query'

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
  // Migration 115
  status?: string | null
  // Fields added in migration 112
  dba_name?: string | null
  hours_of_operation?: string | null
  fax_number?: string | null
  date_of_formation?: string | null
  npi?: string | null
  onboarding_status?: string | null
  state_specific_data?: Record<string, unknown> | null
  // Fields added in migration 113
  phone_number?: string | null
  email?: string | null
  region_service_area?: string | null
  is_on_call?: boolean | null
  previously_licensed?: boolean | null
  prev_license_closed_date?: string | null
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
  canEdit?: boolean
  activeToken?: OnboardingToken | null
  keyStaff?: AgencyKeyStaff[]
}

type OrgFormState = {
  companyName: string
  businessType: string
  taxId: string
  primaryLicenseNumber: string
  website: string
  physicalStreetAddress: string
  physicalCity: string
  physicalState: string
  physicalZipCode: string
  sameAsPhysical: boolean
  mailingStreetAddress: string
  mailingCity: string
  mailingState: string
  mailingZipCode: string
  // New fields (migrations 112 + 113)
  dbaName: string
  hoursOfOperation: string
  faxNumber: string
  dateOfFormation: string
  npi: string
  stateSpecificData: Record<string, unknown>
  phoneNumber: string
  agencyEmail: string
  regionServiceArea: string
  isOnCall: boolean
  previouslyLicensed: boolean
  prevLicenseClosedDate: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring: 'bg-orange-100 text-orange-700',
  expired: 'bg-red-100 text-red-700',
}

const APP_STATUS_COLORS: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  under_review: 'bg-blue-100 text-blue-700',
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

interface FieldProps {
  label: string
  value: string
  isEditing: boolean
  onChange: (val: string) => void
  className?: string
}

function Field({ label, value, isEditing, onChange, className }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {isEditing ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      ) : (
        <p className="text-sm text-gray-900">{value || '—'}</p>
      )}
    </div>
  )
}

export default function AgencyDetailContent({
  agency,
  licenses,
  applications,
  agencyAdmins,
  availableAdmins,
  backPath,
  canEdit = false,
  activeToken = null,
  keyStaff = [],
}: AgencyDetailContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const initialTab: 'licenses' | 'organization' | 'users' =
    rawTab === 'organization' ? 'organization' : rawTab === 'users' ? 'users' : 'licenses'
  const [activeTab, setActiveTab] = useState<'licenses' | 'organization' | 'users'>(initialTab)
  const [usersTabActivated, setUsersTabActivated] = useState(initialTab === 'users')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addLicenseOpen, setAddLicenseOpen] = useState(false)
  const [editingLicense, setEditingLicense] = useState<License | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [uploadDocLicense, setUploadDocLicense] = useState<License | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDocName, setUploadDocName] = useState('')
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)
  const [uploadDocError, setUploadDocError] = useState<string | null>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)

  const buildInitialForm = (): OrgFormState => ({
    companyName: agency.name,
    businessType: agency.business_type ?? '',
    taxId: agency.tax_id ?? '',
    primaryLicenseNumber: agency.primary_license_number ?? '',
    website: agency.website ?? '',
    physicalStreetAddress: agency.physical_street_address ?? '',
    physicalCity: agency.physical_city ?? '',
    physicalState: agency.physical_state ?? '',
    physicalZipCode: agency.physical_zip_code ?? '',
    sameAsPhysical: agency.same_as_physical ?? true,
    mailingStreetAddress: agency.mailing_street_address ?? '',
    mailingCity: agency.mailing_city ?? '',
    mailingState: agency.mailing_state ?? '',
    mailingZipCode: agency.mailing_zip_code ?? '',
    dbaName: agency.dba_name ?? '',
    hoursOfOperation: agency.hours_of_operation ?? '',
    faxNumber: agency.fax_number ?? '',
    dateOfFormation: agency.date_of_formation ?? '',
    npi: agency.npi ?? '',
    stateSpecificData: agency.state_specific_data ?? {},
    phoneNumber: agency.phone_number ?? '',
    agencyEmail: agency.email ?? '',
    regionServiceArea: agency.region_service_area ?? '',
    isOnCall: agency.is_on_call ?? false,
    previouslyLicensed: agency.previously_licensed ?? false,
    prevLicenseClosedDate: agency.prev_license_closed_date ?? '',
  })

  const [orgForm, setOrgForm] = useState<OrgFormState>(buildInitialForm)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const currentAdminIds = agencyAdmins.map(a => a.id)
      const payload: AgencyFormData = {
        companyName: orgForm.companyName,
        agencyAdminIds: currentAdminIds,
        businessType: orgForm.businessType,
        taxId: orgForm.taxId,
        primaryLicenseNumber: orgForm.primaryLicenseNumber,
        website: orgForm.website || undefined,
        physicalStreetAddress: orgForm.physicalStreetAddress,
        physicalCity: orgForm.physicalCity,
        physicalState: orgForm.physicalState,
        physicalZipCode: orgForm.physicalZipCode,
        sameAsPhysical: orgForm.sameAsPhysical,
        mailingStreetAddress: orgForm.mailingStreetAddress || undefined,
        mailingCity: orgForm.mailingCity || undefined,
        mailingState: orgForm.mailingState || undefined,
        mailingZipCode: orgForm.mailingZipCode || undefined,
        dbaName: orgForm.dbaName || undefined,
        hoursOfOperation: orgForm.hoursOfOperation || undefined,
        faxNumber: orgForm.faxNumber || undefined,
        dateOfFormation: orgForm.dateOfFormation || undefined,
        npi: orgForm.npi || undefined,
        stateSpecificData: orgForm.stateSpecificData,
        phoneNumber: orgForm.phoneNumber || undefined,
        agencyEmail: orgForm.agencyEmail || undefined,
        regionServiceArea: orgForm.regionServiceArea || undefined,
        isOnCall: orgForm.isOnCall,
        previouslyLicensed: orgForm.previouslyLicensed,
        prevLicenseClosedDate: orgForm.prevLicenseClosedDate || undefined,
      }
      const { error } = await updateAgency(agency.id, payload, currentAdminIds)
      if (error) throw new Error(error)
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setOrgForm(buildInitialForm())
    setSaveError(null)
    setIsEditing(false)
  }

  const activeLicenses = licenses.filter((l) => l.status === 'active' && !isExpiringSoon(l.expiry_date))
  const expiringSoon = licenses.filter((l) => l.status === 'active' && isExpiringSoon(l.expiry_date))
  const expiredLicenses = licenses.filter((l) => l.status === 'expired')

  const displayedLicenses = licenses.filter((l) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return l.status === 'active' && !isExpiringSoon(l.expiry_date)
    if (statusFilter === 'expiring') return l.status === 'active' && isExpiringSoon(l.expiry_date)
    if (statusFilter === 'expired') return l.status === 'expired'
    return true
  })

  const handleDownloadLicense = async (license: License) => {
    setDownloadingId(license.id)
    try {
      const supabase = createClient()
      const { data } = await q.getLatestLicenseDocumentByLicenseId(supabase, license.id)
      if (!data?.document_url) {
        alert('No document has been uploaded for this license yet.')
        return
      }
      const signedUrl = await createSignedStorageUrl(supabase, STORAGE_BUCKET.APPLICATION, data.document_url)
      if (!signedUrl) throw new Error('Failed to generate download URL')
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.document_name || license.license_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      alert('Failed to download document.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleUploadDoc = async () => {
    if (!uploadFile || !uploadDocLicense) return
    setIsUploadingDoc(true)
    setUploadDocError(null)
    try {
      const supabase = createClient()
      const fileExt = uploadFile.name.split('.').pop()
      const filePath = `license-${uploadDocLicense.id}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('application-documents')
        .upload(filePath, uploadFile, { upsert: false, contentType: uploadFile.type || `application/${fileExt}` })
      if (uploadError) throw uploadError

      const { error: docError } = await q.insertLicenseDocument(supabase, {
        license_id: uploadDocLicense.id,
        document_name: uploadDocName.trim() || uploadFile.name,
        document_url: filePath,
        document_type: null,
      })
      if (docError) {
        await supabase.storage.from('application-documents').remove([filePath])
        throw docError
      }
      setUploadDocLicense(null)
      setUploadFile(null)
      setUploadDocName('')
    } catch (err: unknown) {
      setUploadDocError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploadingDoc(false)
    }
  }

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
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-7 h-7 text-blue-600" />
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

      {/* Tab bar */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {([
            { key: 'licenses', label: 'Licenses' },
            { key: 'organization', label: 'Organization' },
            { key: 'users', label: 'Users' },
          ] as const).map(({ key: tab, label }) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
                if (tab === 'users') setUsersTabActivated(true)
              }}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Licenses tab */}
      {activeTab === 'licenses' && (
        <>
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

          {/* Client Licenses section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Client Licenses</h2>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="appearance-none pl-3 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="expiring">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
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
            </div>

            {licenses.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No licenses yet. Click &quot;Add License&quot; to create one.
              </div>
            ) : displayedLicenses.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No licenses match the selected filter.
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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedLicenses.map((license) => (
                      <tr key={license.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {license.license_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
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
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingLicense(license)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadLicense(license)}
                              disabled={downloadingId === license.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                              {downloadingId === license.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Download className="w-3.5 h-3.5" />}
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadDocLicense(license)
                                setUploadFile(null)
                                setUploadDocName('')
                                setUploadDocError(null)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Upload
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* License Applications section */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
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
                      const agencyDetailHref = `${backPath}/${agency.id}`
                      const appDetailPath = `${backPath.startsWith('/pages/admin') ? '/pages/admin/licenses' : '/pages/expert'}/applications/${app.id}?back=${encodeURIComponent(agencyDetailHref)}`
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
        </>
      )}

      {/* Organization tab */}
      {activeTab === 'organization' && (
        <div className="space-y-6">
          {/* Agency Details card */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Agency Details</h2>
              {canEdit && !isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {canEdit && isEditing && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 space-y-6">
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{saveError}</div>
              )}

              {/* Business Information */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Business Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Agency Name"
                    value={orgForm.companyName}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, companyName: val }))}
                  />
                  <Field
                    label="DBA Name"
                    value={orgForm.dbaName}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, dbaName: val }))}
                  />
                  <Field
                    label="Business Type"
                    value={orgForm.businessType}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, businessType: val }))}
                  />
                  <Field
                    label="Hours of Operation"
                    value={orgForm.hoursOfOperation}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, hoursOfOperation: val }))}
                  />
                  <Field
                    label="Date of Formation"
                    value={orgForm.dateOfFormation}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, dateOfFormation: val }))}
                  />
                </div>
              </section>

              {/* Identification */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Identification</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Tax ID / EIN"
                    value={orgForm.taxId}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, taxId: val }))}
                  />
                  <Field
                    label="NPI"
                    value={orgForm.npi}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, npi: val }))}
                  />
                  <Field
                    label="Primary License #"
                    value={orgForm.primaryLicenseNumber}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, primaryLicenseNumber: val }))}
                  />
                </div>
              </section>

              {/* Contact */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Website"
                    value={orgForm.website}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, website: val }))}
                  />
                  <Field
                    label="Fax Number"
                    value={orgForm.faxNumber}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, faxNumber: val }))}
                  />
                </div>
              </section>

              {/* Contact Information */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Phone Number"
                    value={orgForm.phoneNumber}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, phoneNumber: val }))}
                  />
                  <Field
                    label="Email"
                    value={orgForm.agencyEmail}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, agencyEmail: val }))}
                  />
                  <Field
                    label="Region / Service Area"
                    value={orgForm.regionServiceArea}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, regionServiceArea: val }))}
                    className="sm:col-span-2"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {isEditing ? (
                    <>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={orgForm.isOnCall}
                          onChange={e => setOrgForm(f => ({ ...f, isOnCall: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Agency provides on-call services
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={orgForm.previouslyLicensed}
                          onChange={e => setOrgForm(f => ({ ...f, previouslyLicensed: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Previously licensed
                      </label>
                      {orgForm.previouslyLicensed && (
                        <Field
                          label="Previous License Closed Date"
                          value={orgForm.prevLicenseClosedDate}
                          isEditing
                          onChange={val => setOrgForm(f => ({ ...f, prevLicenseClosedDate: val }))}
                        />
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">On-Call</span>
                        <span className="text-gray-900">{agency.is_on_call === true ? 'Yes' : agency.is_on_call === false ? 'No' : '—'}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">Previously Licensed</span>
                        <span className="text-gray-900">
                          {agency.previously_licensed === true
                            ? `Yes${agency.prev_license_closed_date ? ` (closed ${formatDate(agency.prev_license_closed_date)})` : ''}`
                            : agency.previously_licensed === false ? 'No' : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Physical Address */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Physical Address</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Street"
                    value={orgForm.physicalStreetAddress}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, physicalStreetAddress: val }))}
                    className="sm:col-span-2"
                  />
                  <Field
                    label="City"
                    value={orgForm.physicalCity}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, physicalCity: val }))}
                  />
                  <Field
                    label="State"
                    value={orgForm.physicalState}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, physicalState: val }))}
                  />
                  <Field
                    label="ZIP Code"
                    value={orgForm.physicalZipCode}
                    isEditing={isEditing}
                    onChange={val => setOrgForm(f => ({ ...f, physicalZipCode: val }))}
                  />
                </div>
              </section>

              {/* Mailing Address */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Mailing Address</h3>
                {isEditing && (
                  <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={orgForm.sameAsPhysical}
                      onChange={e => setOrgForm(f => ({ ...f, sameAsPhysical: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Same as physical address
                  </label>
                )}
                {orgForm.sameAsPhysical && !isEditing && (
                  <p className="text-sm text-gray-500 italic">Same as physical address</p>
                )}
                {!orgForm.sameAsPhysical && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Street"
                      value={orgForm.mailingStreetAddress}
                      isEditing={isEditing}
                      onChange={val => setOrgForm(f => ({ ...f, mailingStreetAddress: val }))}
                      className="sm:col-span-2"
                    />
                    <Field
                      label="City"
                      value={orgForm.mailingCity}
                      isEditing={isEditing}
                      onChange={val => setOrgForm(f => ({ ...f, mailingCity: val }))}
                    />
                    <Field
                      label="State"
                      value={orgForm.mailingState}
                      isEditing={isEditing}
                      onChange={val => setOrgForm(f => ({ ...f, mailingState: val }))}
                    />
                    <Field
                      label="ZIP Code"
                      value={orgForm.mailingZipCode}
                      isEditing={isEditing}
                      onChange={val => setOrgForm(f => ({ ...f, mailingZipCode: val }))}
                    />
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Onboarding Link */}
          {canEdit && (
            <AgencyOnboardingLinkPanel
              agencyId={agency.id}
              agencyName={agency.name}
              activeToken={activeToken}
            />
          )}

          {/* Key Staff */}
          {canEdit && (
            <AgencyKeyStaffSection
              agencyId={agency.id}
              keyStaff={keyStaff}
            />
          )}

          {/* Agency Admins */}
          <AgencyAdminsSection
            agencyId={agency.id}
            agencyAdmins={agencyAdmins}
            availableAdmins={availableAdmins}
          />
        </div>
      )}

      {/* Users tab — lazy-mounted on first activation, kept in DOM after that */}
      <div className={activeTab === 'users' ? '' : 'hidden'}>
        {usersTabActivated && <AgencyUsersTab agencyId={agency.id} />}
      </div>

      {/* Modals — always mounted regardless of active tab */}
      {editingLicense && (
        <CreateLicenseModal
          isOpen={!!editingLicense}
          onClose={() => setEditingLicense(null)}
          onSuccess={() => setEditingLicense(null)}
          agencyId={agency.id}
          licenseToEdit={editingLicense}
        />
      )}

      <Modal
        isOpen={!!uploadDocLicense}
        onClose={() => { setUploadDocLicense(null); setUploadFile(null); setUploadDocName(''); setUploadDocError(null) }}
        title={`Upload Document — ${uploadDocLicense?.license_name ?? ''}`}
        size="md"
      >
        <div className="p-6 space-y-4">
          {uploadDocError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{uploadDocError}</div>
          )}
          {!uploadFile ? (
            <div
              onClick={() => uploadFileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-colors"
            >
              <Upload className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-600 font-medium text-sm">Click to select a file</p>
              <p className="text-xs text-gray-500 mt-0.5">PDF, DOC, DOCX, JPG, PNG</p>
              <input
                ref={uploadFileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) { setUploadFile(f); setUploadDocName(f.name) }
                }}
              />
            </div>
          ) : (
            <div className="border border-gray-300 rounded-xl p-4 bg-gray-50 flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{uploadFile.name}</p>
                <p className="text-xs text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <button type="button" onClick={() => { setUploadFile(null); setUploadDocName('') }} className="p-1.5 hover:bg-gray-200 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          )}
          {uploadFile && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document name</label>
              <input
                type="text"
                value={uploadDocName}
                onChange={(e) => setUploadDocName(e.target.value)}
                className="block w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setUploadDocLicense(null); setUploadFile(null); setUploadDocName(''); setUploadDocError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUploadDoc}
              disabled={!uploadFile || isUploadingDoc}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isUploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload
            </button>
          </div>
        </div>
      </Modal>

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
