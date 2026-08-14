'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { BookOpen, MapPin, DollarSign, Clock, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react'
import type { StandalonePlaybook } from '@/lib/supabase/query/playbooks'
import { createProgramForAgency, submitProgramRequest } from '@/app/actions/applications'

interface ReviewPlaybookRequestModalProps {
  isOpen: boolean
  onClose: () => void
  state: string
  playbook: StandalonePlaybook
  onBack: () => void
  /** When provided (admin/expert flow), creates the program directly as in_progress. */
  agencyId?: string
}

const getStateAbbr = (state: string) =>
  state.length > 2 ? state.substring(0, 2).toUpperCase() : state.toUpperCase()

export default function ReviewPlaybookRequestModal({
  isOpen,
  onClose,
  state,
  playbook,
  onBack,
  agencyId,
}: ReviewPlaybookRequestModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (agencyId) {
        // Admin/expert flow: create program directly as in_progress
        const { error: actionError } = await createProgramForAgency(agencyId, {
          application_name: playbook.name,
          state,
          playbook_id: playbook.id,
        })
        if (actionError) { setError(actionError); return }
        onClose()
        router.refresh()
        return
      }

      // Agency owner flow: submit as requested, awaits admin approval
      const { error: actionError } = await submitProgramRequest({
        application_name: playbook.name,
        state,
        playbook_id: playbook.id,
      })

      if (actionError) {
        setError(actionError)
        return
      }

      onClose()
      router.push('/pages/agency/programs')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit program request. Please try again.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const requirements = Array.isArray(playbook.requirements) ? playbook.requirements : []

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review Program Request" size="lg">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Program Header */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0 relative">
              <BookOpen className="w-8 h-8 text-teal-600" />
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold bg-teal-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                Program
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-xl mb-1">{playbook.name}</h3>
                  {playbook.description && (
                    <p className="text-gray-600">{playbook.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-semibold flex-shrink-0 ml-4">
                  <MapPin className="w-4 h-4" />
                  {getStateAbbr(state)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* General Information */}
        {(playbook.cost_display || playbook.service_fee_display || playbook.processing_time_display || playbook.renewal_period_display) && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">General Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {playbook.cost_display && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-gray-700">Fee</span>
                  </div>
                  <p className="text-gray-900 font-medium">{playbook.cost_display}</p>
                </div>
              )}
              {playbook.service_fee_display && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-700">Service Fee</span>
                  </div>
                  <p className="text-gray-900 font-medium">{playbook.service_fee_display}</p>
                </div>
              )}
              {playbook.processing_time_display && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    <span className="font-semibold text-gray-700">Timeline</span>
                  </div>
                  <p className="text-gray-900 font-medium">{playbook.processing_time_display}</p>
                </div>
              )}
              {playbook.renewal_period_display && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-700">Renewal</span>
                  </div>
                  <p className="text-gray-900 font-medium">{playbook.renewal_period_display}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key Requirements */}
        {requirements.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">What&apos;s Included</h4>
            <div className="space-y-2">
              {requirements.map((req, index) => (
                <div key={index} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  <span className="text-gray-700">{req}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Program launch notice — always shown for playbook requests */}
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
          <p className="text-sm text-teal-800">A Program checklist will be launched automatically when this request is approved.</p>
        </div>

        {/* What happens next? */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 mb-3">What happens next?</h4>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
            <li>Your program request will be submitted to the admin team</li>
            <li>An admin will review and approve your request</li>
            <li>Your program checklist will be launched automatically upon approval</li>
            <li>You&apos;ll receive a notification once your program is active and ready to begin</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            onClick={onBack}
            disabled={isLoading}
            className="px-6 py-2.5 text-gray-700 font-medium rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back to Programs
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit Program Request
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
