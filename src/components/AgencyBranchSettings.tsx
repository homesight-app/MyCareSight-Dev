'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'
import { changeBranchStateAction, listBranchesAction, saveBranchAction } from '@/app/actions/agency-branches'
import { branchFormSchema, type BranchFormData } from '@/lib/schemas/agency-branches'
import type { AgencyBranch } from '@/lib/agency-branches'

const inputClass = 'w-full rounded-ui-control border border-secondary-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus'

export default function AgencyBranchSettings() {
  const [rows, setRows] = useState<AgencyBranch[]>([])
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AgencyBranch | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(value => value + 1), [])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await listBranchesAction({ page, search })
        if (!current) return
        if (result.success) { setRows(result.data.rows); setHasMore(result.data.hasMore); setError(null) }
        else setError(result.error)
      } catch { if (current) setError('Unable to load branches. Try again.') }
      finally { if (current) setLoading(false) }
    }, search ? 400 : 0)
    return () => { current = false; clearTimeout(timer) }
  }, [page, search, version])

  async function change(id: string, operation: 'default' | 'activate' | 'deactivate') {
    setBusy(true)
    try {
      const result = await changeBranchStateAction({ id, operation })
      if (!result.success) toast.error(result.error)
      else { toast.success('Branch updated'); refresh() }
    } catch { toast.error('Unable to update this branch. Refresh before retrying.') }
    finally { setBusy(false) }
  }

  return <section className="space-y-4" aria-label="Branch setup">
    <h2 className="text-lg font-semibold">Branches</h2>
    <p>New agency leads, clients and enrolled programs start in your default branch. Changing the default keeps existing assignments.</p>
    <p className="text-sm text-foreground-muted">Agency administrators retain access across all branches. Branch time zones describe the office; scheduling still uses the service location.</p>
    {editing ? <BranchForm key={editing === 'new' ? 'new' : editing.id} branch={editing === 'new' ? null : editing}
      onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} /> : <>
      <div className="flex gap-3 items-center">
        <label className="flex-1">Search branches<input className={inputClass} value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
        <Button type="button" onClick={() => setEditing('new')}>Add Branch</Button>
      </div>
      {error && <div role="alert">{error} <Button variant="secondary" onClick={refresh}>Retry</Button></div>}
      {loading ? <p role="status">Loading branches…</p> : !error && <>
        <ul className="space-y-3">{rows.map(branch => <li key={branch.id} className="rounded-ui-control border border-secondary-border p-4">
          <div className="font-semibold">{branch.name} {branch.is_default && <span>— Default</span>}</div>
          <p className="text-sm">{branch.code} · {branch.status} · {branch.timezone}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing(branch)} aria-label={`Edit ${branch.name}`}>Edit</Button>
            {!branch.is_default && branch.status === 'active' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => change(branch.id, 'default')} aria-label={`Make ${branch.name} default`}>Make Default</Button>}
            {!branch.is_default && <Button variant="secondary" size="sm" disabled={busy} onClick={() => change(branch.id, branch.status === 'active' ? 'deactivate' : 'activate')}
              aria-label={`${branch.status === 'active' ? 'Deactivate' : 'Activate'} ${branch.name}`}>{branch.status === 'active' ? 'Deactivate' : 'Activate'}</Button>}
          </div>
        </li>)}</ul>
        {!rows.length && <p>No branches match this search.</p>}
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span>Page {page + 1}</span>
          <Button variant="secondary" disabled={!hasMore || busy} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </>}
    </>}
  </section>
}

function BranchForm({ branch, onCancel, onSaved }: { branch: AgencyBranch | null; onCancel: () => void; onSaved: () => void }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<BranchFormData>({
    resolver: zodResolver(branchFormSchema), mode: 'onBlur',
    defaultValues: { id: branch?.id, code: branch?.code ?? '', name: branch?.name ?? '', timezone: branch?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      street_address: branch?.street_address ?? '', city: branch?.city ?? '', state: branch?.state ?? '', zip_code: branch?.zip_code ?? '', phone: branch?.phone ?? '', email: branch?.email ?? '' },
  })
  const save = handleSubmit(async data => {
    try {
      const result = await saveBranchAction(data)
      if (result.success) { toast.success('Branch saved'); onSaved() }
      else if ('fieldErrors' in result && result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof BranchFormData, { message: messages[0] }, { shouldFocus: true })
      } else toast.error(result.error)
    } catch { toast.error('Unable to save the branch. Refresh before retrying.') }
  })
  const fields = [ ['name', 'Branch name', true], ['code', 'Branch code', true], ['timezone', 'Time zone', true],
    ['street_address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip_code', 'ZIP code'] ] as const
  return <form noValidate onSubmit={save} className="space-y-4">
    <h3 className="font-semibold">{branch ? 'Edit Branch' : 'Add Branch'}</h3>
    <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2">
      {fields.map(([key, label, required]) => <div key={key}>
        <label htmlFor={`branch-${key}`}>{label}{required && <span className="text-danger"> *</span>}</label>
        <input id={`branch-${key}`} {...register(key)} readOnly={key === 'code' && !!branch} required={!!required} className={inputClass}
          aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `branch-${key}-error` : undefined} />
        {errors[key] && <p id={`branch-${key}-error`} className="text-danger text-sm">{errors[key]?.message}</p>}
      </div>)}
      <div><label htmlFor="branch-phone">Phone</label><PhoneInput id="branch-phone" {...register('phone')} className={inputClass}
        aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'branch-phone-error' : undefined} />
        {errors.phone && <p id="branch-phone-error" role="alert" className="text-danger">{errors.phone.message}</p>}</div>
      <div><label htmlFor="branch-email">Email</label><EmailInput id="branch-email" {...register('email')} className={inputClass}
        aria-invalid={!!errors.email} aria-describedby={errors.email ? 'branch-email-error' : undefined} />
        {errors.email && <p id="branch-email-error" role="alert" className="text-danger">{errors.email.message}</p>}</div>
    </fieldset>
    <div className="flex gap-3"><Button type="submit" loading={isSubmitting}>Save Branch</Button><Button type="button" variant="secondary" disabled={isSubmitting} onClick={onCancel}>Cancel</Button></div>
  </form>
}
