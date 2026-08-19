'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { US_PHONE_REGEX, PHONE_ERROR } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { createStaffUserAccount } from '@/app/actions/users'
import Modal from './Modal'
import { Loader2 } from 'lucide-react'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'

const staffMemberSchema = z.object({
  first_name: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional().refine(val => !val || US_PHONE_REGEX.test(val.trim()), PHONE_ERROR),
  role: z.string().min(1, 'Role is required'),
  job_title: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending']),
  employee_id: z.string().optional(),
  start_date: z.string().optional(),
})

type StaffMemberFormData = z.infer<typeof staffMemberSchema>


interface AddStaffMemberModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  staffRoleNames: string[]
}

export default function AddStaffMemberModal({ isOpen, onClose, onSuccess, staffRoleNames }: AddStaffMemberModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<StaffMemberFormData>({
    resolver: zodResolver(staffMemberSchema),
    mode: 'onBlur',
    defaultValues: {
      status: 'active',
    },
  })

  const onSubmit = async (data: StaffMemberFormData) => {
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        showValidationToast({ error: 'You must be logged in to add a staff member' })
        setIsLoading(false)
        return
      }

      const { data: up } = await q.getAgencyIdFromProfile(supabase, user.id)
      const agencyId = up?.agency_id ?? null
      if (!agencyId) {
        showValidationToast({ error: 'Your account is not linked to an agency. Please contact the administrator.' })
        setIsLoading(false)
        return
      }

      let agencyName = ''
      const { data: agency } = await q.getAgencyNameById(supabase, agencyId)
      agencyName = agency?.name ?? ''

      const result = await createStaffUserAccount(
        data.email,
        data.first_name,
        data.last_name,
        agencyName || undefined
      )

      if (result.error || !result.data) {
        showValidationToast({ error: result.error || 'Failed to create user account. Please try again.' })
        setIsLoading(false)
        return
      }

      const userAccount = result.data

      if (!userAccount || !userAccount.userId) {
        showValidationToast({ error: 'User account was created but user ID is missing. Please contact support.' })
        setIsLoading(false)
        return
      }

      const userIdToUse = userAccount.userId

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(userIdToUse)) {
        showValidationToast({ error: 'User account was created but the ID is invalid. Please contact support.' })
        setIsLoading(false)
        return
      }

      const { data: staffMember, error: insertError } = await q.insertStaffMemberReturning(supabase, {
        agency_id: agencyId,
        user_id: userIdToUse,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        role: data.role,
        job_title: data.job_title || null,
        status: data.status,
        employee_id: data.employee_id || null,
        start_date: data.start_date || null,
      })

      if (insertError || !staffMember) {
        showValidationToast({ error: 'Failed to create staff member record. The user account was created successfully. Please contact support.' })
        setIsLoading(false)
        return
      }

      showSuccessToast(`Staff member created! Login link sent to ${data.email}.`)
      reset()
      onClose()
      router.refresh()
      onSuccess?.()
    } catch (err: any) {
      showValidationToast({ error: err.message || 'Failed to add caregiver. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      reset()
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add caregiver" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-semibold text-gray-700 mb-2">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              id="first_name"
              type="text"
              {...register('first_name')}
              placeholder="John"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.first_name && (
              <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="last_name" className="block text-sm font-semibold text-gray-700 mb-2">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              id="last_name"
              type="text"
              {...register('last_name')}
              placeholder="Doe"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.last_name && (
              <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
            )}
          </div>
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            {...register('email')}
            placeholder="john.doe@example.com"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        {/* Phone Field */}
        <div>
          <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
            Phone
          </label>
          <PhoneInput
            id="phone"
            {...register('phone')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            error={errors.phone?.message}
            disabled={isLoading}
          />
        </div>

        {/* Role and Job Title */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              id="role"
              {...register('role')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
              disabled={isLoading}
            >
              <option value="">Select a role</option>
              {staffRoleNames.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {errors.role && (
              <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="job_title" className="block text-sm font-semibold text-gray-700 mb-2">
              Job Title
            </label>
            <input
              id="job_title"
              type="text"
              {...register('job_title')}
              placeholder="e.g., Senior Nurse"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.job_title && (
              <p className="mt-1 text-sm text-red-600">{errors.job_title.message}</p>
            )}
          </div>
        </div>

        {/* Status and Employee ID */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-2">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              id="status"
              {...register('status')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
              disabled={isLoading}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
            {errors.status && (
              <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="employee_id" className="block text-sm font-semibold text-gray-700 mb-2">
              Employee ID
            </label>
            <input
              id="employee_id"
              type="text"
              {...register('employee_id')}
              placeholder="EMP-001"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.employee_id && (
              <p className="mt-1 text-sm text-red-600">{errors.employee_id.message}</p>
            )}
          </div>
        </div>

        {/* Start Date */}
        {/* <div>
          <label htmlFor="start_date" className="block text-sm font-semibold text-gray-700 mb-2">
            Start Date
          </label>
          <input
            id="start_date"
            type="date"
            {...register('start_date')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.start_date && (
            <p className="mt-1 text-sm text-red-600">{errors.start_date.message}</p>
          )}
        </div> */}

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Caregiver'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

