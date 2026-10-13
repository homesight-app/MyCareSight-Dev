'use client'

import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Search, Sparkles } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import { upsertPatientCaregiverRequirementsAction } from '@/app/actions/patients'
import {
  patientCaregiverSkillsSchema,
  type PatientCaregiverSkillsInput,
} from '@/lib/schemas/patient-caregiver-skills'

export type CaregiverSkillCatalogItem = { type: string; name: string }

type Props = {
  isOpen: boolean
  patientId: string
  patientName: string
  catalog: CaregiverSkillCatalogItem[]
  catalogError?: string | null
  initialRequiredSkills: string[]
  initialPreferredSkills: string[]
  onClose: () => void
  onSaved: (requiredSkills: string[], preferredSkills: string[]) => void
}

const categoryOrder = [
  'Clinical Care',
  'Specialty Conditions',
  'Physical Support',
  'Daily Living',
  'Certifications',
  'Language',
  'Other',
]

export default function EditClientCaregiverSkillsModal({
  isOpen,
  patientId,
  patientName,
  catalog,
  catalogError,
  initialRequiredSkills,
  initialPreferredSkills,
  onClose,
  onSaved,
}: Props) {
  const [search, setSearch] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<PatientCaregiverSkillsInput>({
    resolver: zodResolver(patientCaregiverSkillsSchema),
    mode: 'onBlur',
    defaultValues: {
      patientId,
      requiredSkills: initialRequiredSkills,
      preferredSkills: initialPreferredSkills,
    },
  })
  const requiredSkills = form.watch('requiredSkills') ?? []
  const preferredSkills = form.watch('preferredSkills') ?? []

  useEffect(() => {
    if (!isOpen) return
    form.reset({ patientId, requiredSkills: initialRequiredSkills, preferredSkills: initialPreferredSkills })
    setSearch('')
    setServerError(null)
  }, [form, initialPreferredSkills, initialRequiredSkills, isOpen, patientId])

  const completeCatalog = useMemo(() => {
    const known = new Set(catalog.map(skill => skill.name))
    const legacy = [...initialRequiredSkills, ...initialPreferredSkills]
      .filter((name, index, values) => !known.has(name) && values.indexOf(name) === index)
      .map(name => ({ name, type: 'Other' }))
    return [...catalog, ...legacy]
  }, [catalog, initialPreferredSkills, initialRequiredSkills])

  const categories = useMemo(() => {
    const grouped = new Map<string, CaregiverSkillCatalogItem[]>()
    const query = search.trim().toLowerCase()
    for (const skill of completeCatalog) {
      if (query && !skill.name.toLowerCase().includes(query) && !skill.type.toLowerCase().includes(query)) continue
      const values = grouped.get(skill.type) ?? []
      values.push(skill)
      grouped.set(skill.type, values)
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const aIndex = categoryOrder.indexOf(a)
      const bIndex = categoryOrder.indexOf(b)
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? categoryOrder.length : aIndex) - (bIndex === -1 ? categoryOrder.length : bIndex)
      }
      return a.localeCompare(b)
    })
  }, [completeCatalog, search])

  const toggle = (name: string, kind: 'required' | 'preferred') => {
    const target = kind === 'required' ? requiredSkills : preferredSkills
    const other = kind === 'required' ? preferredSkills : requiredSkills
    const next = target.includes(name) ? target.filter(skill => skill !== name) : [...target, name]
    form.setValue(kind === 'required' ? 'requiredSkills' : 'preferredSkills', next, {
      shouldDirty: true,
      shouldValidate: true,
    })
    if (!target.includes(name) && other.includes(name)) {
      form.setValue(
        kind === 'required' ? 'preferredSkills' : 'requiredSkills',
        other.filter(skill => skill !== name),
        { shouldDirty: true, shouldValidate: true }
      )
    }
  }

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = await upsertPatientCaregiverRequirementsAction(values)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'requiredSkills' || field === 'preferredSkills' || field === 'patientId') {
          form.setError(field, { message: messages[0] })
        }
      }
      setServerError(result.error ?? 'Check the selected skills and try again.')
      return
    }
    const normalized = patientCaregiverSkillsSchema.parse(values)
    onSaved(normalized.requiredSkills, normalized.preferredSkills)
  })

  const renderSelection = (kind: 'required' | 'preferred') => {
    const selected = kind === 'required' ? requiredSkills : preferredSkills
    const title = kind === 'required' ? 'Required skills' : 'Preferred skills'
    const help = kind === 'required'
      ? 'Caregivers must have every selected skill to be eligible.'
      : 'These skills improve match ranking but do not exclude a caregiver.'
    const error = form.formState.errors[kind === 'required' ? 'requiredSkills' : 'preferredSkills']?.message
    return (
      <section className="rounded-lg border border-gray-200 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{help}</p>
        </div>
        <div className="space-y-4">
          {categories.map(([category, skills]) => (
            <div key={`${kind}-${category}`}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {skills.map(skill => {
                  const checked = selected.includes(skill.name)
                  return (
                    <label key={`${kind}-${skill.name}`} className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(skill.name, kind)}
                        disabled={form.formState.isSubmitting}
                        className="mt-0.5"
                      />
                      <span>{skill.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          {categories.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">No caregiver skills match your search.</p>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <p className="mt-3 text-xs text-gray-500">{selected.length} selected</p>
      </section>
    )
  }

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
            <p className="mt-1 text-sm text-gray-500">Set eligibility requirements and ranking preferences.</p>
          </div>
        </div>

        {catalogError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {catalogError} Saved skills remain visible, but new skills cannot be selected until the catalog loads.
          </div>
        ) : null}
        {serverError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
        ) : null}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search caregiver skills..."
            className="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            disabled={form.formState.isSubmitting}
          />
        </div>

        <div className="grid max-h-[58vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
          {renderSelection('required')}
          {renderSelection('preferred')}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
            Save Skills
          </Button>
        </div>
      </form>
    </Modal>
  )
}
