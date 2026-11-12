'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Modal from './Modal'
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'
import { patientLeadDetailsSchema, type PatientLeadDetailsFormData } from '@/lib/schemas/patient-lead'
import { updatePatientLeadDetailsAction } from '@/app/actions/leads'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'
import type { PatientLeadDetails } from '@/app/actions/query-bridge'
import Button from '@/components/ui/PrimaryButton'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  leadId: string
  details: PatientLeadDetails | null | undefined
}

const defaultValues: PatientLeadDetailsFormData = {
  pocName: '', pocPhone: '', pocRelationship: '', pocEmail: '', startDate: '',
}

export default function EditPatientLeadDetailsModal({ isOpen, onClose, onSuccess, leadId, details }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setError } = useForm<PatientLeadDetailsFormData>({
    resolver: zodResolver(patientLeadDetailsSchema), mode: 'onBlur', defaultValues,
  })

  useEffect(() => {
    if (!isOpen) return
    reset({
      pocName: details?.poc_name ?? '', pocPhone: details?.poc_phone ?? '',
      pocRelationship: details?.poc_relationship ?? '', pocEmail: details?.poc_email ?? '',
      startDate: details?.start_date ?? '',
    })
  }, [isOpen, details, reset])

  const onSubmit = async (data: PatientLeadDetailsFormData) => {
    const result = await updatePatientLeadDetailsAction(leadId, {
      pocName: data.pocName || null, pocPhone: data.pocPhone || null,
      pocRelationship: data.pocRelationship || null, pocEmail: data.pocEmail || null,
      startDate: data.startDate || null,
    })
    if (!result.success) {
      if (result.fieldErrors) Object.entries(result.fieldErrors).forEach(([field, messages]) => {
        setError(field as keyof PatientLeadDetailsFormData, { message: messages[0] })
      })
      if (result.error) showValidationToast({ error: result.error })
      return
    }
    showSuccessToast('Lead contact details saved')
    onSuccess()
    onClose()
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Lead Contact Details" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Keep this record limited to information needed to contact and qualify the prospect. Clinical, demographic,
          and insurance information is collected after conversion during client intake.
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Primary contact or representative</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelCls}>Name</label>
              <input className={inputCls} {...register('pocName')} placeholder="Family member or representative" />
              {errors.pocName && <p className="mt-1 text-sm text-red-600">{errors.pocName.message}</p>}
            </div>
            <div><label className={labelCls}>Phone</label><PhoneInput className={inputCls} {...register('pocPhone')} error={errors.pocPhone?.message} /></div>
            <div>
              <label className={labelCls}>Relationship</label>
              <select className={inputCls} {...register('pocRelationship')}>
                <option value="">— Select —</option><option value="spouse">Spouse</option><option value="child">Child</option>
                <option value="sibling">Sibling</option><option value="parent">Parent</option><option value="friend">Friend</option><option value="other">Other</option>
              </select>
            </div>
            <div className="md:col-span-2"><label className={labelCls}>Email</label><EmailInput className={inputCls} {...register('pocEmail')} error={errors.pocEmail?.message} /></div>
          </div>
        </div>
        <div className="max-w-sm">
          <label className={labelCls}>Desired Start Date</label>
          <input type="date" className={inputCls} {...register('startDate')} />
          <p className="mt-1 text-xs text-gray-500">Approximate only; the agency confirms service dates during intake.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isSubmitting} loading={isSubmitting}>Save Details</Button>
        </div>
      </form>
    </Modal>
  )
}
