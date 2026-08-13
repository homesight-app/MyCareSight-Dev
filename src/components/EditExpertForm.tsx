'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { US_PHONE_REGEX, PHONE_ERROR } from '@/lib/validation'
import PhoneInput from '@/components/ui/PhoneInput'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { Loader2 } from 'lucide-react'

const expertSchema = z.object({
  firstName: z.string().min(1, 'First name is required').min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(1, 'Last name is required').min(2, 'Last name must be at least 2 characters'),
  phone: z.string().optional().refine(val => !val || US_PHONE_REGEX.test(val.trim()), PHONE_ERROR),
  expertise: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(['active', 'inactive']),
})

type ExpertFormData = z.infer<typeof expertSchema>

interface Expert {
  id: string
  first_name: string
  last_name: string
  phone?: string | null
  expertise?: string | null
  role?: string | null
  status: string
}

interface EditExpertFormProps {
  expert: Expert
}

export default function EditExpertForm({ expert }: EditExpertFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ExpertFormData>({
    resolver: zodResolver(expertSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: expert.first_name || '',
      lastName: expert.last_name || '',
      phone: expert.phone || '',
      expertise: expert.expertise || '',
      role: expert.role || 'Licensing Specialist',
      status: (expert.status as 'active' | 'inactive') || 'active',
    },
  })

  // Reset form when expert changes
  useEffect(() => {
    reset({
      firstName: expert.first_name || '',
      lastName: expert.last_name || '',
      phone: expert.phone || '',
      expertise: expert.expertise || '',
      role: expert.role || 'Licensing Specialist',
      status: (expert.status as 'active' | 'inactive') || 'active',
    })
  }, [expert, reset])

  const onSubmit = async (data: ExpertFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { error: updateError } = await q.updateLicensingExpertById(supabase, expert.id, {
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone || null,
        expertise: data.expertise || null,
        role: data.role || null,
        status: data.status,
        updated_at: new Date().toISOString(),
      })

      if (updateError) {
        throw updateError
      }

      router.refresh()
      router.push(`/pages/admin/experts/${expert.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to update expert. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-2">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            id="firstName"
            {...register('firstName')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-2">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            id="lastName"
            {...register('lastName')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.lastName && (
            <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
            Phone Number
          </label>
          <PhoneInput
            id="phone"
            {...register('phone')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            error={errors.phone?.message}
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
            Role
          </label>
          <input
            id="role"
            {...register('role')}
            placeholder="Licensing Specialist"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.role && (
            <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="expertise" className="block text-sm font-semibold text-gray-700 mb-2">
            Expertise
          </label>
          <textarea
            id="expertise"
            {...register('expertise')}
            rows={3}
            placeholder="Describe the expert's areas of expertise..."
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
            disabled={isLoading}
          />
          {errors.expertise && (
            <p className="mt-1 text-sm text-red-600">{errors.expertise.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-2">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            id="status"
            {...register('status')}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {errors.status && (
            <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isLoading}
          className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating...
            </>
          ) : (
            'Update Expert'
          )}
        </button>
      </div>
    </form>
  )
}
