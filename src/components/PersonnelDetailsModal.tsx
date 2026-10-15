'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LockKeyhole } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import {
  personnelDetailsSchema,
  type PersonnelDetailsInput,
  type PersonnelTarget,
} from '@/lib/schemas/personnel-details'
import {
  getPersonnelDetailsAction,
  savePersonnelDetailsAction,
} from '@/app/actions/personnel-details'

interface Props {
  isOpen: boolean
  onClose: () => void
  target: PersonnelTarget
  personName: string
  onSuccess?: () => void
}

const EMPTY: PersonnelDetailsInput = {
  birth_date: '',
  hire_date: '',
  ssn: '',
  ssn_action: 'keep',
  home_address_street: '',
  home_address_city: '',
  home_address_state: '',
  home_address_zip: '',
}

const inputClass = 'block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100 disabled:text-gray-500'

export default function PersonnelDetailsModal({ isOpen, onClose, target, personName, onSuccess }: Props) {
  const { agencyId, userProfileId, caregiverMemberId } = target
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [ssnLast4, setSsnLast4] = useState<string | null>(null)
  const [canEditSensitive, setCanEditSensitive] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PersonnelDetailsInput>({
    resolver: zodResolver(personnelDetailsSchema),
    mode: 'onBlur',
    defaultValues: EMPTY,
  })

  const ssnAction = watch('ssn_action')

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoading(true)
    setLoadError(null)
    setServerError(null)
    getPersonnelDetailsAction({ agencyId, userProfileId, caregiverMemberId }).then(result => {
      if (!active) return
      if (!result.success || !result.data) {
        setLoadError(result.error ?? 'Unable to load personnel details.')
        setLoading(false)
        return
      }
      setSsnLast4(result.data.ssn_last4)
      setCanEditSensitive(result.data.can_edit_sensitive)
      reset({
        birth_date: result.data.birth_date,
        hire_date: result.data.hire_date,
        ssn: '',
        ssn_action: 'keep',
        home_address_street: result.data.home_address_street,
        home_address_city: result.data.home_address_city,
        home_address_state: result.data.home_address_state,
        home_address_zip: result.data.home_address_zip,
      })
      setLoading(false)
    })
    return () => { active = false }
  }, [agencyId, caregiverMemberId, isOpen, reset, userProfileId])

  const submit = async (data: PersonnelDetailsInput) => {
    setServerError(null)
    const result = await savePersonnelDetailsAction({ agencyId, userProfileId, caregiverMemberId }, data)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof PersonnelDetailsInput, { message: messages[0] })
      }
      if (!result.fieldErrors) setServerError(result.error ?? 'Unable to save personnel details.')
      return
    }
    setSsnLast4(result.data?.ssn_last4 ?? null)
    onSuccess?.()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Personal & Employment Details" size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-label="Loading personnel details" />
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : (
        <form noValidate onSubmit={handleSubmit(submit)} className="space-y-6">
          <p className="text-sm text-gray-600">
            Optional private details for <span className="font-medium text-gray-900">{personName}</span>.
          </p>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <LockKeyhole className="w-4 h-4 text-gray-500" aria-hidden />
              <h3 className="text-sm font-semibold text-gray-900">Restricted personal information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="personnel-birth-date" className="block text-sm font-medium text-gray-700 mb-1">Birth date <span className="text-gray-400">(optional)</span></label>
                {canEditSensitive ? (
                  <input id="personnel-birth-date" type="date" {...register('birth_date')} disabled={isSubmitting} className={inputClass} />
                ) : (
                  <>
                    <input type="hidden" {...register('birth_date')} />
                    <div id="personnel-birth-date" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      {watch('birth_date') || 'Not provided'}
                    </div>
                  </>
                )}
                {errors.birth_date && <p className="mt-1 text-xs text-red-600">{errors.birth_date.message}</p>}
              </div>
              <div>
                <label htmlFor="personnel-ssn" className="block text-sm font-medium text-gray-700 mb-1">SSN <span className="text-gray-400">(optional)</span></label>
                {canEditSensitive ? (
                  <>
                    <input
                      id="personnel-ssn"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={ssnLast4 && ssnAction !== 'clear' ? `Stored ending in ${ssnLast4}` : 'XXX-XX-XXXX'}
                      {...register('ssn', {
                        onChange: event => setValue('ssn_action', event.target.value ? 'replace' : 'keep', { shouldValidate: true }),
                      })}
                      disabled={isSubmitting || ssnAction === 'clear'}
                      className={inputClass}
                    />
                    <input type="hidden" {...register('ssn_action')} />
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        {ssnLast4 && ssnAction !== 'clear' ? `Current value ends in ${ssnLast4}. Enter all 9 digits to replace it.` : 'The complete value is encrypted before storage and is never displayed again.'}
                      </p>
                      {ssnLast4 && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:text-red-700"
                          onClick={() => {
                            setValue('ssn', '')
                            setValue('ssn_action', ssnAction === 'clear' ? 'keep' : 'clear', { shouldValidate: true })
                          }}
                        >
                          {ssnAction === 'clear' ? 'Keep stored SSN' : 'Remove SSN'}
                        </button>
                      )}
                    </div>
                    {errors.ssn && <p className="mt-1 text-xs text-red-600">{errors.ssn.message}</p>}
                  </>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    {ssnLast4 ? `***-**-${ssnLast4}` : 'Not provided'}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">Employment</h3>
            <div className="max-w-xs">
              <label htmlFor="personnel-hire-date" className="block text-sm font-medium text-gray-700 mb-1">Hire date <span className="text-gray-400">(optional)</span></label>
              <input id="personnel-hire-date" type="date" {...register('hire_date')} disabled={isSubmitting} className={inputClass} />
              {errors.hire_date && <p className="mt-1 text-xs text-red-600">{errors.hire_date.message}</p>}
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">Personal / home address</h3>
            <div>
              <label htmlFor="personnel-street" className="block text-sm font-medium text-gray-700 mb-1">Street address <span className="text-gray-400">(optional)</span></label>
              <input id="personnel-street" {...register('home_address_street')} disabled={isSubmitting} className={inputClass} />
              {errors.home_address_street && <p className="mt-1 text-xs text-red-600">{errors.home_address_street.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_9rem] gap-4">
              <div>
                <label htmlFor="personnel-city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input id="personnel-city" {...register('home_address_city')} disabled={isSubmitting} className={inputClass} />
                {errors.home_address_city && <p className="mt-1 text-xs text-red-600">{errors.home_address_city.message}</p>}
              </div>
              <div>
                <label htmlFor="personnel-state" className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input id="personnel-state" maxLength={2} {...register('home_address_state')} disabled={isSubmitting} className={inputClass} />
                {errors.home_address_state && <p className="mt-1 text-xs text-red-600">{errors.home_address_state.message}</p>}
              </div>
              <div>
                <label htmlFor="personnel-zip" className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input id="personnel-zip" {...register('home_address_zip')} disabled={isSubmitting} className={inputClass} />
                {errors.home_address_zip && <p className="mt-1 text-xs text-red-600">{errors.home_address_zip.message}</p>}
              </div>
            </div>
          </section>

          {serverError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>Save Details</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
