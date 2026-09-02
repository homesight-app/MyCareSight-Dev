'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { useRouter } from 'next/navigation'
import { createAgencyAdminAccount } from '@/app/actions/users'
import { US_STATES } from '@/lib/constants'
import { isValidUSPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'
import { agencyAdminFormSchema, type AgencyAdminFormData } from '@/lib/schemas/client'

type AddNewClientModalMode = 'agency_admin' | 'care_recipient'

interface AddNewClientModalProps {
  isOpen: boolean
  onClose: () => void
  /** Care recipient inserts return the inserted row for immediate list merge; agency admin ignores args. */
  onSuccess?: (insertedPatient?: Record<string, unknown>) => void
  /** When 'agency_admin', form targets clients table (company/contact fields). When 'care_recipient', targets patients. */
  mode?: AddNewClientModalMode
  /** Pre-fills contact fields when opening from a lead conversion. */
  prefill?: { firstName?: string; lastName?: string; email?: string; phone?: string; gender?: string; dateOfBirth?: string }
}

export default function AddNewClientModal({ isOpen, onClose, onSuccess, mode = 'care_recipient', prefill }: AddNewClientModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // ─── Agency admin form (RHF + Zod) ───────────────────────────────────────
  const {
    register: agencyRegister,
    handleSubmit: agencyHandleSubmit,
    formState: { errors: agencyErrors },
    reset: resetAgencyForm,
  } = useForm<AgencyAdminFormData>({
    resolver: zodResolver(agencyAdminFormSchema),
    mode: 'onBlur',
    defaultValues: {
      first_name: '',
      last_name: '',
      contact_email: '',
      contact_phone: '',
      job_title: '',
      department: '',
      work_location: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (!isOpen) resetAgencyForm()
  }, [isOpen, resetAgencyForm])

  const onAgencySubmit = async (data: AgencyAdminFormData) => {
    setIsLoading(true)
    try {
      const result = await createAgencyAdminAccount(
        data.first_name.trim(),
        data.last_name.trim(),
        data.contact_email.trim(),
        data.contact_phone?.trim() ?? '',
        data.job_title?.trim() || undefined,
        data.department?.trim() || undefined,
        data.work_location.trim(),
        data.status
      )
      if (result.error) {
        showValidationToast({ error: result.error })
        return
      }
      showSuccessToast('Agency admin added successfully')
      resetAgencyForm()
      onSuccess?.()
      await router.refresh()
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Care recipient form (existing controlled state) ─────────────────────
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
    phone_number: '',
    email_address: '',
    emergency_contact_name: '',
    emergency_phone: '',
    primary_diagnosis: '',
    current_medications: '',
    allergies: '',
    gender: '',
    class: ''
  })

  useEffect(() => {
    if (!isOpen || !prefill) return
    setFormData(prev => ({
      ...prev,
      first_name:    prefill.firstName   ?? prev.first_name,
      last_name:     prefill.lastName    ?? prev.last_name,
      email_address: prefill.email       ?? prev.email_address,
      phone_number:  prefill.phone       ?? prev.phone_number,
      gender:        prefill.gender      ?? prev.gender,
      date_of_birth: prefill.dateOfBirth ?? prev.date_of_birth,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCareRecipientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.phone_number && !isValidUSPhone(formData.phone_number)) {
      showValidationToast({ error: `Phone number: ${PHONE_ERROR}` })
      return
    }
    if (formData.emergency_phone && !isValidUSPhone(formData.emergency_phone)) {
      showValidationToast({ error: `Emergency phone: ${PHONE_ERROR}` })
      return
    }
    if (formData.email_address && !isValidEmail(formData.email_address)) {
      showValidationToast({ error: EMAIL_ERROR })
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        showValidationToast({ error: 'You must be logged in to add a client' })
        setIsLoading(false)
        return
      }

      const { data: up } = await q.getAgencyIdFromProfile(supabase, user.id)
      if (!up?.agency_id) {
        showValidationToast({ error: 'Your account is not linked to an agency. Please contact the administrator.' })
        setIsLoading(false)
        return
      }

      const { data: insertedPatient, error: insertError } = await q.insertPatient(supabase, {
        agency_id: up.agency_id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth || null,
        street_address: formData.street_address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        phone_number: formData.phone_number,
        email_address: formData.email_address,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_phone: formData.emergency_phone,
        primary_diagnosis: formData.primary_diagnosis || null,
        current_medications: formData.current_medications || null,
        allergies: formData.allergies || null,
        gender: formData.gender || null,
        class: formData.class || null,
        status: 'active',
      })

      if (insertError || !insertedPatient) {
        showValidationToast({ error: insertError?.message ?? 'Failed to create client profile.' })
        setIsLoading(false)
        return
      }

      // Seed the initial primary address into patient_addresses
      if (formData.street_address.trim()) {
        await q.insertPatientAddress(supabase, {
          patient_id: (insertedPatient as any).id,
          agency_id: up.agency_id,
          label: 'Home',
          street_address: formData.street_address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code,
          is_primary: true,
        })
      }

      setFormData({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        street_address: '',
        city: '',
        state: '',
        zip_code: '',
        phone_number: '',
        email_address: '',
        emergency_contact_name: '',
        emergency_phone: '',
        primary_diagnosis: '',
        current_medications: '',
        allergies: '',
        gender: '',
        class: ''
      })

      showSuccessToast('Client added successfully')
      onSuccess?.(insertedPatient as Record<string, unknown>)
      await router.refresh()
      onClose()
    } catch {
      showValidationToast({ error: 'An unexpected error occurred. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'agency_admin' ? 'Add New Agency Admin' : 'Add New Care Recipient'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {mode === 'agency_admin'
                ? 'Add an agency admin. Data is stored in user_profiles first, then in the clients table. A login link will be sent to the contact email.'
                : 'Enter client information to create a new care recipient profile'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {mode === 'agency_admin' ? (
          <form onSubmit={agencyHandleSubmit(onAgencySubmit)} noValidate className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-semibold text-gray-700 mb-2">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...agencyRegister('first_name')}
                  type="text"
                  id="first_name"
                  placeholder="Jane"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {agencyErrors.first_name && <p className="mt-1 text-sm text-red-600">{agencyErrors.first_name.message}</p>}
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...agencyRegister('last_name')}
                  type="text"
                  id="last_name"
                  placeholder="Smith"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {agencyErrors.last_name && <p className="mt-1 text-sm text-red-600">{agencyErrors.last_name.message}</p>}
              </div>
              <div>
                <label htmlFor="contact_email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Email <span className="text-red-500">*</span>
                </label>
                <EmailInput
                  {...agencyRegister('contact_email')}
                  id="contact_email"
                  placeholder="contact@company.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  error={agencyErrors.contact_email?.message}
                />
              </div>
              <div>
                <label htmlFor="contact_phone" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Phone
                </label>
                <PhoneInput
                  {...agencyRegister('contact_phone')}
                  id="contact_phone"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  error={agencyErrors.contact_phone?.message}
                />
              </div>
              <div>
                <label htmlFor="job_title" className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Title
                </label>
                <input
                  {...agencyRegister('job_title')}
                  type="text"
                  id="job_title"
                  placeholder="Operations Manager"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="department" className="block text-sm font-semibold text-gray-700 mb-2">
                  Department
                </label>
                <input
                  {...agencyRegister('department')}
                  type="text"
                  id="department"
                  placeholder="Licensing"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="work_location" className="block text-sm font-semibold text-gray-700 mb-2">
                  Work Location <span className="text-red-500">*</span>
                </label>
                <input
                  {...agencyRegister('work_location')}
                  type="text"
                  id="work_location"
                  placeholder="Austin, TX"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {agencyErrors.work_location && <p className="mt-1 text-sm text-red-600">{agencyErrors.work_location.message}</p>}
              </div>
              <div>
                <label htmlFor="agency_status" className="block text-sm font-semibold text-gray-700 mb-2">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  {...agencyRegister('status')}
                  id="agency_status"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? 'Adding...' : <><Plus className="w-4 h-4" />Add Client</>}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCareRecipientSubmit} noValidate className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label htmlFor="first_name" className="block text-sm font-semibold text-gray-700 mb-2">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                placeholder="Jane"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Last Name */}
            <div>
              <label htmlFor="last_name" className="block text-sm font-semibold text-gray-700 mb-2">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                placeholder="Doe"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="date_of_birth" className="block text-sm font-semibold text-gray-700 mb-2">
                Date of Birth
              </label>
              <input
                type="date"
                id="date_of_birth"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Street Address */}
            <div>
              <label htmlFor="street_address" className="block text-sm font-semibold text-gray-700 mb-2">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="street_address"
                name="street_address"
                value={formData.street_address}
                onChange={handleChange}
                placeholder="123 Main Street"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* City */}
            <div>
              <label htmlFor="city" className="block text-sm font-semibold text-gray-700 mb-2">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Austin"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* State */}
            <div>
              <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select state</option>
                {US_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            {/* ZIP Code */}
            <div>
              <label htmlFor="zip_code" className="block text-sm font-semibold text-gray-700 mb-2">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="zip_code"
                name="zip_code"
                value={formData.zip_code}
                onChange={handleChange}
                placeholder="78701"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone_number" className="block text-sm font-semibold text-gray-700 mb-2">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <PhoneInput
                id="phone_number"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Email Address */}
            <div>
              <label htmlFor="email_address" className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email_address"
                name="email_address"
                value={formData.email_address}
                onChange={handleChange}
                placeholder="client@email.com"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Emergency Contact Name */}
            <div>
              <label htmlFor="emergency_contact_name" className="block text-sm font-semibold text-gray-700 mb-2">
                Emergency Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="emergency_contact_name"
                name="emergency_contact_name"
                value={formData.emergency_contact_name}
                onChange={handleChange}
                placeholder="Jane Doe (Daughter)"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Emergency Phone */}
            <div>
              <label htmlFor="emergency_phone" className="block text-sm font-semibold text-gray-700 mb-2">
                Emergency Phone <span className="text-red-500">*</span>
              </label>
              <PhoneInput
                id="emergency_phone"
                name="emergency_phone"
                value={formData.emergency_phone}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Gender */}
            <div>
              <label htmlFor="gender" className="block text-sm font-semibold text-gray-700 mb-2">
                Gender
              </label>
              <select
                id="gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            {/* Class */}
            <div>
              <label htmlFor="class" className="block text-sm font-semibold text-gray-700 mb-2">
                Class
              </label>
              <select
                id="class"
                name="class"
                value={formData.class}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select class</option>
                <option value="Private Pay">Private Pay</option>
                <option value="Medicare">Medicare</option>
                <option value="Medicaid">Medicaid</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Primary Diagnosis */}
            <div className="md:col-span-2">
              <label htmlFor="primary_diagnosis" className="block text-sm font-semibold text-gray-700 mb-2">
                Primary Diagnosis
              </label>
              <textarea
                id="primary_diagnosis"
                name="primary_diagnosis"
                value={formData.primary_diagnosis}
                onChange={handleChange}
                placeholder="e.g., Alzheimer's Disease"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Current Medications */}
            <div className="md:col-span-2">
              <label htmlFor="current_medications" className="block text-sm font-semibold text-gray-700 mb-2">
                Current Medications
              </label>
              <textarea
                id="current_medications"
                name="current_medications"
                value={formData.current_medications}
                onChange={handleChange}
                placeholder="List medications with dosages"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Allergies */}
            <div className="md:col-span-2">
              <label htmlFor="allergies" className="block text-sm font-semibold text-gray-700 mb-2">
                Allergies
              </label>
              <textarea
                id="allergies"
                name="allergies"
                value={formData.allergies}
                onChange={handleChange}
                placeholder="e.g., Penicillin, Peanuts"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                'Adding...'
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Client
                </>
              )}
            </button>
          </div>
          </form>
        )}
      </div>
    </div>
  )
}
