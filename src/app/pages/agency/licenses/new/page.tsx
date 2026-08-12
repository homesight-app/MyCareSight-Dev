'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { US_STATES } from '@/lib/constants'

const licenseSchema = z.object({
  license_name: z.string().min(1, 'License name is required').min(3, 'License name must be at least 3 characters'),
  license_number: z.string().optional(),
  state: z.string().min(1, 'State is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  activated_date: z.string().optional(),
  renewal_due_date: z.string().optional(),
})

type LicenseFormData = z.infer<typeof licenseSchema>

function NewLicensePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stateParam = searchParams.get('state')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<LicenseFormData>({
    resolver: zodResolver(licenseSchema),
    defaultValues: {
      state: stateParam || '',
    },
  })

  useEffect(() => {
    // Set state from URL parameter
    if (stateParam) {
      setValue('state', stateParam)
    }
  }, [stateParam, setValue])

  const onSubmit = async (data: LicenseFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        setError('You must be logged in to create a license')
        setIsLoading(false)
        return
      }

      // Create the license
      const { data: license, error: insertError } = await supabase
        .from('licenses')
        .insert({
          company_owner_id: authUser.id,
          license_name: data.license_name,
          license_number: data.license_number || null,
          state: data.state,
          status: 'pending',
          expiry_date: data.expiry_date,
          activated_date: data.activated_date || null,
          renewal_due_date: data.renewal_due_date || null,
        })
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      // Redirect to licenses page
      router.push('/pages/agency/licenses')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create license. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/pages/agency/licenses"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">New Application Request</h1>
            <p className="text-gray-600 text-lg">
              Add a new home care license for your organization
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* License Name Field */}
            <div>
              <label htmlFor="license_name" className="block text-sm font-semibold text-gray-700 mb-2">
                License Name <span className="text-red-500">*</span>
              </label>
              <input
                id="license_name"
                type="text"
                {...register('license_name')}
                placeholder="e.g., Home Care Agency License"
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.license_name && (
                <p className="mt-1 text-sm text-red-600">{errors.license_name.message}</p>
              )}
            </div>

            {/* State Field */}
            <div>
              <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="state"
                {...register('state')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                disabled={isLoading || !!stateParam}
              >
                <option value="">Select a state</option>
                {US_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              {errors.state && (
                <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>
              )}
            </div>

            {/* License Number Field */}
            <div>
              <label htmlFor="license_number" className="block text-sm font-semibold text-gray-700 mb-2">
                License Number
              </label>
              <input
                id="license_number"
                type="text"
                {...register('license_number')}
                placeholder="e.g., HC-12345"
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.license_number && (
                <p className="mt-1 text-sm text-red-600">{errors.license_number.message}</p>
              )}
            </div>

            {/* Expiry Date Field */}
            <div>
              <label htmlFor="expiry_date" className="block text-sm font-semibold text-gray-700 mb-2">
                Expiry Date <span className="text-red-500">*</span>
              </label>
              <input
                id="expiry_date"
                type="date"
                {...register('expiry_date')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.expiry_date && (
                <p className="mt-1 text-sm text-red-600">{errors.expiry_date.message}</p>
              )}
            </div>

            {/* Activated Date Field */}
            <div>
              <label htmlFor="activated_date" className="block text-sm font-semibold text-gray-700 mb-2">
                Activated Date
              </label>
              <input
                id="activated_date"
                type="date"
                {...register('activated_date')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.activated_date && (
                <p className="mt-1 text-sm text-red-600">{errors.activated_date.message}</p>
              )}
            </div>

            {/* Renewal Due Date Field */}
            <div>
              <label htmlFor="renewal_due_date" className="block text-sm font-semibold text-gray-700 mb-2">
                Renewal Due Date
              </label>
              <input
                id="renewal_due_date"
                type="date"
                {...register('renewal_due_date')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
              {errors.renewal_due_date && (
                <p className="mt-1 text-sm text-red-600">{errors.renewal_due_date.message}</p>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Link
                href="/pages/agency/licenses"
                className="px-6 py-2.5 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create License'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
  )
}

export default function NewLicensePage() {
  if (typeof window !== 'undefined') window.location.replace('/pages/agency')
  return null
}

