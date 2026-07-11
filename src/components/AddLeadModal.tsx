'use client'

import { useState, useEffect } from 'react'
import Modal from './Modal'
import { type LeadContext, LEAD_STAGES } from '@/lib/constants/lead-configs'
import { createLead, updateLead } from '@/app/actions/leads'
import { createClient } from '@/lib/supabase/client'

interface Lead {
  id: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  company_name: string | null
  service_type: string | null
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
}

const CLIENT_SOURCE_KEYS = ['Current Client', 'Former Client']

interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (leadId?: string) => void
  context: LeadContext
  editLead?: Lead | null
}

const SOURCE_OPTIONS = [
  { key: 'Other',       label: 'Other' },
  { key: 'Website',     label: 'Website' },
  { key: 'Phone',       label: 'Phone' },
  { key: 'Referral',    label: 'Referral' },
  { key: 'Trade Show',  label: 'Trade Show' },
  { key: 'Event',       label: 'Event' },
  { key: '21st Century Client', label: '21st Century Client' },
  { key: 'Current Client',  label: 'Current Client' },
  { key: 'Former Client',       label: 'Former Client' },
  { key: 'Social Media', label: 'Social Media' },
]

const emptyForm = {
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
  linkedAgencyId: '',
}

export default function AddLeadModal({
  isOpen,
  onClose,
  onSuccess,
  context,
  editLead,
}: AddLeadModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([])
  const [loadingAgencies, setLoadingAgencies] = useState(false)

  const isEdit = !!editLead
  const showAgencyLink = CLIENT_SOURCE_KEYS.includes(form.source) && context.leadType === 'agency'

  useEffect(() => {
    if (!isOpen) return
    if (editLead) {
      setForm({
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
        linkedAgencyId: editLead.converted_agency_id ?? '',
      })
    } else {
      setForm(emptyForm)
    }
    setError(null)
  }, [isOpen, editLead])

  useEffect(() => {
    if (!showAgencyLink || agencies.length > 0) return
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
  }, [showAgencyLink, agencies.length])

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => {
      const next = { ...prev, [field]: e.target.value }
      // Clear agency link when source changes away from client sources
      if (field === 'source' && !CLIENT_SOURCE_KEYS.includes(e.target.value)) {
        next.linkedAgencyId = ''
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contactFirstName.trim() || !form.contactLastName.trim()) {
      setError('First name and last name are required.')
      return
    }
    setSaving(true)
    setError(null)

    const numericOrNull = (val: string) => {
      const n = parseFloat(val)
      return isNaN(n) ? null : n
    }
    const intOrNull = (val: string) => {
      const n = parseInt(val)
      return isNaN(n) ? null : n
    }
    const dateOrNull = (val: string) => val.trim() || null

    if (isEdit && editLead) {
      const result = await updateLead(editLead.id, {
        contactFirstName: form.contactFirstName,
        contactLastName: form.contactLastName,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        companyName: form.companyName || undefined,
        serviceType: form.serviceType || undefined,
        price: context.billingVisible ? numericOrNull(form.price) : undefined,
        retainerAmount: context.billingVisible ? numericOrNull(form.retainerAmount) : undefined,
        retainerPaidDate: context.billingVisible ? dateOrNull(form.retainerPaidDate) : undefined,
        installments: context.billingVisible ? intOrNull(form.installments) : undefined,
        installmentAmount: context.billingVisible ? numericOrNull(form.installmentAmount) : undefined,
        signedDate: context.billingVisible ? dateOrNull(form.signedDate) : undefined,
        notes: form.notes || null,
        source: form.source || null,
        convertedAgencyId: showAgencyLink ? (form.linkedAgencyId || null) : undefined,
      })
      setSaving(false)
      if (result.error) { setError(result.error); return }
      onSuccess(editLead.id)
    } else {
      const result = await createLead({
        leadType: context.leadType,
        agencyId: context.agencyId,
        contactFirstName: form.contactFirstName,
        contactLastName: form.contactLastName,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        companyName: form.companyName || undefined,
        serviceType: form.serviceType || undefined,
        stage: form.stage || 'new',
        source: form.source || 'Other',
        price: context.billingVisible ? numericOrNull(form.price) : null,
        retainerAmount: context.billingVisible ? numericOrNull(form.retainerAmount) : null,
        retainerPaidDate: context.billingVisible ? dateOrNull(form.retainerPaidDate) : null,
        installments: context.billingVisible ? intOrNull(form.installments) : null,
        installmentAmount: context.billingVisible ? numericOrNull(form.installmentAmount) : null,
        signedDate: context.billingVisible ? dateOrNull(form.signedDate) : null,
        notes: form.notes || undefined,
        convertedAgencyId: showAgencyLink ? (form.linkedAgencyId || null) : null,
      })
      setSaving(false)
      if (result.error) { setError(result.error); return }
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
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Contact */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.contactFirstName} onChange={set('contactFirstName')} required />
            </div>
            <div>
              <label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.contactLastName} onChange={set('contactLastName')} required />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} value={form.contactEmail} onChange={set('contactEmail')} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" className={inputCls} value={form.contactPhone} onChange={set('contactPhone')} />
            </div>
            {context.leadType === 'agency' && (
              <div className="col-span-2">
                <label className={labelCls}>Company Name</label>
                <input className={inputCls} value={form.companyName} onChange={set('companyName')} />
              </div>
            )}
          </div>
        </div>

        {/* Stage & Service Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Stage</label>
            <select className={inputCls} value={form.stage} onChange={set('stage')}>
              {LEAD_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Service Type</label>
            <select className={inputCls} value={form.serviceType} onChange={set('serviceType')}>
              <option value="">— Select —</option>
              {[...new Map(context.serviceTypes.map(s => [s.key, s])).values()].sort((a, b) => a.label.localeCompare(b.label)).map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <select className={inputCls} value={form.source} onChange={set('source')}>
              {SOURCE_OPTIONS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {showAgencyLink && (
          <div>
            <label className={labelCls}>Associated Agency <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              className={inputCls}
              value={form.linkedAgencyId}
              onChange={set('linkedAgencyId')}
              disabled={loadingAgencies}
            >
              <option value="">— Select existing agency —</option>
              {agencies.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Link this lead to an existing agency account.</p>
          </div>
        )}

        {/* Billing (admin agency leads only) */}
        {context.billingVisible && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Billing</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Price ($)</label>
                <input type="number" step="0.01" className={inputCls} value={form.price} onChange={set('price')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Retainer ($)</label>
                <input type="number" step="0.01" className={inputCls} value={form.retainerAmount} onChange={set('retainerAmount')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Retainer Paid Date</label>
                <input type="date" className={inputCls} value={form.retainerPaidDate} onChange={set('retainerPaidDate')} />
              </div>
              <div>
                <label className={labelCls}>Installments</label>
                <input type="number" min="0" className={inputCls} value={form.installments} onChange={set('installments')} placeholder="0 = paid in full" />
              </div>
              <div>
                <label className={labelCls}>Amount / Installment ($)</label>
                <input type="number" step="0.01" className={inputCls} value={form.installmentAmount} onChange={set('installmentAmount')} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Signed Date</label>
                <input type="date" className={inputCls} value={form.signedDate} onChange={set('signedDate')} />
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
            value={form.notes}
            onChange={set('notes')}
            placeholder="Any initial notes…"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
