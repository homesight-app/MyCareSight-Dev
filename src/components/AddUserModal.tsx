'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createUserAccount, type CreateUserRole } from '@/app/actions/users'
import { addUserSchema, type AddUserFormData, AGENCY_ROLES } from '@/lib/schemas/user'
import EmailInput from '@/components/ui/EmailInput'
import { showValidationToast, showSuccessToast } from '@/lib/form-validation-toast'


interface AddUserModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  agencies?: { id: string; name: string }[]
}

export default function AddUserModal({ isOpen, onClose, onSuccess, agencies = [] }: AddUserModalProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setError,
  } = useForm<AddUserFormData>({
    resolver: zodResolver(addUserSchema),
    mode: 'onBlur',
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'company_owner',
      agency_id: '',
    },
  })

  const role = watch('role')
  const showAgencyField = AGENCY_ROLES.includes(role)

  useEffect(() => {
    if (!isOpen) reset()
  }, [isOpen, reset])

  if (!isOpen) return null

  const onSubmit = async (data: AddUserFormData) => {
    try {
      const result = await createUserAccount(
        data.email,
        data.password,
        data.full_name,
        data.role as CreateUserRole,
        showAgencyField ? data.agency_id?.trim() || null : null
      )

      if (result.error) {
        showValidationToast({ error: result.error })
        return
      }

      showSuccessToast('User created successfully')
      reset()
      onSuccess?.()
      router.refresh()
      onClose()
    } catch {
      showValidationToast({ error: 'An unexpected error occurred. Please try again.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Add User</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-semibold text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="full_name"
              {...register('full_name')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Jane Doe"
              disabled={isSubmitting}
            />
            {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <EmailInput
              id="email"
              {...register('email')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="user@example.com"
              error={errors.email?.message}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
              {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
            <select
              id="role"
              {...register('role')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={isSubmitting}
            >
              <option value="admin">Admin</option>
              <option value="company_owner">Agency Admin</option>
              <option value="staff_member">Caregiver</option>
              <option value="care_coordinator">Care Coordinator</option>
              <option value="expert">Expert</option>
            </select>
          </div>

          {showAgencyField && (
            <div>
              <label htmlFor="agency_id" className="block text-sm font-semibold text-gray-700 mb-2">
                Agency <span className="text-red-500">*</span>
              </label>
              <select
                id="agency_id"
                {...register('agency_id')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={isSubmitting}
              >
                <option value="">Select an agency</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {errors.agency_id && <p className="mt-1 text-sm text-red-600">{errors.agency_id.message}</p>}
              {agencies.length === 0 && (
                <p className="mt-1 text-sm text-amber-600">No agencies available. Create one under Admin → Agencies first.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Add User
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
