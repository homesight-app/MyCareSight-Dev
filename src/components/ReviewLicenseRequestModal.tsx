'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { Heart, Users, MapPin, DollarSign, Clock, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { LicenseType } from '@/types/license'
import { createApplicationForAgency } from '@/app/actions/applications'

interface ReviewLicenseRequestModalProps {
  isOpen: boolean
  onClose: () => void
  state: string
  licenseType: LicenseType
  onBack: () => void
  /** When provided, the application is created for the agency (admin/expert mode). */
  agencyId?: string
  /** When true, approving this request will automatically launch a Program checklist. */
  hasPlaybook?: boolean
}

const getStateAbbr = (state: string) => {
  return state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()
}

export default function ReviewLicenseRequestModal({
  isOpen,
  onClose,
  state,
  licenseType,
  onBack,
  agencyId,
  hasPlaybook,
}: ReviewLicenseRequestModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // ── Agency mode (admin/expert creating on behalf of agency) ──────────
      if (agencyId) {
        const result = await createApplicationForAgency(agencyId, {
          application_name: licenseType.name,
          state,
          license_type_id: licenseType.id,
        })
        if (result.error) {
          setError(result.error)
          return
        }
        onClose()
        router.refresh()
        return
      }

      // ── Owner mode (agency owner creating for themselves) ─────────────────
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('You must be logged in to submit a license request')
        return
      }

      const todayStr = new Date().toISOString().split('T')[0]

      const { data: application, error: insertError } = await q.insertApplication(supabase, {
        company_owner_id: user.id,
        application_name: licenseType.name,
        state: state,
        license_type_id: licenseType.id,
        status: 'requested',
        progress_percentage: 0,
        started_date: todayStr,
        last_updated_date: todayStr,
        submitted_date: todayStr,
      })

      if (insertError) {
        setError(insertError.message || 'Failed to create application. Please try again.')
        return
      }

      const { error: rpcError } = await q.rpcCopyExpertStepsToApplication(
        supabase,
        application!.id,
        state,
        licenseType.name
      )
      if (rpcError) {
        setError(rpcError.message || 'Failed to set up application steps. Please try again.')
        return
      }

      onClose()
      // Navigate without router.refresh() to avoid RSC "frame.join" serialization error
      router.push('/pages/agency/licenses')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit license request. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review License Application Request" size="lg">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* License Type Header */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              {licenseType.icon === 'heart' ? (
                <Heart className="w-8 h-8 text-blue-600" />
              ) : (
                <Users className="w-8 h-8 text-blue-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-xl mb-1">{licenseType.name}</h3>
                  <p className="text-gray-600">{licenseType.description}</p>
                </div>
                <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                  <MapPin className="w-4 h-4" />
                  {getStateAbbr(state)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* General Information */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">General Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-700">Application Fee</span>
              </div>
              <p className="text-gray-900 font-medium">{licenseType.cost}</p>
            </div>
            {licenseType.serviceFee != null && licenseType.serviceFee !== '' && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-700">Service Fee</span>
                </div>
                <p className="text-gray-900 font-medium">{licenseType.serviceFee}</p>
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <span className="font-semibold text-gray-700">Processing Time</span>
              </div>
              <p className="text-gray-900 font-medium">{licenseType.processingTime}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-gray-700">Renewal Period</span>
              </div>
              <p className="text-gray-900 font-medium">{licenseType.renewalPeriod}</p>
            </div>
          </div>
        </div>

        {/* Key Requirements */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-4">Key Requirements</h4>
          <div className="space-y-2">
            {licenseType.requirements.map((requirement, index) => (
              <div key={index} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">{requirement}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Program launch notice */}
        {hasPlaybook && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800">A Program checklist will be launched automatically when this request is approved.</p>
          </div>
        )}

        {/* What happens next? */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 mb-3">What happens next?</h4>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
            <li>Your license application request will be submitted to the admin team</li>
            <li>An admin will review and approve your request</li>
            <li>A licensing expert will be assigned to guide you through the process</li>
            <li>You&apos;ll receive a notification once approved and can begin working on your application</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <Button variant="secondary" type="button" onClick={onBack} disabled={isLoading}>
            Back to License Types
          </Button>
          <Button
            variant="primary"
            type="button"
            icon={ArrowRight}
            iconPosition="right"
            onClick={handleSubmit}
            disabled={isLoading}
            loading={isLoading}
          >
            Submit License Request
          </Button>
        </div>
      </div>
    </Modal>
  )
}

