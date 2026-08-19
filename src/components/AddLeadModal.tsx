'use client'

import { useState, useEffect } from 'react'
import Modal from './Modal'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadFormSchema, type LeadFormData } from '@/lib/schemas/lead'
import { type LeadContext, LEAD_STAGES } from '@/lib/constants/lead-configs'
import { createLead, updateLead } from '@/app/actions/leads'
import { createClient } from '@/lib/supabase/client'
import { formatUSPhone } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

interface Lead {
  id: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  service_type: string | null
  service_states: string[] | null
  stage: string
  source: string | null
  price: number | null
  retainer_amount: number | null
  retainer_paid_date: string | null
  installments: number | null
  installment_amount: number | null
  signed_date: string | null
  notes: string | null
  converted_agency_id?: string | null
  lead_owner_id?: string | null
}

interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (leadId?: string) => void
  context: LeadContext
  editLead?: Lead | null
}

const SOURCE_OPTIONS = [
  { key: 'Other',              label: 'Other' },
  { key: 'Website',            label: 'Website' },
  { key: 'Phone',              label: 'Phone' },
  { key: 'Referral',           label: 'Referral' },
  { key: 'Trade Show',         label: 'Trade Show' },
  { key: 'Event',              label: 'Event' },
  { key: '21st Century Client',label: '21st Century Client' },
  { key: 'Current Client',     label: 'Current Client' },
  { key: 'Former Client',      label: 'Former Client' },
  { key: 'Social Media',       label: 'Social Media' },
]

const defaultValues: LeadFormData = {
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  contactPhone: '',
  companyName: '',
  serviceType: '',
  stage: 'new',
  source: 'Other',
  price: '',
  retainerAmount: '',
  retainerPaidDate: '',
  installments: '',
  installmentAmount: '',
  signedDate: '',
  notes: '',
  leadOwnerId: '',
}

