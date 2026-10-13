'use client'

import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { BellRing, Users } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import { CaregiverAssignmentList } from '@/components/CaregiverAssignmentList'
import type { CaregiverMatchOption } from '@/lib/caregiver-matching'
import type { AllVisitCardDTO } from '@/lib/visit-all-visits-dashboard'
import {
  publishVisitShiftOfferSchema,
  type PublishVisitShiftOfferInput,
} from '@/lib/schemas/visit-shift-offers'
import { publishVisitShiftOfferAction } from '@/app/actions/visit-shift-offers'

type Props = {
  visit: AllVisitCardDTO | null
  candidates: CaregiverMatchOption[]
  isLoadingCandidates: boolean
  onClose: () => void
  onPublished: (message: string) => void
}

export default function VisitShiftOfferModal({
  visit,
  candidates,
  isLoadingCandidates,
  onClose,
  onPublished,
}: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const eligible = useMemo(
    () => candidates.filter(candidate => candidate.availability === 'available' && candidate.skillMatchPercent === 100),
    [candidates]
  )
  const form = useForm<PublishVisitShiftOfferInput>({
    resolver: zodResolver(publishVisitShiftOfferSchema),
    mode: 'onBlur',
    defaultValues: { visitId: visit?.id ?? '', audienceMode: 'selected', caregiverIds: [] },
  })
  const audienceMode = form.watch('audienceMode')
  const selectedIds = form.watch('caregiverIds')

  useEffect(() => {
    form.reset({ visitId: visit?.id ?? '', audienceMode: 'selected', caregiverIds: [] })
    setServerError(null)
  }, [form, visit])

  const toggleCaregiver = (caregiverId: string) => {
    const next = selectedIds.includes(caregiverId)
      ? selectedIds.filter(id => id !== caregiverId)
      : [...selectedIds, caregiverId]
    form.setValue('caregiverIds', next, { shouldDirty: true, shouldValidate: true })
  }

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = await publishVisitShiftOfferAction({
      ...values,
      caregiverIds: values.audienceMode === 'all_eligible' ? [] : values.caregiverIds,
    })
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'caregiverIds' || field === 'audienceMode' || field === 'visitId') {
          form.setError(field, { message: messages[0] })
        }
      }
      setServerError(result.error ?? 'Unable to advertise this shift.')
      return
    }
    const newlyNotified = result.data?.newlyNotifiedCount ?? 0
    const totalNotified = result.data?.notifiedCount ?? newlyNotified
    onPublished(
      newlyNotified > 0
        ? `Shift advertised to ${newlyNotified} caregiver${newlyNotified === 1 ? '' : 's'}.`
        : `All ${totalNotified} eligible caregivers were already notified.`
    )
  })

  return (
    <Modal
      isOpen={!!visit}
      onClose={onClose}
      title="Advertise Open Shift"
      subtitle="Send a PHI-safe in-app invitation to selected caregivers or everyone currently eligible."
      size="lg"
      closeOnBackdropClick={!form.formState.isSubmitting}
      closeOnEscape={!form.formState.isSubmitting}
    >
      {visit ? (
        <form noValidate onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
            <div className="font-semibold">{visit.dateLabel}</div>
            <div>{visit.timeLabel} · {visit.typeLabel}</div>
            <div className="mt-1 text-xs text-blue-700">
              Caregivers will not see the client name, address, visit notes, or care tasks in the invitation.
            </div>
          </div>

          {serverError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-900">Audience <span className="text-red-600">*</span></legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                value="selected"
                checked={audienceMode === 'selected'}
                onChange={() => form.setValue('audienceMode', 'selected', { shouldValidate: true })}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Selected caregivers</span>
                <span className="block text-xs text-gray-500">Choose from the ranked, eligible list below.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                value="all_eligible"
                checked={audienceMode === 'all_eligible'}
                onChange={() => form.setValue('audienceMode', 'all_eligible', { shouldValidate: true })}
                className="mt-1"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Users className="h-4 w-4" aria-hidden /> All eligible caregivers ({eligible.length})
                </span>
                <span className="block text-xs text-gray-500">
                  Active caregivers who are available, conflict-free, and match every required skill.
                </span>
              </span>
            </label>
          </fieldset>

          {audienceMode === 'selected' ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Caregiver candidates</div>
                  <div className="text-xs text-gray-500">
                    Eligible caregivers are shown first. Use the filters to review booked, unavailable, or all active caregivers.
                  </div>
                </div>
                <div className="text-xs text-gray-500">{selectedIds.length} selected</div>
              </div>
              <CaregiverAssignmentList
                variant="modal"
                selectionMode="multiple"
                options={candidates}
                requiredSkills={visit.clientRequiredSkills}
                preferredSkills={visit.clientPreferredSkills}
                selectedIds={selectedIds}
                selectedId={null}
                isLoading={isLoadingCandidates}
                disabled={form.formState.isSubmitting}
                defaultFilter="eligible"
                emptyMessage="No active caregivers with agency access were found."
                onSelect={toggleCaregiver}
              />
              {form.formState.errors.caregiverIds?.message ? (
                <p className="mt-2 text-sm text-red-600">{form.formState.errors.caregiverIds.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={BellRing}
              loading={form.formState.isSubmitting}
              disabled={isLoadingCandidates || eligible.length === 0}
            >
              Send Invitations
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  )
}
