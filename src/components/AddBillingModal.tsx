'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createBilling, CreateBillingData } from '@/app/actions/billing'
import Modal from './Modal'
import Button from '@/components/ui/PrimaryButton'

const billingSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  billingMonth: z.string().min(1, 'Billing month is required'),
  userLicensesCount: z.number().int().min(0),
  userLicenseRate: z.number().min(0),
  applicationsCount: z.number().int().min(0),
  applicationRate: z.number().min(0),
  status: z.enum(['pending', 'paid', 'overdue']),
})

type BillingFormData = z.infer<typeof billingSchema>

interface Client {
  id: string
  company_name: string
  contact_name: string
}

interface AddBillingModalProps {
  isOpen: boolean
  onClose: () => void
  clients: Client[]
}

export default function AddBillingModal({ isOpen, onClose, clients }: AddBillingModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<BillingFormData>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      userLicensesCount: 0,
      userLicenseRate: 50.00,
      applicationsCount: 0,
      applicationRate: 500.00,
      status: 'pending',
    },
  })

  // Watch form values to calculate total
  const userLicensesCount = watch('userLicensesCount') || 0
  const userLicenseRate = watch('userLicenseRate') || 50.00
  const applicationsCount = watch('applicationsCount') || 0
  const applicationRate = watch('applicationRate') || 500.00
  const totalAmount = (userLicensesCount * userLicenseRate) + (applicationsCount * applicationRate)

  // Get current month as default
  const getCurrentMonth = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}-01`
  }

  const onSubmit = async (data: BillingFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const billingData: CreateBillingData = {
        clientId: data.clientId,
        billingMonth: data.billingMonth,
        userLicensesCount: data.userLicensesCount,
        userLicenseRate: data.userLicenseRate,
        applicationsCount: data.applicationsCount,
        applicationRate: data.applicationRate,
        status: data.status,
      }

      const result = await createBilling(billingData)

      if (result.error) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      // Reset form and close modal
      reset()
      onClose()
      
      // Refresh the page to show the new billing record
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create billing record. Please try again.')
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Billing Record" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Client Selection */}
        <div>
          <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-2">
            Client <span className="text-red-500">*</span>
          </label>
          <select
            {...register('clientId')}
            id="clientId"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value="">Select a client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company_name} - {client.contact_name}
              </option>
            ))}
          </select>
          {errors.clientId && (
            <p className="mt-1 text-sm text-red-600">{errors.clientId.message}</p>
          )}
        </div>

        {/* Billing Month */}
        <div>
          <label htmlFor="billingMonth" className="block text-sm font-medium text-gray-700 mb-2">
            Billing Month <span className="text-red-500">*</span>
          </label>
          <input
            {...register('billingMonth', {
              setValueAs: (value) => {
                // Convert month input (YYYY-MM) to date (YYYY-MM-01)
                if (value && value.length === 7) {
                  return `${value}-01`
                }
                return value
              }
            })}
            type="month"
            id="billingMonth"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
            defaultValue={getCurrentMonth().substring(0, 7)}
          />
          {errors.billingMonth && (
            <p className="mt-1 text-sm text-red-600">{errors.billingMonth.message}</p>
          )}
        </div>

        {/* User Licenses */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="userLicensesCount" className="block text-sm font-medium text-gray-700 mb-2">
              User Licenses Count
            </label>
            <input
              {...register('userLicensesCount', {
                setValueAs: (v) => (v === '' ? 0 : Number(v))
              })}
              type="number"
              id="userLicensesCount"
              min="0"
              step="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.userLicensesCount && (
              <p className="mt-1 text-sm text-red-600">{errors.userLicensesCount.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="userLicenseRate" className="block text-sm font-medium text-gray-700 mb-2">
              Rate per License ($/mo)
            </label>
            <input
              {...register('userLicenseRate', {
                setValueAs: (v) => (v === '' ? 0 : Number(v))
              })}
              type="number"
              id="userLicenseRate"
              min="0"
              step="0.01"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.userLicenseRate && (
              <p className="mt-1 text-sm text-red-600">{errors.userLicenseRate.message}</p>
            )}
          </div>
        </div>

        {/* Applications */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="applicationsCount" className="block text-sm font-medium text-gray-700 mb-2">
              Applications Count
            </label>
            <input
              {...register('applicationsCount', {
                setValueAs: (v) => (v === '' ? 0 : Number(v))
              })}
              type="number"
              id="applicationsCount"
              min="0"
              step="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.applicationsCount && (
              <p className="mt-1 text-sm text-red-600">{errors.applicationsCount.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="applicationRate" className="block text-sm font-medium text-gray-700 mb-2">
              Rate per Application ($)
            </label>
            <input
              {...register('applicationRate', {
                setValueAs: (v) => (v === '' ? 0 : Number(v))
              })}
              type="number"
              id="applicationRate"
              min="0"
              step="0.01"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.applicationRate && (
              <p className="mt-1 text-sm text-red-600">{errors.applicationRate.message}</p>
            )}
          </div>
        </div>

        {/* Total Amount (Calculated) */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Amount:</span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            {...register('status')}
            id="status"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          {errors.status && (
            <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isLoading}
            loading={isLoading}
          >
            Create Billing Record
          </Button>
        </div>
      </form>
    </Modal>
  )
}
