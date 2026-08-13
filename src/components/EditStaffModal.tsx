'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { US_PHONE_REGEX, PHONE_ERROR } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'
import { Loader2 } from 'lucide-react'
import { appendCaregiverPayRateAction } from '@/app/actions/caregiver-pay-rates'

const staffMemberSchema = z
  .object({
    first_name: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
    last_name: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().optional().refine(val => !val || US_PHONE_REGEX.test(val.trim()), PHONE_ERROR),
    role: z.string().min(1, 'Role is required'),
    job_title: z.string().optional(),
    status: z.enum(['active', 'inactive', 'pending']),
    employee_id: z.string().optional(),
    start_date: z.string().optional(),
    pay_rate_hourly: z.string().optional(),
    pay_rate_effective_date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const t = data.pay_rate_hourly?.trim() ?? ''
    if (!t) return
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pay rate must be a valid non-negative number.',
        path: ['pay_rate_hourly'],
      })
    }
  })

type StaffMemberFormData = z.infer<typeof staffMemberSchema>

function normalizeStaffStatus(status: string): 'active' | 'inactive' | 'pending' {
  const s = status.toLowerCase()
  if (s === 'active' || s === 'inactive' || s === 'pending') return s
  return 'pending'
}

const ROLE_OPTIONS = [
  'Registered Nurse',
  'Licensed Practical Nurse',
  'Certified Nursing Assistant',
  'Home Health Aide',
  'Physical Therapist',
  'Occupational Therapist',
  'Speech Therapist',
  'Medical Social Worker',
  'Other',
]

interface StaffMember {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  role: string
  job_title?: string | null
  status: string
  employee_id?: string | null
  start_date?: string | null
  currentPayRate?: number | null
  pay_rate?: string | number | null
}

interface EditStaffModalProps {
  isOpen: boolean
  onClose: () => void
  staff: StaffMember
  /** When set (e.g. from agency page), role dropdown uses these names from `caregiver_roles`. */
  staffRoleNames?: string[]
  onSuccess?: () => void
}

function defaultPayRateEffectiveDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function initialPayRateField(staff: StaffMember): string {
  if (staff.currentPayRate !== undefined && staff.currentPayRate !== null && Number.isFinite(staff.currentPayRate)) {
    return String(staff.currentPayRate)
  }
  if (staff.pay_rate !== null && staff.pay_rate !== undefined && staff.pay_rate !== '') {
    return typeof staff.pay_rate === 'number' ? staff.pay_rate.toFixed(2) : String(staff.pay_rate)
  }
  return ''
}

export default function EditStaffModal({
  isOpen,
  onClose,
  staff,
  staffRoleNames,
  onSuccess,
}: EditStaffModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleSelectOptions = useMemo(() => {
    const base =
      staffRoleNames && staffRoleNames.length > 0 ? [...staffRoleNames] : [...ROLE_OPTIONS]
    if (staff.role && !base.includes(staff.role)) {
      return [staff.role, ...base]
    }
    return base
  }, [staffRoleNames, staff.role])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<StaffMemberFormData>({
    resolver: zodResolver(staffMemberSchema),
    mode: 'onBlur',
    defaultValues: {
      first_name: staff.first_name,
      last_name: staff.last_name,
      email: staff.email,
      phone: staff.phone || '',
      role: staff.role,
      job_title: staff.job_title || '',
      status: normalizeStaffStatus(staff.status),
      employee_id: staff.employee_id || '',
      start_date: staff.start_date ? staff.start_date.split('T')[0] : '',
      pay_rate_hourly: initialPayRateField(staff),
      pay_rate_effective_date: defaultPayRateEffectiveDate(),
    },
  })

  useEffect(() => {
    if (isOpen && staff) {
      reset({
        first_name: staff.first_name,
        last_name: staff.last_name,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        job_title: staff.job_title || '',
        status: normalizeStaffStatus(staff.status),
        employee_id: staff.employee_id || '',
        start_date: staff.start_date ? staff.start_date.split('T')[0] : '',
        pay_rate_hourly: initialPayRateField(staff),
        pay_rate_effective_date: defaultPayRateEffectiveDate(),
      })
    }
  }, [isOpen, staff, reset])

  const onSubmit = async (data: StaffMemberFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { error: updateError } = await q.updateStaffMember(supabase, staff.id, {
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

      if (updateError) {
        throw updateError
      }

      const payTrim = (data.pay_rate_hourly ?? '').trim()
      if (payTrim !== '') {
        const nextRate = Number(payTrim)
        const prev =
          staff.currentPayRate !== undefined && staff.currentPayRate !== null
            ? Number(staff.currentPayRate)
            : staff.pay_rate !== null && staff.pay_rate !== undefined && staff.pay_rate !== ''
              ? typeof staff.pay_rate === 'number'
                ? staff.pay_rate
                : Number(staff.pay_rate)
              : NaN
        const eff = (data.pay_rate_effective_date ?? '').trim() || defaultPayRateEffectiveDate()
        const rateChanged = !Number.isFinite(prev) || Math.abs(nextRate - prev) > 0.000001
        if (rateChanged) {
          const payRes = await appendCaregiverPayRateAction({
            caregiverMemberId: staff.id,
            payRate: nextRate,
            effectiveDate: eff.slice(0, 10),
            serviceType: null,
          })
          if (payRes.error) {
            throw new Error(payRes.error)
          }
        }
      }

      reset()
      onClose()

      router.refresh()

      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update staff member. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      reset()
      setError(null)
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Caregiver" size="xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

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
              {roleSelectOptions.map((role) => (
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

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Pay rate ($/hr)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Changing the amount adds a new dated row and closes the previous rate on the effective date you choose
              (same day is allowed).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay_rate_hourly" className="block text-sm font-semibold text-gray-700 mb-2">
                Hourly pay
              </label>
              <input
                id="pay_rate_hourly"
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 22.50"
                {...register('pay_rate_hourly')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.pay_rate_hourly && (
                <p className="mt-1 text-sm text-red-600">{errors.pay_rate_hourly.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="pay_rate_effective_date" className="block text-sm font-semibold text-gray-700 mb-2">
                Effective date (for pay change)
              </label>
              <input
                id="pay_rate_effective_date"
                type="date"
                {...register('pay_rate_effective_date')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.pay_rate_effective_date && (
                <p className="mt-1 text-sm text-red-600">{errors.pay_rate_effective_date.message}</p>
              )}
            </div>
          </div>
        </div>

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
                Updating...
              </>
            ) : (
              'Update Caregiver'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

