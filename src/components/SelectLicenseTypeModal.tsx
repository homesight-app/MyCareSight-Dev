'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from './Modal'
import { Heart, Users, ArrowRight, DollarSign, Clock, RefreshCw, Loader2 } from 'lucide-react'
import { LicenseType } from '@/types/license'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'

interface SelectLicenseTypeModalProps {
  isOpen: boolean
  onClose: () => void
  state: string
  onSelectLicenseType: (licenseType: LicenseType) => void
  onBack: () => void
}

const getStateAbbr = (state: string) => {
  return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
}

export default function SelectLicenseTypeModal({
  isOpen,
  onClose,
  state,
  onSelectLicenseType,
  onBack
}: SelectLicenseTypeModalProps) {
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLicenseTypes = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      const { data, error: fetchError } = await q.getLicenseTypes(supabase, { state, isActive: true })

      if (fetchError) {
        throw fetchError
      }

      // Transform database data to LicenseType format
      const transformedData: LicenseType[] = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        cost: item.cost_display,
        serviceFee: item.service_fee_display ?? undefined,
        processingTime: item.processing_time_display,
        renewalPeriod: item.renewal_period_display,
        icon: item.icon_type as 'heart' | 'users',
        requirements: Array.isArray(item.requirements) ? item.requirements : [],
        state: item.state
      }))

      setLicenseTypes(transformedData)
    } catch (err: any) {
      setError(err.message || 'Failed to load license types. Please try again.')
      console.error('Error fetching license types:', err)
    } finally {
      setIsLoading(false)
    }
  }, [state])

  useEffect(() => {
    if (isOpen && state) {
      fetchLicenseTypes()
    }
  }, [isOpen, state, fetchLicenseTypes])

  const handleLicenseTypeClick = (licenseType: LicenseType) => {
    onSelectLicenseType(licenseType)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Select License Type - ${getStateAbbr(state)}`} size="lg">
      <div className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {!isLoading && !error && licenseTypes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No license types available for {state}.</p>
          </div>
        )}

        {!isLoading && licenseTypes.map((licenseType) => (
          <button
            key={licenseType.id}
            onClick={() => handleLicenseTypeClick(licenseType)}
            className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-xl p-5 transition-all border border-gray-200 hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                {licenseType.icon === 'heart' ? (
                  <Heart className="w-8 h-8 text-blue-600" />
                ) : (
                  <Users className="w-8 h-8 text-blue-600" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-lg mb-1">{licenseType.name}</h3>
                <p className="text-gray-600 text-sm mb-3">{licenseType.description}</p>

                {/* Details */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-gray-700 font-medium">Application Fee:</span>
                    <span className="text-gray-600">{licenseType.cost}</span>
                  </div>
                  {licenseType.serviceFee != null && licenseType.serviceFee !== '' && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-700 font-medium">Service Fee:</span>
                      <span className="text-gray-600">{licenseType.serviceFee}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-600" />
                    <span className="text-gray-700 font-medium">Processing Time:</span>
                    <span className="text-gray-600">{licenseType.processingTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700 font-medium">Renewal:</span>
                    <span className="text-gray-600">{licenseType.renewalPeriod}</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex-shrink-0">
                <ArrowRight className="w-6 h-6 text-gray-400" />
              </div>
            </div>
          </button>
        ))}

        {/* Back Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-4 py-2 text-gray-700 font-medium rounded-xl hover:bg-gray-100 transition-colors"
          >
            Back to State Selection
          </button>
        </div>
      </div>
    </Modal>
  )
}

