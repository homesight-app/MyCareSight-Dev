'use client'

import { useState } from 'react'
import { Building2, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'
import { submitOnboardingForm, type OnboardingFormData } from '@/app/actions/agency-onboarding'
import { STATE_AGENCY_CONFIGS, type StateField } from '@/lib/constants/state-agency-configs'

const OFFICER_ROLES = [
  { key: 'president', label: 'President' },
  { key: 'vice_president', label: 'Vice President' },
  { key: 'secretary', label: 'Secretary' },
  { key: 'treasurer_cfo', label: 'Treasurer / CFO' },
  { key: 'administrator', label: 'Administrator' },
  { key: 'alternate_administrator', label: 'Alternate Administrator' },
  { key: 'rn_supervisor', label: 'RN Supervisor' },
] as const

type OfficerRoleKey = typeof OFFICER_ROLES[number]['key']

interface KeyStaffFormEntry {
  full_legal_name: string
  telephone: string
  email: string
}

interface MemberOwnerEntry {
  full_legal_name: string
  telephone: string
  email: string
}

interface AgencyOnboardingFormProps {
  tokenValue: string
  agency: Record<string, unknown> | null
  keyStaff: Array<{ officer_role: string; full_legal_name: string | null; telephone: string | null; email: string | null }>
}

function buildInitialKeyStaff(
  keyStaff: AgencyOnboardingFormProps['keyStaff']
): Record<OfficerRoleKey, KeyStaffFormEntry> {
  const initial: Record<string, KeyStaffFormEntry> = {}
  for (const r of OFFICER_ROLES) {
    const existing = keyStaff.find(s => s.officer_role === r.key)
    initial[r.key] = {
      full_legal_name: existing?.full_legal_name ?? '',
      telephone: existing?.telephone ?? '',
      email: existing?.email ?? '',
    }
  }
  return initial as Record<OfficerRoleKey, KeyStaffFormEntry>
}

function buildInitialMemberOwners(
  keyStaff: AgencyOnboardingFormProps['keyStaff']
): MemberOwnerEntry[] {
  const owners = keyStaff.filter(s => s.officer_role === 'member_owner')
  if (owners.length === 0) return [{ full_legal_name: '', telephone: '', email: '' }]
  return owners.map(o => ({
    full_legal_name: o.full_legal_name ?? '',
    telephone: o.telephone ?? '',
    email: o.email ?? '',
  }))
}

function FormField({ label, value, onChange, required, type = 'text', placeholder, className }: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange, id }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  id: string
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <label htmlFor={id} className="text-sm font-medium text-gray-700 cursor-pointer">
        {label}
      </label>
    </div>
  )
}