function splitFullName(full: string | null): { first: string; last: string } {
  if (!full?.trim()) return { first: '', last: '' }
  const parts = full.trim().split(' ')
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

export default function AddLeadModal({
  isOpen,
  onClose,
  onSuccess,
  context,
  editLead,
}: AddLeadModalProps) {
  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new')
  const [serviceStates, setServiceStates] = useState<string[]>([])
  const [linkedAgencyId, setLinkedAgencyId] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([])
  const [loadingAgencies, setLoadingAgencies] = useState(false)
  const [keyStaff, setKeyStaff] = useState<{ id: string; full_legal_name: string | null; email: string | null; telephone: string | null; officer_role: string }[]>([])
  const [loadingKeyStaff, setLoadingKeyStaff] = useState(false)
  const [owners, setOwners] = useState<{ id: string; full_name: string | null }[]>([])

  const isEdit = !!editLead

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    mode: 'onBlur',
    defaultValues,
  })

  useEffect(() => {
    if (!isOpen) return
    if (editLead) {
      const hasExistingAgency = !!editLead.converted_agency_id
      setContactMode(hasExistingAgency ? 'existing' : 'new')
      setServiceStates(editLead.service_states ?? [])
      setLinkedAgencyId(editLead.converted_agency_id ?? '')
      setSelectedStaffId('')
      setKeyStaff([])
      reset({
        contactFirstName: editLead.contact_first_name ?? '',
        contactLastName: editLead.contact_last_name ?? '',
        contactEmail: editLead.contact_email ?? '',
        contactPhone: editLead.contact_phone ?? '',
        companyName: editLead.company_name ?? '',
        serviceType: editLead.service_type ?? '',
        stage: editLead.stage ?? 'new',
        source: editLead.source ?? 'Other',
        price: editLead.price != null ? String(editLead.price) : '',
        retainerAmount: editLead.retainer_amount != null ? String(editLead.retainer_amount) : '',
        retainerPaidDate: editLead.retainer_paid_date ?? '',
        installments: editLead.installments != null ? String(editLead.installments) : '',
        installmentAmount: editLead.installment_amount != null ? String(editLead.installment_amount) : '',
        signedDate: editLead.signed_date ?? '',
        notes: editLead.notes ?? '',
        leadOwnerId: editLead.lead_owner_id ?? '',
      })
    } else {
      setContactMode('new')
      setServiceStates([])
      setLinkedAgencyId('')
      setSelectedStaffId('')
      setKeyStaff([])
      reset(defaultValues)
    }
  }, [isOpen, editLead, reset])

  useEffect(() => {
    if (!isOpen || !context.billingVisible || owners.length > 0) return
    const supabase = createClient()
    supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('role', ['admin', 'expert'])
      .order('full_name')
      .then(({ data }) => setOwners(data ?? []))
  }, [isOpen, context.billingVisible, owners.length])

  useEffect(() => {
    if (contactMode !== 'existing' || agencies.length > 0) return
    setLoadingAgencies(true)
    const supabase = createClient()
    supabase
      .from('agencies')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        setAgencies(data ?? [])
        setLoadingAgencies(false)
      })
  }, [contactMode, agencies.length])

  useEffect(() => {
    if (contactMode !== 'existing' || !linkedAgencyId) {
      setKeyStaff([])
      return
    }
    setLoadingKeyStaff(true)
    const supabase = createClient()
    supabase
      .from('agency_key_staff')
      .select('id, full_legal_name, email, telephone, officer_role')
      .eq('agency_id', linkedAgencyId)
      .eq('status', 'active')
      .order('officer_role')
      .then(({ data }) => {
        setKeyStaff(data ?? [])
        setLoadingKeyStaff(false)
      })
  }, [contactMode, linkedAgencyId])

  const handleAgencyChange = (agencyId: string) => {
    const agency = agencies.find(a => a.id === agencyId)
    setLinkedAgencyId(agencyId)
    setSelectedStaffId('')
    setKeyStaff([])
    setValue('contactFirstName', '')
    setValue('contactLastName', '')
    setValue('contactEmail', '')
    setValue('contactPhone', '')
    setValue('companyName', agency?.name ?? '')
  }

  const handleStaffChange = (staffId: string) => {
    const staff = keyStaff.find(s => s.id === staffId)
    setSelectedStaffId(staffId)
    if (!staffId) {
      setValue('contactFirstName', '')
      setValue('contactLastName', '')
      setValue('contactEmail', '')
      setValue('contactPhone', '')
      return
    }
    const { first, last } = splitFullName(staff?.full_legal_name ?? null)
    setValue('contactFirstName', first)
    setValue('contactLastName', last)
    setValue('contactEmail', staff?.email ?? '')
    setValue('contactPhone', formatUSPhone(staff?.telephone ?? ''))
  }

  const switchMode = (mode: 'new' | 'existing') => {
    setContactMode(mode)
    setKeyStaff([])
    setSelectedStaffId('')
    setValue('contactFirstName', '')
    setValue('contactLastName', '')
    setValue('contactEmail', '')
    setValue('contactPhone', '')
    setValue('companyName', '')
    if (mode === 'new') {
      setLinkedAgencyId('')
    }
  }

  const onSubmit = async (data: LeadFormData) => {
    const numericOrNull = (val: string) => { const n = parseFloat(val); return isNaN(n) ? null : n }
    const intOrNull    = (val: string) => { const n = parseInt(val);   return isNaN(n) ? null : n }
    const dateOrNull   = (val: string) => val.trim() || null

    const convertedAgencyId = contactMode === 'existing' ? (linkedAgencyId || null) : null

    if (isEdit && editLead) {
      const result = await updateLead(editLead.id, {
        contactFirstName: data.contactFirstName,
        contactLastName: data.contactLastName,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        companyName: data.companyName || undefined,
        serviceType: data.serviceType || undefined,
        price: context.billingVisible ? numericOrNull(data.price ?? '') : undefined,
        retainerAmount: context.billingVisible ? numericOrNull(data.retainerAmount ?? '') : undefined,
        retainerPaidDate: context.billingVisible ? dateOrNull(data.retainerPaidDate ?? '') : undefined,
        installments: context.billingVisible ? intOrNull(data.installments ?? '') : undefined,
        installmentAmount: context.billingVisible ? numericOrNull(data.installmentAmount ?? '') : undefined,
        signedDate: context.billingVisible ? dateOrNull(data.signedDate ?? '') : undefined,
        notes: data.notes || null,
        source: data.source || null,
        convertedAgencyId,
        leadOwnerId: context.billingVisible ? (data.leadOwnerId || null) : undefined,
        serviceStates: serviceStates.length > 0 ? serviceStates : null,
      })
      if (result.error) { showValidationToast({ error: result.error }); return }
      showSuccessToast('Lead updated successfully')
      onSuccess(editLead.id)
    } else {
      const result = await createLead({
        leadType: context.leadType,
        agencyId: context.agencyId,
        contactFirstName: data.contactFirstName,
        contactLastName: data.contactLastName,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        companyName: data.companyName || undefined,
        serviceType: data.serviceType || undefined,
        stage: data.stage || 'new',
        source: data.source || 'Other',
        price: context.billingVisible ? numericOrNull(data.price ?? '') : null,
        retainerAmount: context.billingVisible ? numericOrNull(data.retainerAmount ?? '') : null,
        retainerPaidDate: context.billingVisible ? dateOrNull(data.retainerPaidDate ?? '') : null,
        installments: context.billingVisible ? intOrNull(data.installments ?? '') : null,
        installmentAmount: context.billingVisible ? numericOrNull(data.installmentAmount ?? '') : null,
        signedDate: context.billingVisible ? dateOrNull(data.signedDate ?? '') : null,
        notes: data.notes || undefined,
        convertedAgencyId,
        leadOwnerId: context.billingVisible ? (data.leadOwnerId || null) : null,
        serviceStates: serviceStates.length > 0 ? serviceStates : null,
      })
      if (result.error) { showValidationToast({ error: result.error }); return }
      showSuccessToast('Lead created successfully')
      onSuccess(result.leadId)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Lead' : 'Add New Lead'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Contact */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</p>
            {context.leadType === 'agency' && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => switchMode('new')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${contactMode === 'new' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  New Contact
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('existing')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${contactMode === 'existing' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Existing Agency
                </button>
              </div>
            )}
          </div>

          {contactMode === 'existing' && context.leadType === 'agency' && (
            <div className="space-y-3 mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <label className={labelCls}>Agency</label>
                <select
                  className={inputCls}
                  value={linkedAgencyId}
                  onChange={e => handleAgencyChange(e.target.value)}
                  disabled={loadingAgencies}
                >
                  <option value="">— Select agency —</option>
                  {agencies.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {linkedAgencyId && (
                <div>
                  <label className={labelCls}>Contact <span className="text-gray-400 font-normal">(optional)</span></label>
                  <select
                    className={inputCls}
                    value={selectedStaffId}
                    onChange={e => handleStaffChange(e.target.value)}
                    disabled={loadingKeyStaff}
                  >
                    <option value="">— Select a contact to pre-fill —</option>
                    {keyStaff.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_legal_name ?? '(No name)'}{s.officer_role ? ` · ${s.officer_role}` : ''}
                      </option>
                    ))}
                  </select>
                  {!loadingKeyStaff && keyStaff.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No key staff on file for this agency.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
              <input className={inputCls} {...register('contactFirstName')} />
              {errors.contactFirstName && (
                <p className="mt-1 text-sm text-red-600">{errors.contactFirstName.message}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
              <input className={inputCls} {...register('contactLastName')} />
              {errors.contactLastName && (
                <p className="mt-1 text-sm text-red-600">{errors.contactLastName.message}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <EmailInput
                className={inputCls}
                {...register('contactEmail')}
                error={errors.contactEmail?.message}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <PhoneInput
                className={inputCls}
                {...register('contactPhone')}
                error={errors.contactPhone?.message}
              />
            </div>
            {context.leadType === 'agency' && (
              <div className="col-span-2">
                <label className={labelCls}>Agency Name</label>
                <input className={inputCls} {...register('companyName')} />
              </div>
            )}
          </div>
        </div>

        {/* Stage & Service Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Stage</label>
            <select className={inputCls} {...register('stage')}>
              {LEAD_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Service Type</label>
            <select className={inputCls} {...register('serviceType')}>
              <option value="">— Select —</option>
              {[...new Map(context.serviceTypes.map(s => [s.key, s])).values()].sort((a, b) => a.label.localeCompare(b.label)).map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Service State(s)</label>
            <div className="border border-gray-300 rounded-lg p-2 max-h-32 overflow-y-auto grid grid-cols-6 gap-1">
              {US_STATES.map(st => (
                <label key={st} className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={serviceStates.includes(st)}
                    onChange={e => {
                      setServiceStates(prev => e.target.checked
                        ? [...prev, st]
                        : prev.filter(s => s !== st)
                      )
                    }}
                    className="w-3 h-3 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-xs text-gray-700">{st}</span>
                </label>
              ))}
            </div>
            {serviceStates.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Selected: {serviceStates.sort().join(', ')}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <select className={inputCls} {...register('source')}>
              {SOURCE_OPTIONS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          {context.billingVisible && (
            <div>
              <label className={labelCls}>Lead Owner</label>
              <select className={inputCls} {...register('leadOwnerId')}>
                <option value="">— Unassigned —</option>
                {owners.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name ?? ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Billing (admin agency leads only) */}
        {context.billingVisible && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Billing</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Price ($)</label>
                <input type="number" step="0.01" className={inputCls} {...register('price')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Retainer ($)</label>
                <input type="number" step="0.01" className={inputCls} {...register('retainerAmount')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Retainer Paid Date</label>
                <input type="date" className={inputCls} {...register('retainerPaidDate')} />
              </div>
              <div>
                <label className={labelCls}>Installments</label>
                <input type="number" min="0" className={inputCls} {...register('installments')} placeholder="0 = paid in full" />
              </div>
              <div>
                <label className={labelCls}>Amount / Installment ($)</label>
                <input type="number" step="0.01" className={inputCls} {...register('installmentAmount')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Signed Date</label>
                <input type="date" className={inputCls} {...register('signedDate')} />
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            {...register('notes')}
            placeholder="Any initial notes…"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
