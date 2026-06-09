'use client'

import { useState, useEffect } from 'react'
import { X, Plus, ChevronDown, ChevronUp, Loader2, Link2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createAgency, updateAgency, createShellAgency, type AgencyFormData } from '@/app/actions/agencies'
import { normalizeAgencyAdminIds } from '@/lib/agency-admin-ids'

export interface AgencyAdminOption {
  id: string
  contact_name: string
  contact_email: string
}

export interface EditAgencyData {
  id: string
  name: string
  agency_admin_ids: string[] | null
  business_type?: string | null
  tax_id?: string | null
  primary_license_number?: string | null
  website?: string | null
  physical_street_address?: string | null
  physical_city?: string | null
  physical_state?: string | null
  physical_zip_code?: string | null
  same_as_physical?: boolean | null
  mailing_street_address?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip_code?: string | null
}

const emptyForm: AgencyFormData = {
  companyName: '',
  agencyAdminIds: [],
  businessType: '',
  taxId: '',
  primaryLicenseNumber: '',
  website: '',
  physicalStreetAddress: '',
  physicalCity: '',
  physicalState: '',
  physicalZipCode: '',
  sameAsPhysical: true,
  mailingStreetAddress: '',
  mailingCity: '',
  mailingState: '',
  mailingZipCode: '',
}

interface AddAgencyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  agencyAdmins: AgencyAdminOption[]
  agencyAdminsForSelect: AgencyAdminOption[]
  editAgency?: EditAgencyData | null
}

