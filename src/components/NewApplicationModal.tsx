'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { applicationSchema, type ApplicationFormData } from '@/lib/schemas/application'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'
import { Loader2 } from 'lucide-react'
import { US_STATES } from '@/lib/constants'


interface NewApplicationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function NewApplicationModal({ isOpen, onClose, onSuccess }: NewApplicationModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
  })

  const onSubmit = async (data: ApplicationFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be logged in to create an application')
        setIsLoading(false)
        return
      }

      const today = new Date().toISOString().split('T')[0]

      const { data: application, error: insertError } = await q.insertApplication(supabase, {
        company_owner_id: user.id,
        application_name: data.application_name,
        state: data.state,
        status: 'in_progress',
        progress_percentage: 0,
        started_date: today,
        last_updated_date: today,
      })

      if (insertError) {
        throw insertError
      }

      // Reset form and close modal
      reset()
      onClose()
      
      // Refresh the page to show the new application
      router.refresh()
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create application. Please try again.')
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
    <Modal isOpen={isOpen} onClose={handleClose} title="New Application" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Application Name Field */}
        <div>
          <label htmlFor="application_name" className="block text-sm font-semibold text-gray-700 mb-2">
            Application Name <span className="text-red-500">*</span>
          </label>
          <input
            id="application_name"
            type="text"
            {...register('application_name')}
            placeholder="e.g., Home Care License - California"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            disabled={isLoading}
          />
          {errors.application_name && (
            <p className="mt-1 text-sm text-red-600">{errors.application_name.message}</p>
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
            disabled={isLoading}
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
            className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-brand-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Application'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

