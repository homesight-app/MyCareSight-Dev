'use client'

import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2, Pencil, Plus, Search } from 'lucide-react'
import Modal from '@/components/Modal'
import Button from '@/components/ui/PrimaryButton'
import {
  createSystemSkillAction,
  searchSkillCatalogAction,
  updateSystemSkillAction,
} from '@/app/actions/skills'
import {
  skillCatalogCreateSchema,
  type SkillCatalogCreateInput,
} from '@/lib/schemas/skill-catalog'
import type { SkillCatalogOption } from '@/lib/skill-catalog'

type Category = { id: string; name: string; is_active: boolean }

export default function SkillCatalogManagement({ categories }: { categories: Category[] }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SkillCatalogOption[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SkillCatalogOption | null | undefined>(undefined)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      const result = await searchSkillCatalogAction({ query, offset: 0, limit: 25, includeInactive: true })
      if (cancelled) return
      setLoading(false)
      if (!result.success || !result.data) {
        setItems([])
        setNextOffset(null)
        setError(result.error ?? 'Unable to load skills.')
        return
      }
      setItems(result.data.items.filter(skill => skill.scope === 'system'))
      setNextOffset(result.data.nextOffset)
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, reload])

  const loadMore = async () => {
    if (nextOffset === null || loading) return
    setLoading(true)
    const result = await searchSkillCatalogAction({ query, offset: nextOffset, limit: 25, includeInactive: true })
    setLoading(false)
    if (!result.success || !result.data) {
      setError(result.error ?? 'Unable to load more skills.')
      return
    }
    setItems(current => [...current, ...result.data!.items.filter(skill => skill.scope === 'system')])
    setNextOffset(result.data.nextOffset)
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Caregiver Skill Catalog</h2>
          <p className="mt-1 text-sm text-gray-500">Manage the searchable system skills used for client requirements and caregiver matching.</p>
        </div>
        <Button type="button" icon={Plus} onClick={() => setEditing(null)}>Add Skill</Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search skills by name or code..."
          className="block w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {error ? <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="grid grid-cols-[1fr_180px_130px_90px_44px] gap-3 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
          <span>Skill</span><span>Category</span><span>Service</span><span>Status</span><span />
        </div>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading skills...</div>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No skills found. Add the first catalog skill.</p>
        ) : items.map(skill => (
          <div key={skill.id} className="grid grid-cols-[1fr_180px_130px_90px_44px] items-center gap-3 border-t border-gray-100 px-4 py-3 text-sm first:border-t-0">
            <div className="min-w-0"><p className="truncate font-medium text-gray-900">{skill.name}</p><p className="truncate text-xs text-gray-400">{skill.code}</p></div>
            <span className="truncate text-gray-600">{skill.categoryName}</span>
            <span className="text-gray-600">{skill.serviceType === 'non_skilled' ? 'Non-skilled' : skill.serviceType === 'skilled' ? 'Skilled' : 'Any'}</span>
            <span className={skill.isActive ? 'text-green-700' : 'text-gray-500'}>{skill.isActive ? 'Active' : 'Inactive'}</span>
            <button type="button" onClick={() => setEditing(skill)} aria-label={`Edit ${skill.name}`} className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {nextOffset !== null ? (
        <div className="mt-4 text-center"><Button type="button" variant="secondary" onClick={loadMore} loading={loading}>Load More</Button></div>
      ) : null}

      {editing !== undefined ? (
        <SkillCatalogForm
          skill={editing}
          categories={categories.filter(category => category.is_active)}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); setReload(value => value + 1) }}
        />
      ) : null}
    </div>
  )
}

function SkillCatalogForm({
  skill,
  categories,
  onClose,
  onSaved,
}: {
  skill: SkillCatalogOption | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<SkillCatalogCreateInput>({
    resolver: zodResolver(skillCatalogCreateSchema),
    mode: 'onBlur',
    defaultValues: {
      name: skill?.name ?? '',
      categoryId: skill?.categoryId ?? categories[0]?.id ?? '',
      serviceType: skill?.serviceType ?? null,
    },
  })
  const [isActive, setIsActive] = useState(skill?.isActive ?? true)

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = skill
      ? await updateSystemSkillAction({ ...values, skillId: skill.id, isActive })
      : await createSystemSkillAction(values)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'name' || field === 'categoryId' || field === 'serviceType') form.setError(field, { message: messages[0] })
      }
      setServerError(result.error ?? 'Unable to save skill.')
      return
    }
    onSaved()
  })

  return (
    <Modal isOpen onClose={onClose} title={skill ? 'Edit Caregiver Skill' : 'Add Caregiver Skill'} size="md" closeOnEscape={!form.formState.isSubmitting} closeOnBackdropClick={!form.formState.isSubmitting}>
      <form noValidate onSubmit={submit} className="space-y-4">
        {serverError ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p> : null}
        <label className="block text-sm font-medium text-gray-700">Skill Name <span className="text-red-600">*</span>
          <input {...form.register('name')} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" />
          {form.formState.errors.name ? <span className="text-xs text-red-600">{form.formState.errors.name.message}</span> : null}
        </label>
        <label className="block text-sm font-medium text-gray-700">Category <span className="text-red-600">*</span>
          <select {...form.register('categoryId')} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {form.formState.errors.categoryId ? <span className="text-xs text-red-600">{form.formState.errors.categoryId.message}</span> : null}
        </label>
        <label className="block text-sm font-medium text-gray-700">Service Type
          <select
            value={form.watch('serviceType') ?? ''}
            onChange={event => form.setValue('serviceType', event.target.value === '' ? null : event.target.value as 'skilled' | 'non_skilled', { shouldDirty: true })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Any service</option><option value="skilled">Skilled</option><option value="non_skilled">Non-skilled</option>
          </select>
        </label>
        {skill ? (
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} /> Active</label>
        ) : null}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Save Skill</Button>
        </div>
      </form>
    </Modal>
  )
}