export default function AddAgencyModal({
  isOpen,
  onClose,
  onSuccess,
  agencyAdmins,
  agencyAdminsForSelect,
  editAgency,
}: AddAgencyModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isCreatingShell, setIsCreatingShell] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [agencyAdminsOpen, setAgencyAdminsOpen] = useState(false)

  const isEdit = !!editAgency

  // Parent passes: add = unassigned only; edit = unassigned + this agency's admins
  const selectOptions = agencyAdminsForSelect

  useEffect(() => {
    if (isOpen) {
      setError(null)
      if (editAgency) {
        setForm({
          companyName: editAgency.name ?? '',
          agencyAdminIds: normalizeAgencyAdminIds(
            editAgency.agency_admin_ids as string[] | string | null | undefined
          ),
          businessType: editAgency.business_type ?? '',
          taxId: editAgency.tax_id ?? '',
          primaryLicenseNumber: editAgency.primary_license_number ?? '',
          website: editAgency.website ?? '',
          physicalStreetAddress: editAgency.physical_street_address ?? '',
          physicalCity: editAgency.physical_city ?? '',
          physicalState: editAgency.physical_state ?? '',
          physicalZipCode: editAgency.physical_zip_code ?? '',
          sameAsPhysical: editAgency.same_as_physical ?? true,
          mailingStreetAddress: editAgency.mailing_street_address ?? '',
          mailingCity: editAgency.mailing_city ?? '',
          mailingState: editAgency.mailing_state ?? '',
          mailingZipCode: editAgency.mailing_zip_code ?? '',
        })
      } else {
        setForm(emptyForm)
      }
    }
  }, [isOpen, editAgency])

  const setField = (field: keyof typeof form, value: string | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const toggleAgencyAdmin = (clientId: string) => {
    setForm((prev) => {
      const ids = prev.agencyAdminIds || []
      const next = ids.includes(clientId) ? ids.filter((id) => id !== clientId) : [...ids, clientId]
      return { ...prev, agencyAdminIds: next }
    })
    setError(null)
  }

  if (!isOpen) return null

  const handleCreateShell = async () => {
    if (!form.companyName.trim()) {
      setError('Company name is required.')
      return
    }
    setIsCreatingShell(true)
    setError(null)
    try {
      const result = await createShellAgency(form.companyName.trim())
      if (result.error) {
        setError(result.error)
        setIsCreatingShell(false)
        return
      }
      onClose()
      router.push(`/pages/admin/agencies/${result.data!.agencyId}?tab=organization`)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setIsCreatingShell(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyName.trim()) {
      setError('Company name is required.')
      return
    }
    setIsLoading(true)
    setError(null)

    const data: AgencyFormData = {
      ...form,
      agencyAdminIds: form.agencyAdminIds || [],
      website: form.website || undefined,
      mailingStreetAddress: form.mailingStreetAddress || undefined,
      mailingCity: form.mailingCity || undefined,
      mailingState: form.mailingState || undefined,
      mailingZipCode: form.mailingZipCode || undefined,
    }

    try {
      if (isEdit && editAgency) {
        const result = await updateAgency(
          editAgency.id,
          data,
          normalizeAgencyAdminIds(
            editAgency.agency_admin_ids as string[] | string | null | undefined
          )
        )
        if (result.error) {
          setError(result.error)
          setIsLoading(false)
          return
        }
      } else {
        const result = await createAgency(data)
        if (result.error) {
          setError(result.error)
          setIsLoading(false)
          return
        }
      }
      onSuccess?.()
      router.refresh()
      onClose()
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Edit Agency' : 'Add New Agency'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                  placeholder="Acme Home Care LLC"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Business Type <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.businessType}
                  onChange={(e) => setField('businessType', e.target.value)}
                  placeholder="Home Healthcare Agency"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tax ID / EIN </label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setField('taxId', e.target.value)}
                  placeholder="12-3456789"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Primary License Number</label>
                <input
                  type="text"
                  value={form.primaryLicenseNumber}
                  onChange={(e) => setField('primaryLicenseNumber', e.target.value)}
                  placeholder="HCA-2022-001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setField('website', e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setAgencyAdminsOpen((prev) => !prev)}
                  className="text-[#2460d6] flex items-center justify-between w-full text-left text-sm font-semibold text-gray-700 mb-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-expanded={agencyAdminsOpen}
                >
                  <span className='text-[#2460d6]'>Select agency admins</span>
                  {agencyAdminsOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                  )}
                </button>
                {agencyAdminsOpen && (
                  <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 bg-gray-50">
                    {selectOptions.length === 0 ? (
                      <p className="text-sm text-gray-500">No agency admins available (all may be assigned).</p>
                    ) : (
                      selectOptions.map((admin) => (
                        <label key={admin.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={(form.agencyAdminIds || []).includes(admin.id)}
                            onChange={() => toggleAgencyAdmin(admin.id)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">
                            {admin.contact_name} ({admin.contact_email})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
                {!agencyAdminsOpen && (form.agencyAdminIds?.length ?? 0) > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {(form.agencyAdminIds?.length ?? 0)} selected
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Physical Address */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Physical Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Street Address</label>
                <input
                  type="text"
                  value={form.physicalStreetAddress}
                  onChange={(e) => setField('physicalStreetAddress', e.target.value)}
                  placeholder="123 Healthcare Blvd"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={form.physicalCity}
                  onChange={(e) => setField('physicalCity', e.target.value)}
                  placeholder="Austin"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                <input
                  type="text"
                  value={form.physicalState}
                  onChange={(e) => setField('physicalState', e.target.value)}
                  placeholder="Texas"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">ZIP Code</label>
                <input
                  type="text"
                  value={form.physicalZipCode}
                  onChange={(e) => setField('physicalZipCode', e.target.value)}
                  placeholder="78701"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Mailing Address */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Mailing Address</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sameAsPhysical}
                  onChange={(e) => {
                    setField('sameAsPhysical', e.target.checked)
                    if (e.target.checked) {
                      setForm((prev) => ({
                        ...prev,
                        sameAsPhysical: true,
                        mailingStreetAddress: '',
                        mailingCity: '',
                        mailingState: '',
                        mailingZipCode: '',
                      }))
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Same as physical address</span>
              </label>
            </div>
            {!form.sameAsPhysical && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mailing Street Address</label>
                  <input
                    type="text"
                    value={form.mailingStreetAddress}
                    onChange={(e) => setField('mailingStreetAddress', e.target.value)}
                    placeholder="456 Mailing Ave"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mailing City</label>
                  <input
                    type="text"
                    value={form.mailingCity}
                    onChange={(e) => setField('mailingCity', e.target.value)}
                    placeholder="Austin"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mailing State</label>
                  <input
                    type="text"
                    value={form.mailingState}
                    onChange={(e) => setField('mailingState', e.target.value)}
                    placeholder="Texas"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mailing ZIP Code</label>
                  <input
                    type="text"
                    value={form.mailingZipCode}
                    onChange={(e) => setField('mailingZipCode', e.target.value)}
                    placeholder="78702"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {!isEdit && (
                <button
                  type="button"
                  onClick={handleCreateShell}
                  disabled={isCreatingShell || isLoading}
                  className="px-4 py-2 border border-purple-300 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                >
                  {isCreatingShell ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Create &amp; Send Link
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading || isCreatingShell}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? 'Saving...' : (
                  <>
                    <Plus className="w-4 h-4" />
                    {isEdit ? 'Update Agency' : 'Add Agency'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
