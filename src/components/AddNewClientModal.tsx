'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { useRouter } from 'next/navigation'
import { createAgencyAdminAccount } from '@/app/actions/users'
import { US_STATES } from '@/lib/constants'
import { isValidUSPhone, isValidEmail, PHONE_ERROR, EMAIL_ERROR } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'

type AddNewClientModalMode = 'agency_admin' | 'care_recipient'

interface AddNewClientModalProps {
  isOpen: boolean
  onClose: () => void
  /** Care recipient inserts return the inserted row for immediate list merge; agency admin ignores args. */
  onSuccess?: (insertedPatient?: Record<string, unknown>) => void
  /** When 'agency_admin', form targets clients table (company/contact fields). When 'care_recipient', targets patients. */
  mode?: AddNewClientModalMode
}

const AGENCY_FORM_INITIAL = {
  first_name: '',
  last_name: '',
  contact_email: '',
  contact_phone: '',
  job_title: '',
  department: '',
  work_location: '',
  status: 'active' as 'active' | 'inactive' | 'pending',
}

export default function AddNewClientModal({ isOpen, onClose, onSuccess, mode = 'care_recipient' }: AddNewClientModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const [agencyFormData, setAgencyFormData] = useState(AGENCY_FORM_INITIAL)

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

  if (!isOpen) return null

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleAgencyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setAgencyFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'agency_admin') {
      if (agencyFormData.contact_phone && !isValidUSPhone(agencyFormData.contact_phone)) {
        showValidationToast({ error: PHONE_ERROR })
        return
      }
    }

    if (mode === 'care_recipient') {
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
    }

    setIsLoading(true)

    try {
      if (mode === 'agency_admin') {
        const result = await createAgencyAdminAccount(
          agencyFormData.first_name.trim(),
          agencyFormData.last_name.trim(),
          agencyFormData.contact_email.trim(),
          agencyFormData.contact_phone.trim(),
          agencyFormData.job_title.trim() || undefined,
          agencyFormData.department.trim() || undefined,
          agencyFormData.work_location.trim(),
          agencyFormData.status
        )

        if (result.error) {
          showValidationToast({ error: result.error })
          setIsLoading(false)
          return
        }

        showSuccessToast('Agency admin added successfully')
        setAgencyFormData(AGENCY_FORM_INITIAL)
        onSuccess?.()
        await router.refresh()
        onClose()
        return
      }

      // care_recipient: patients
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
        date_of_birth: formData.date_of_birth,
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

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="p-6">
          {mode === 'agency_admin' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-semibold text-gray-700 mb-2">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="first_name"
                  name="first_name"
                  value={agencyFormData.first_name}
                  onChange={handleAgencyChange}
                  placeholder="Jane"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="last_name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="last_name"
                  name="last_name"
                  value={agencyFormData.last_name}
                  onChange={handleAgencyChange}
                  placeholder="Smith"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="contact_email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="contact_email"
                  name="contact_email"
                  value={agencyFormData.contact_email}
                  onChange={handleAgencyChange}
                  placeholder="contact@company.com"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="contact_phone" className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Phone
                </label>
                <PhoneInput
                  id="contact_phone"
                  name="contact_phone"
                  value={agencyFormData.contact_phone}
                  onChange={handleAgencyChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="job_title" className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Title
                </label>
                <input
                  type="text"
                  id="job_title"
                  name="job_title"
                  value={agencyFormData.job_title}
                  onChange={handleAgencyChange}
                  placeholder="Operations Manager"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="department" className="block text-sm font-semibold text-gray-700 mb-2">
                  Department
                </label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  value={agencyFormData.department}
                  onChange={handleAgencyChange}
                  placeholder="Licensing"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="work_location" className="block text-sm font-semibold text-gray-700 mb-2">
                  Work Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="work_location"
                  name="work_location"
                  value={agencyFormData.work_location}
                  onChange={handleAgencyChange}
                  placeholder="Austin, TX"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="agency_status" className="block text-sm font-semibold text-gray-700 mb-2">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  id="agency_status"
                  name="status"
                  value={agencyFormData.status}
                  onChange={handleAgencyChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          ) : (
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
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="date_of_birth"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                required
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
          )}

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
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
      </div>
    </div>
  )
}
