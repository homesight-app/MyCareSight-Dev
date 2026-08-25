'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Modal from './Modal'
import { Globe, MapPin } from 'lucide-react'
import { US_STATES } from '@/lib/constants'

const stateSchema = z.object({
  state: z.string().min(1, 'State is required'),
})

type StateFormData = z.infer<typeof stateSchema>

interface NewLicenseApplicationModalProps {
  isOpen: boolean
  onClose: () => void
  onStateSelect?: (state: string) => void
  /** When true, shows the split-screen programs UI where state is optional. */
  programsOnly?: boolean
}

export default function NewLicenseApplicationModal({
  isOpen,
  onClose,
  onStateSelect,
  programsOnly = false,
}: NewLicenseApplicationModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [programStateVal, setProgramStateVal] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<StateFormData>({
    resolver: zodResolver(stateSchema),
  })

  const handleClose = () => {
    if (!isLoading) {
      reset()
      setError(null)
      setProgramStateVal('')
      onClose()
    }
  }

  // ── License flow (programsOnly=false) ───────────────────────────────────────

  const onSubmit = async (data: StateFormData) => {
    setIsLoading(true)
    setError(null)
    try {
      if (onStateSelect) {
        onStateSelect(data.state)
        reset()
        setIsLoading(false)
        return
      }
      router.push(`/pages/agency/licenses/new?state=${encodeURIComponent(data.state)}`)
      reset()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Programs flow (programsOnly=true) ────────────────────────────────────────

  const handleNational = () => {
    setProgramStateVal('')
    onStateSelect?.('')
  }

  const handleStatePrograms = () => {
    if (programStateVal) onStateSelect?.(programStateVal)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (programsOnly) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Select Program Type" size="lg">
        <div className="space-y-4">
          <p className="text-gray-500 text-sm">
            Browse national programs available in all states, or select your state to see state-specific programs too.
          </p>

          <div className="grid grid-cols-2 gap-0 relative">
            {/* Vertical divider */}
            <div className="absolute inset-y-0 left-1/2 w-px bg-gray-200 z-10 hidden sm:block" />

            {/* Left — National */}
            <button
              onClick={handleNational}
              className="flex flex-col items-center justify-center gap-4 p-8 rounded-l-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group text-center"
            >
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                <Globe className="w-8 h-8 text-teal-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-base mb-1">No State Required</p>
                <p className="text-sm text-gray-500">Browse programs available in all states</p>
              </div>
              <span className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg group-hover:bg-teal-700 transition-colors">
                Browse National
              </span>
            </button>

            {/* Right — State-specific */}
            <div className="flex flex-col items-center justify-center gap-4 p-8 rounded-r-xl border-2 border-l-0 border-gray-200 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <MapPin className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-base mb-1">Select a State</p>
                <p className="text-sm text-gray-500">See state-specific programs alongside national ones</p>
              </div>
              <div className="w-full space-y-3">
                <div className="relative">
                  <select
                    value={programStateVal}
                    onChange={e => setProgramStateVal(e.target.value)}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white appearance-none pr-8 text-sm"
                  >
                    <option value="">Select a state…</option>
                    {US_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <button
                  onClick={handleStatePrograms}
                  disabled={!programStateVal}
                  className="w-full px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-start">
            <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── License mode (original form) ─────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Select State for License Application" size="md">
      <div className="space-y-6">
        <p className="text-gray-600 text-base">
          Choose the state where you want to apply for a home care license.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
              State
            </label>
            <div className="relative">
              <select
                id="state"
                {...register('state')}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white appearance-none pr-10"
                disabled={isLoading}
              >
                <option value="">Select a state...</option>
                {US_STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {errors.state && (
              <p className="mt-1 text-sm text-red-600">{errors.state.message}</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900 mb-1">Note:</p>
              <p className="text-sm text-blue-800">
                Each state has different license types and requirements. After selecting your state, you&apos;ll see available license options.
              </p>
            </div>
          </div>

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
              className="px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
