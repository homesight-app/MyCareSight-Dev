'use client'

import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/PrimaryButton'
import SkillPicker from '@/components/ui/SkillPicker'
import Modal from '@/components/Modal'
import { getCaregiverSkillsAction, saveCaregiverSkillsAction } from '@/app/actions/skills'
import {
  caregiverSkillSaveSchema,
  type CaregiverSkillSaveInput,
} from '@/lib/schemas/skill-catalog'
import type { CaregiverSkillSelection, SkillCatalogOption } from '@/lib/skill-catalog'

interface Caregiver {
  id: string
  first_name: string
  last_name: string
  skills?: string[] | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  caregiver: Caregiver
  onSuccess?: () => void
  subtitle?: string | null
  verificationMode?: 'manager' | 'self'
}

const asCatalogOptions = (skills: CaregiverSkillSelection[]): SkillCatalogOption[] =>
  skills.map(({ verificationStatus: _verificationStatus, ...skill }) => skill)

export default function EditCaregiverSkillsModal({
  isOpen,
  onClose,
  caregiver,
  onSuccess,
  subtitle: subtitleProp,
  verificationMode = 'manager',
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<SkillCatalogOption[]>([])
  const [selections, setSelections] = useState<CaregiverSkillSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<CaregiverSkillSaveInput>({
    resolver: zodResolver(caregiverSkillSaveSchema),
    mode: 'onBlur',
    defaultValues: { caregiverMemberId: caregiver.id, skillIds: [] },
  })

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setServerError(null)
    getCaregiverSkillsAction(caregiver.id).then(result => {
      if (cancelled) return
      setLoading(false)
      if (!result.success || !result.data) {
        setServerError(result.error ?? 'Unable to load caregiver skills.')
        return
      }
      setSelections(result.data)
      const skills = asCatalogOptions(result.data)
      setSelected(skills)
      form.reset({ caregiverMemberId: caregiver.id, skillIds: skills.map(skill => skill.id) })
    })
    return () => { cancelled = true }
  }, [caregiver.id, form, isOpen])

  const updateSelected = (skills: SkillCatalogOption[]) => {
    setSelected(skills)
    form.setValue('skillIds', skills.map(skill => skill.id), { shouldDirty: true, shouldValidate: true })
  }

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = await saveCaregiverSkillsAction(values)
    if (!result.success || !result.data) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'skillIds' || field === 'caregiverMemberId') {
          form.setError(field, { message: messages[0] })
        }
      }
      setServerError(result.error ?? 'Unable to save caregiver skills.')
      return
    }
    setSelections(result.data)
    router.refresh()
    onSuccess?.()
  })

  const pendingCount = selections.filter(
    skill => skill.verificationStatus === 'self_reported' && selected.some(item => item.id === skill.id)
  ).length
  const modalSubtitle = subtitleProp ?? `Select caregiver skills for ${caregiver.first_name} ${caregiver.last_name}.`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Skills"
      subtitle={modalSubtitle}
      size="lg"
      closeOnBackdropClick={!form.formState.isSubmitting}
      closeOnEscape={!form.formState.isSubmitting}
    >
      <form noValidate onSubmit={submit} className="space-y-5">
        {serverError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
        ) : null}

        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-blue-50 p-2"><Sparkles className="h-5 w-5 text-blue-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Caregiver Skills</h2>
            <p className="mt-1 text-sm text-gray-500">
              {verificationMode === 'self'
                ? 'Add skills you have. New skills remain pending until an agency manager verifies them.'
                : 'Saving verifies the selected skills for caregiver matching.'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading skills...
          </div>
        ) : (
          <SkillPicker
            label="Skills"
            description="Search the shared catalog and add each applicable skill."
            selected={selected}
            onChange={updateSelected}
            disabled={form.formState.isSubmitting}
            error={form.formState.errors.skillIds?.message}
          />
        )}

        {pendingCount > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {pendingCount} selected skill{pendingCount === 1 ? '' : 's'} currently awaiting verification.
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-500">{selected.length} skill{selected.length === 1 ? '' : 's'} selected</p>
          <div className="flex gap-3">
            <Button variant="secondary" type="button" onClick={onClose} disabled={form.formState.isSubmitting}>Cancel</Button>
            <Button variant="primary" type="submit" loading={form.formState.isSubmitting} disabled={loading} icon={Save}>Save Skills</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
