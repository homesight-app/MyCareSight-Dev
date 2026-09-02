'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clientSchema, type ClientFormData } from '@/lib/schemas/client'
import PhoneInput from '@/components/ui/PhoneInput'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import Modal from './Modal'
import { Loader2 } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'


interface Client {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  status: string
  start_date?: string | null
  expert_id?: string | null
}

interface EditClientModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  onSuccess?: () => void
}

export default function EditClientModal({
  isOpen,
  onClose,
  client,
  onSuccess
}: EditClientModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    mode: 'onBlur',
  })

  // Reset form when modal opens/closes or client changes
  useEffect(() => {
    if (isOpen && client) {
      reset({
        company_name: client.company_name || '',
        contact_name: client.contact_name || '',
        contact_email: client.contact_email || '',
        contact_phone: client.contact_phone || '',
        status: (client.status as 'active' | 'inactive' | 'pending') || 'active',
        start_date: client.start_date ? new Date(client.start_date).toISOString().split('T')[0] : '',
      })
      setError(null)
    }
  }, [isOpen, client, reset])

  const onSubmit = async (data: ClientFormData) => {
    if (!client) return

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { error: updateError } = await q.updateClientById(supabase, client.id, {
        company_name: data.company_name,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone || null,
        status: data.status,
        start_date: data.start_date || null,
        updated_at: new Date().toISOString(),
      })

      if (updateError) {
        throw updateError
      }

      reset()
      onClose()

      router.refresh()

      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update client. Please try again.')
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

  if (!client) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Client Information" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label htmlFor="company_name" className="block text-sm font-semibold text-gray-700 mb-2">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              id="company_name"
              {...register('company_name')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.company_name && (
              <p className="mt-1 text-sm text-red-600">{errors.company_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="contact_name" className="block text-sm font-semibold text-gray-700 mb-2">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              id="contact_name"
              {...register('contact_name')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.contact_name && (
              <p className="mt-1 text-sm text-red-600">{errors.contact_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="contact_email" className="block text-sm font-semibold text-gray-700 mb-2">
              Contact Email <span className="text-red-500">*</span>
            </label>
            <input
              id="contact_email"
              type="email"
              {...register('contact_email')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
            {errors.contact_email && (
              <p className="mt-1 text-sm text-red-600">{errors.contact_email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="contact_phone" className="block text-sm font-semibold text-gray-700 mb-2">
              Contact Phone
            </label>
            <PhoneInput
              id="contact_phone"
              {...register('contact_phone')}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              error={errors.contact_phone?.message}
              disabled={isLoading}
            />
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
              <option value="pending">Pending</option>
            </select>
            {errors.status && (
              <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
            )}
          </div>

          <div>
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
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading} loading={isLoading}>
            Update Client
          </Button>
        </div>
      </form>
    </Modal>
  )
}
