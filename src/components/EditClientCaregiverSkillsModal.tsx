'use client'

import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Sparkles } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import SkillPicker from '@/components/ui/SkillPicker'
import { upsertPatientCaregiverRequirementsAction } from '@/app/actions/patients'
import {
  patientSkillIdRequirementsSchema,
  type PatientSkillIdRequirementsInput,
} from '@/lib/schemas/skill-catalog'
import type { PatientSkillSelection, SkillCatalogOption } from '@/lib/skill-catalog'

type Props = {
  isOpen: boolean
  patientId: string
  patientName: string
  initialRequiredSkills: PatientSkillSelection[]
  initialPreferredSkills: PatientSkillSelection[]
  onClose: () => void
  onSaved: (required: PatientSkillSelection[], preferred: PatientSkillSelection[]) => void
}

const asCatalogOptions = (skills: PatientSkillSelection[]): SkillCatalogOption[] =>
  skills.map(({ requirementLevel: _requirementLevel, ...skill }) => skill)

export default function EditClientCaregiverSkillsModal({
  isOpen,
  patientId,
  patientName,
  initialRequiredSkills,
  initialPreferredSkills,
  onClose,
  onSaved,
}: Props) {
  const [required, setRequired] = useState<SkillCatalogOption[]>([])
  const [preferred, setPreferred] = useState<SkillCatalogOption[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<PatientSkillIdRequirementsInput>({
    resolver: zodResolver(patientSkillIdRequirementsSchema),
    mode: 'onBlur',
    defaultValues: { patientId, requiredSkillIds: [], preferredSkillIds: [] },
  })

  useEffect(() => {
    if (!isOpen) return
    const nextRequired = asCatalogOptions(initialRequiredSkills)
    const nextPreferred = asCatalogOptions(initialPreferredSkills)
    setRequired(nextRequired)
    setPreferred(nextPreferred)
    form.reset({
      patientId,
      requiredSkillIds: nextRequired.map(skill => skill.id),
      preferredSkillIds: nextPreferred.map(skill => skill.id),
    })
    setServerError(null)
  }, [form, initialPreferredSkills, initialRequiredSkills, isOpen, patientId])

  const updateRequired = (skills: SkillCatalogOption[]) => {
    setRequired(skills)
    form.setValue('requiredSkillIds', skills.map(skill => skill.id), { shouldDirty: true, shouldValidate: true })
  }
  const updatePreferred = (skills: SkillCatalogOption[]) => {
    setPreferred(skills)
    form.setValue('preferredSkillIds', skills.map(skill => skill.id), { shouldDirty: true, shouldValidate: true })
  }

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = await upsertPatientCaregiverRequirementsAction(values)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'requiredSkillIds' || field === 'preferredSkillIds' || field === 'patientId') {
          form.setError(field, { message: messages[0] })
        }
      }
      setServerError(result.error ?? 'Check the selected skills and try again.')
      return
    }
    onSaved(
      required.map(skill => ({ ...skill, requirementLevel: 'required' as const })),
      preferred.map(skill => ({ ...skill, requirementLevel: 'preferred' as const }))
    )
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Caregiver Skill Requirements"
      size="xl"
      closeOnBackdropClick={!form.formState.isSubmitting}
      closeOnEscape={!form.formState.isSubmitting}
    >
      <form noValidate onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-blue-50 p-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Caregiver skills — {patientName}</h2>
            <p className="mt-1 text-sm text-gray-500">Set assignment eligibility and match ranking preferences.</p>
          </div>
        </div>

        {serverError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
        ) : null}

        <div className="grid max-h-[62vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
          <SkillPicker
            label="Required skills"
            description="Caregivers must have every required skill verified to be eligible."
            selected={required}
            excludeIds={preferred.map(skill => skill.id)}
            onChange={updateRequired}
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.requiredSkillIds?.message}
          />
          <SkillPicker
            label="Preferred skills"
            description="Preferred skills improve ranking but do not exclude a caregiver."
            selected={preferred}
            excludeIds={required.map(skill => skill.id)}
            onChange={updatePreferred}
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.preferredSkillIds?.message}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>Save Skills</Button>
        </div>
      </form>
    </Modal>
  )
}