function StateFieldRenderer({ field, value, onChange }: {
  field: StateField
  value: string | boolean
  onChange: (v: string | boolean) => void
}) {
  if (field.type === 'boolean') {
    return (
      <CheckboxField
        id={field.key}
        label={field.label}
        checked={!!value}
        onChange={onChange}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <select
          value={value as string}
          onChange={e => onChange(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
        >
          <option value="">Select…</option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <FormField
      label={field.label}
      value={value as string}
      onChange={v => onChange(v)}
      required={field.required}
      type={field.type}
    />
  )
}

export default function AgencyOnboardingForm({ tokenValue, agency, keyStaff }: AgencyOnboardingFormProps) {
  const physicalState = (agency?.physical_state as string) ?? ''
  const stateFields = STATE_AGENCY_CONFIGS[physicalState] ?? []
  const publicStateFields = stateFields.filter(f => f.publicForm)

  const existingStateData = (agency?.state_specific_data as Record<string, unknown>) ?? {}

  const [form, setForm] = useState({
    name: (agency?.name as string) ?? '',
    dba_name: (agency?.dba_name as string) ?? '',
    hours_of_operation: (agency?.hours_of_operation as string) ?? '',
    date_of_formation: (agency?.date_of_formation as string) ?? '',
    npi: (agency?.npi as string) ?? '',
    tax_id: (agency?.tax_id as string) ?? '',
    fax_number: (agency?.fax_number as string) ?? '',
    website: (agency?.website as string) ?? '',
    phone_number: (agency?.phone_number as string) ?? '',
    email: (agency?.email as string) ?? '',
    region_service_area: (agency?.region_service_area as string) ?? '',
    is_on_call: (agency?.is_on_call as boolean) ?? false,
    previously_licensed: (agency?.previously_licensed as boolean) ?? false,
    prev_license_closed_date: (agency?.prev_license_closed_date as string) ?? '',
    physical_street_address: (agency?.physical_street_address as string) ?? '',
    physical_city: (agency?.physical_city as string) ?? '',
    physical_state: (agency?.physical_state as string) ?? '',
    physical_zip_code: (agency?.physical_zip_code as string) ?? '',
    same_as_physical: (agency?.same_as_physical as boolean) ?? true,
    mailing_street_address: (agency?.mailing_street_address as string) ?? '',
    mailing_city: (agency?.mailing_city as string) ?? '',
    mailing_state: (agency?.mailing_state as string) ?? '',
    mailing_zip_code: (agency?.mailing_zip_code as string) ?? '',
  })

  const [stateData, setStateData] = useState<Record<string, string | boolean>>(
    Object.fromEntries(
      publicStateFields.map(f => [f.key, (existingStateData[f.key] as string | boolean) ?? (f.type === 'boolean' ? false : '')])
    )
  )

  const [keyStaffForm, setKeyStaffForm] = useState<Record<OfficerRoleKey, KeyStaffFormEntry>>(
    buildInitialKeyStaff(keyStaff)
  )

  const [memberOwners, setMemberOwners] = useState<MemberOwnerEntry[]>(
    buildInitialMemberOwners(keyStaff)
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const setField = <K extends keyof typeof form>(key: K, val: typeof form[K]) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const setStaffField = (role: OfficerRoleKey, field: keyof KeyStaffFormEntry, val: string) => {
    setKeyStaffForm(prev => ({ ...prev, [role]: { ...prev[role], [field]: val } }))
  }

  const setOwnerField = (idx: number, field: keyof MemberOwnerEntry, val: string) => {
    setMemberOwners(prev => prev.map((o, i) => i === idx ? { ...o, [field]: val } : o))
  }

  const addMemberOwner = () => {
    setMemberOwners(prev => [...prev, { full_legal_name: '', telephone: '', email: '' }])
  }

  const removeMemberOwner = (idx: number) => {
    setMemberOwners(prev => prev.filter((_, i) => i !== idx))
  }

  const copyFromOfficer = (targetIdx: number, sourceRole: OfficerRoleKey) => {
    const source = keyStaffForm[sourceRole]
    setMemberOwners(prev => prev.map((o, i) =>
      i === targetIdx
        ? { full_legal_name: source.full_legal_name, telephone: source.telephone, email: source.email }
        : o
    ))
  }

  const filledOfficerRoles = OFFICER_ROLES.filter(r => keyStaffForm[r.key].full_legal_name.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    const payload: OnboardingFormData = {
      ...form,
      same_as_physical: form.same_as_physical,
      state_specific_data: stateData,
      key_staff: keyStaffForm as Record<typeof OFFICER_ROLES[number]['key'], { full_legal_name?: string; telephone?: string; email?: string }>,
      member_owners: memberOwners.filter(o => o.full_legal_name.trim() || o.telephone.trim() || o.email.trim()),
    }

    const result = await submitOnboardingForm(tokenValue, payload)
    setIsSubmitting(false)

    if (result.error) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h1>
          <p className="text-gray-600">
            Your agency information has been submitted successfully. HomeSights will review your details and follow up with next steps.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agency Setup</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete your agency profile for HomeSights</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Agency Information */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Agency Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Agency Name"
              value={form.name}
              onChange={v => setField('name', v)}
              required
              placeholder="Acme Home Care LLC"
            />
            <FormField
              label="DBA Name"
              value={form.dba_name}
              onChange={v => setField('dba_name', v)}
              placeholder="If different from legal name"
            />
            <FormField
              label="Tax ID / EIN"
              value={form.tax_id}
              onChange={v => setField('tax_id', v)}
              placeholder="12-3456789"
            />
            <FormField
              label="NPI"
              value={form.npi}
              onChange={v => setField('npi', v)}
              placeholder="1234567890"
            />
            <FormField
              label="Date of Formation"
              value={form.date_of_formation}
              onChange={v => setField('date_of_formation', v)}
              type="date"
            />
            <FormField
              label="Hours of Operation"
              value={form.hours_of_operation}
              onChange={v => setField('hours_of_operation', v)}
              placeholder="Mon–Fri 9am–5pm"
            />
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Agency Phone Number"
              value={form.phone_number}
              onChange={v => setField('phone_number', v)}
              placeholder="(555) 000-0000"
            />
            <FormField
              label="Agency Email"
              value={form.email}
              onChange={v => setField('email', v)}
              type="email"
              placeholder="info@agency.com"
            />
            <FormField
              label="Fax Number"
              value={form.fax_number}
              onChange={v => setField('fax_number', v)}
              placeholder="(555) 000-0000"
            />
            <FormField
              label="Website"
              value={form.website}
              onChange={v => setField('website', v)}
              type="url"
              placeholder="https://example.com"
            />
            <FormField
              label="Region / Service Area"
              value={form.region_service_area}
              onChange={v => setField('region_service_area', v)}
              placeholder="e.g. Miami-Dade, Broward"
              className="sm:col-span-2"
            />
          </div>
          <div className="mt-4 space-y-3">
            <CheckboxField
              id="is_on_call"
              label="Agency provides on-call services"
              checked={form.is_on_call}
              onChange={v => setField('is_on_call', v)}
            />
            <CheckboxField
              id="previously_licensed"
              label="Agency has been previously licensed"
              checked={form.previously_licensed}
              onChange={v => setField('previously_licensed', v)}
            />
            {form.previously_licensed && (
              <div className="pl-7">
                <FormField
                  label="Previous License Expired / Closed Date"
                  value={form.prev_license_closed_date}
                  onChange={v => setField('prev_license_closed_date', v)}
                  type="date"
                />
              </div>
            )}
          </div>
        </section>

        {/* Physical Address */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Physical Address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Street Address"
              value={form.physical_street_address}
              onChange={v => setField('physical_street_address', v)}
              required
              placeholder="123 Healthcare Blvd"
              className="sm:col-span-2"
            />
            <FormField
              label="City"
              value={form.physical_city}
              onChange={v => setField('physical_city', v)}
              required
              placeholder="Miami"
            />
            <FormField
              label="State"
              value={form.physical_state}
              onChange={v => setField('physical_state', v)}
              required
              placeholder="FL"
            />
            <FormField
              label="ZIP Code"
              value={form.physical_zip_code}
              onChange={v => setField('physical_zip_code', v)}
              required
              placeholder="33101"
            />
          </div>
        </section>

        {/* Mailing Address */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Mailing Address</h2>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={form.same_as_physical}
                onChange={e => {
                  setForm(prev => ({
                    ...prev,
                    same_as_physical: e.target.checked,
                    ...(e.target.checked ? {
                      mailing_street_address: '',
                      mailing_city: '',
                      mailing_state: '',
                      mailing_zip_code: '',
                    } : {}),
                  }))
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              Same as physical address
            </label>
          </div>
          {!form.same_as_physical && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Street Address"
                value={form.mailing_street_address}
                onChange={v => setField('mailing_street_address', v)}
                placeholder="456 Mailing Ave"
                className="sm:col-span-2"
              />
              <FormField
                label="City"
                value={form.mailing_city}
                onChange={v => setField('mailing_city', v)}
                placeholder="Miami"
              />
              <FormField
                label="State"
                value={form.mailing_state}
                onChange={v => setField('mailing_state', v)}
                placeholder="FL"
              />
              <FormField
                label="ZIP Code"
                value={form.mailing_zip_code}
                onChange={v => setField('mailing_zip_code', v)}
                placeholder="33101"
              />
            </div>
          )}
          {form.same_as_physical && (
            <p className="text-sm text-gray-500 italic">Same as physical address</p>
          )}
        </section>

        {/* Key Staff (Officers) */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Key Staff — Officers</h2>
          <p className="text-xs text-gray-500 mb-4">Provide contact information for each officer role. Leave blank if a role is not filled.</p>
          <div className="space-y-6">
            {OFFICER_ROLES.map(({ key, label }) => (
              <div key={key} className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">{label}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    label="Full Legal Name"
                    value={keyStaffForm[key].full_legal_name}
                    onChange={v => setStaffField(key, 'full_legal_name', v)}
                    placeholder="Jane Smith"
                  />
                  <FormField
                    label="Phone"
                    value={keyStaffForm[key].telephone}
                    onChange={v => setStaffField(key, 'telephone', v)}
                    placeholder="(555) 000-0000"
                  />
                  <FormField
                    label="Email"
                    value={keyStaffForm[key].email}
                    onChange={v => setStaffField(key, 'email', v)}
                    type="email"
                    placeholder="jane@example.com"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Member / Owners */}
        <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Members / Owners</h2>
          <p className="text-xs text-gray-500 mb-4">
            List all members and owners. If an individual also appears as an officer above, use the &quot;Copy from officer&quot; dropdown to avoid entering their information twice.
          </p>
          <div className="space-y-4">
            {memberOwners.map((owner, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Member / Owner {idx + 1}</h3>
                  <div className="flex items-center gap-2">
                    {filledOfficerRoles.length > 0 && (
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value) copyFromOfficer(idx, e.target.value as OfficerRoleKey)
                        }}
                        className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-600"
                      >
                        <option value="">Copy from officer…</option>
                        {filledOfficerRoles.map(r => (
                          <option key={r.key} value={r.key}>
                            {r.label}: {keyStaffForm[r.key].full_legal_name}
                          </option>
                        ))}
                      </select>
                    )}
                    {memberOwners.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMemberOwner(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    label="Full Legal Name"
                    value={owner.full_legal_name}
                    onChange={v => setOwnerField(idx, 'full_legal_name', v)}
                    placeholder="John Doe"
                  />
                  <FormField
                    label="Phone"
                    value={owner.telephone}
                    onChange={v => setOwnerField(idx, 'telephone', v)}
                    placeholder="(555) 000-0000"
                  />
                  <FormField
                    label="Email"
                    value={owner.email}
                    onChange={v => setOwnerField(idx, 'email', v)}
                    type="email"
                    placeholder="john@example.com"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMemberOwner}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Member / Owner
          </button>
        </section>

        {/* State-specific fields */}
        {publicStateFields.length > 0 && (
          <section className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              {form.physical_state} Regulatory Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {publicStateFields.map(field => (
                <StateFieldRenderer
                  key={field.key}
                  field={field}
                  value={stateData[field.key] ?? (field.type === 'boolean' ? false : '')}
                  onChange={v => setStateData(prev => ({ ...prev, [field.key]: v }))}
                />
              ))}
            </div>
          </section>
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Submitting…' : 'Submit Agency Information'}
          </button>
        </div>
      </form>
    </div>
  )
}
