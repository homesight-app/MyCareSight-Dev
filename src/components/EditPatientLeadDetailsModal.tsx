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
import type { PatientLeadDetails } from '@/lib/supabase/query'
import Button from '@/components/ui/PrimaryButton'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  leadId: string
  details: PatientLeadDetails | null | undefined
}

const defaultValues: PatientLeadDetailsFormData = {
  pocName: '',
  pocPhone: '',
  pocRelationship: '',
  pocEmail: '',
  reasonForCare: '',
  mobilityStatus: '',
  cognitiveStatus: '',
  medicalConditions: '',
  gender: '',
  dateOfBirth: '',
  startDate: '',
  scheduleType: '',
  livingSituation: '',
  paymentMethod: '',
  insuranceCarrier: '',
  insurancePolicyNumber: '',
}

export default function EditPatientLeadDetailsModal({ isOpen, onClose, onSuccess, leadId, details }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<PatientLeadDetailsFormData>({
    resolver: zodResolver(patientLeadDetailsSchema),
    mode: 'onBlur',
    defaultValues,
  })

  useEffect(() => {
    if (!isOpen) return
    reset({
      pocName: details?.poc_name ?? '',
      pocPhone: details?.poc_phone ?? '',
      pocRelationship: details?.poc_relationship ?? '',
      pocEmail: details?.poc_email ?? '',
      reasonForCare: details?.reason_for_care ?? '',
      mobilityStatus: details?.mobility_status ?? '',
      cognitiveStatus: details?.cognitive_status ?? '',
      medicalConditions: details?.medical_conditions ?? '',
      gender: details?.gender ?? '',
      dateOfBirth: details?.date_of_birth ?? '',
      startDate: details?.start_date ?? '',
      scheduleType: details?.schedule_type ?? '',
      livingSituation: details?.living_situation ?? '',
      paymentMethod: details?.payment_method ?? '',
      insuranceCarrier: details?.insurance_carrier ?? '',
      insurancePolicyNumber: details?.insurance_policy_number ?? '',
    })
  }, [isOpen, details, reset])

  const onSubmit = async (data: PatientLeadDetailsFormData) => {
    const result = await updatePatientLeadDetailsAction(leadId, {
      pocName: data.pocName || null,
      pocPhone: data.pocPhone || null,
      pocRelationship: data.pocRelationship || null,
      pocEmail: data.pocEmail || null,
      reasonForCare: data.reasonForCare || null,
      mobilityStatus: data.mobilityStatus || null,
      cognitiveStatus: data.cognitiveStatus || null,
      medicalConditions: data.medicalConditions || null,
      gender: data.gender || null,
      dateOfBirth: data.dateOfBirth || null,
      startDate: data.startDate || null,
      scheduleType: data.scheduleType || null,
      livingSituation: data.livingSituation || null,
      paymentMethod: data.paymentMethod || null,
      insuranceCarrier: data.insuranceCarrier || null,
      insurancePolicyNumber: data.insurancePolicyNumber || null,
    })

    if (!result.success) {
      if (result.fieldErrors) {
        Object.entries(result.fieldErrors).forEach(([field, msgs]) => {
          setError(field as keyof PatientLeadDetailsFormData, { message: msgs[0] })
        })
      }
      if (result.error) showValidationToast({ error: result.error })
      return
    }

    showSuccessToast('Patient details saved')
    onSuccess()
    onClose()
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Patient Details" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

        {/* Point of Contact */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Point of Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Name</label>
              <input className={inputCls} {...register('pocName')} placeholder="Family member or representative" />
              {errors.pocName && <p className="mt-1 text-sm text-red-600">{errors.pocName.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <PhoneInput className={inputCls} {...register('pocPhone')} error={errors.pocPhone?.message} />
            </div>
            <div>
              <label className={labelCls}>Relationship</label>
              <select className={inputCls} {...register('pocRelationship')}>
                <option value="">— Select —</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="parent">Parent</option>
                <option value="friend">Friend</option>
                <option value="other">Other</option>
              </select>
              {errors.pocRelationship && <p className="mt-1 text-sm text-red-600">{errors.pocRelationship.message}</p>}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Email</label>
              <EmailInput className={inputCls} {...register('pocEmail')} error={errors.pocEmail?.message} />
            </div>
          </div>
        </div>

        {/* Demographics */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Demographics</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Gender</label>
              <select className={inputCls} {...register('gender')}>
                <option value="">— Select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
              {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} {...register('dateOfBirth')} />
              {errors.dateOfBirth && <p className="mt-1 text-sm text-red-600">{errors.dateOfBirth.message}</p>}
            </div>
          </div>
        </div>

        {/* Care & Medical Needs */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Care &amp; Medical Needs</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Reason for Care</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                {...register('reasonForCare')}
                placeholder="e.g. post-surgery recovery, aging in place, dementia care"
              />
              {errors.reasonForCare && <p className="mt-1 text-sm text-red-600">{errors.reasonForCare.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Mobility Status</label>
              <select className={inputCls} {...register('mobilityStatus')}>
                <option value="">— Select —</option>
                <option value="independent">Independent</option>
                <option value="needs_assistance">Needs Assistance</option>
                <option value="bedridden">Bedridden</option>
              </select>
              {errors.mobilityStatus && <p className="mt-1 text-sm text-red-600">{errors.mobilityStatus.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Cognitive Status</label>
              <select className={inputCls} {...register('cognitiveStatus')}>
                <option value="">— Select —</option>
                <option value="fully_alert">Fully Alert</option>
                <option value="memory_loss">Memory Loss</option>
                <option value="dementia">Dementia</option>
              </select>
              {errors.cognitiveStatus && <p className="mt-1 text-sm text-red-600">{errors.cognitiveStatus.message}</p>}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Medical Conditions</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                {...register('medicalConditions')}
                placeholder="Relevant diagnoses or conditions"
              />
              {errors.medicalConditions && <p className="mt-1 text-sm text-red-600">{errors.medicalConditions.message}</p>}
            </div>
          </div>
        </div>

        {/* Schedule & Living */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule &amp; Living</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" className={inputCls} {...register('startDate')} />
              {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Schedule Type</label>
              <select className={inputCls} {...register('scheduleType')}>
                <option value="">— Select —</option>
                <option value="hourly">Hourly</option>
                <option value="24_7">24/7</option>
                <option value="live_in">Live-In</option>
              </select>
              {errors.scheduleType && <p className="mt-1 text-sm text-red-600">{errors.scheduleType.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Living Situation</label>
              <select className={inputCls} {...register('livingSituation')}>
                <option value="">— Select —</option>
                <option value="lives_alone">Lives Alone</option>
                <option value="with_family">With Family</option>
              </select>
              {errors.livingSituation && <p className="mt-1 text-sm text-red-600">{errors.livingSituation.message}</p>}
            </div>
          </div>
        </div>

        {/* Financial & Insurance */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Financial &amp; Insurance</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Payment Method</label>
              <select className={inputCls} {...register('paymentMethod')}>
                <option value="">— Select —</option>
                <option value="private_pay">Private Pay</option>
                <option value="ltc_insurance">LTC Insurance</option>
                <option value="medicaid">Medicaid</option>
              </select>
              {errors.paymentMethod && <p className="mt-1 text-sm text-red-600">{errors.paymentMethod.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Insurance Carrier</label>
              <input className={inputCls} {...register('insuranceCarrier')} />
              {errors.insuranceCarrier && <p className="mt-1 text-sm text-red-600">{errors.insuranceCarrier.message}</p>}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Policy Number</label>
              <input className={inputCls} {...register('insurancePolicyNumber')} />
              {errors.insurancePolicyNumber && <p className="mt-1 text-sm text-red-600">{errors.insurancePolicyNumber.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Save Details
          </Button>
        </div>
      </form>
    </Modal>
  )
}
