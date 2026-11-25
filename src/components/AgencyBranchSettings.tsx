'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import PhoneInput from '@/components/ui/PhoneInput'
import EmailInput from '@/components/ui/EmailInput'
import StateSelect from '@/components/ui/StateSelect'
import { normalizeUSState } from '@/lib/constants'
import { changeBranchStateAction, listBranchesAction, saveBranchAction } from '@/app/actions/agency-branches'
import { branchFormSchema, type BranchFormData } from '@/lib/schemas/agency-branches'
import type { AgencyBranch } from '@/lib/agency-branches'
import { BRANCH_PAGE_SIZE } from '@/lib/agency-branches'
import { useTableState } from '@/hooks/useTableState'
import SearchInput from '@/components/ui/SearchInput'
import TablePagination from '@/components/ui/TablePagination'
import SortableColumnHeader from '@/components/ui/SortableColumnHeader'
import RecordActionsMenu from '@/components/ui/RecordActionsMenu'
import StatusBadge from '@/components/ui/StatusBadge'
import { Plus, RefreshCw } from 'lucide-react'

const inputClass = 'w-full rounded-ui-control border border-secondary-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus'

export default function AgencyBranchSettings({ agencyId, canManage = true }: { agencyId?: string; canManage?: boolean }) {
  const [rows, setRows] = useState<AgencyBranch[]>([])
  const { page, setPage, search, setSearch, sort, setSort } = useTableState({ pageSize: BRANCH_PAGE_SIZE, defaultSort: { key: 'name', dir: 'asc' } })
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AgencyBranch | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  type Result = Awaited<ReturnType<typeof listBranchesAction>>
  const cache = useRef(new Map<string, Result>())
  const requests = useRef(new Map<string, Promise<Result>>())
  const refresh = useCallback(() => { cache.current.clear(); setVersion(value => value + 1) }, [])

  useEffect(() => {
    let current = true
    const key = JSON.stringify([agencyId, page, search, sort?.key, sort?.dir, version])
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        let result = cache.current.get(key)
        if (!result) {
          let request = requests.current.get(key)
          if (!request) {
            request = listBranchesAction({ page, search, sort, ...(agencyId ? { agencyId } : {}) })
            requests.current.set(key, request)
            void request.finally(() => requests.current.delete(key)).catch(() => {})
          }
          result = await request
          if (result.success) {
            if (cache.current.size >= 12) cache.current.delete(cache.current.keys().next().value!)
            cache.current.set(key, result)
          }
        }
        if (!current) return
        if (result.success) { setRows(result.data.rows); setTotalCount(result.data.totalCount); setError(null) }
        else setError(result.error)
      } catch { if (current) setError('Unable to load branches. Try again.') }
      finally { if (current) setLoading(false) }
    }, search ? 400 : 0)
    return () => { current = false; clearTimeout(timer) }
  }, [agencyId, page, search, sort, version])

  async function change(id: string, operation: 'default' | 'activate' | 'deactivate') {
    setBusy(true)
    try {
      const result = agencyId ? await changeBranchStateAction({ id, operation }, agencyId) : await changeBranchStateAction({ id, operation })
      if (!result.success) toast.error(result.error)
      else { toast.success('Branch updated'); refresh() }
    } catch { toast.error('Unable to update this branch. Refresh before retrying.') }
    finally { setBusy(false) }
  }

  return <section className="space-y-4" aria-label="Branch setup">
    <h3 className="text-lg font-semibold">Branches</h3>
    <p>New agency leads, clients and enrolled programs start in your default branch. Changing the default keeps existing assignments.</p>
    <p className="text-sm text-foreground-muted">Agency administrators retain access across all branches. Branch time zones describe the office; scheduling still uses the service location.</p>
    {editing ? <BranchForm key={editing === 'new' ? 'new' : editing.id} branch={editing === 'new' ? null : editing} agencyId={agencyId}
      onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} /> : <>
      <div className="rounded-xl border border-secondary-border bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="flex-1 min-w-48"><span className="sr-only">Search branches</span><SearchInput value={search} onChange={setSearch} placeholder="Search branches by name or code…" /></label>
          <Button type="button" variant="secondary" disabled={loading || busy} onClick={refresh}><RefreshCw className="w-4 h-4" />Refresh</Button>
          {canManage && <Button type="button" disabled={busy} onClick={() => setEditing('new')}><Plus className="w-4 h-4" />Add Branch</Button>}
        </div>
      {error && <div role="alert">{error} <Button variant="secondary" onClick={refresh}>Retry</Button></div>}
      {loading ? <p role="status">Loading branches…</p> : !error && <>
        <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Agency branches"><thead><tr className="border-b border-gray-100 bg-gray-50/60">
          <th className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
          <SortableColumnHeader label="Name" sortKey="name" currentSort={sort} onSort={setSort} />
          <SortableColumnHeader label="City" sortKey="city" currentSort={sort} onSort={setSort} />
          <SortableColumnHeader label="State" sortKey="state" currentSort={sort} onSort={setSort} />
          <th className="px-4 py-2.5 text-left">Time zone</th><th className="px-4 py-2.5 text-left">Status</th>
        </tr></thead><tbody className="divide-y divide-gray-50">{rows.map(branch => <tr key={branch.id}
          className={canManage && !busy ? 'cursor-pointer hover:bg-gray-50/50' : ''}
          onClick={event => { if (canManage && !busy && !(event.target as Element).closest('button,a')) setEditing(branch) }}>
          <td className="w-10 px-2 py-3" onClick={event => event.stopPropagation()}>{canManage && !busy && <RecordActionsMenu label={`Actions for ${branch.name}`} actions={[
            { label: 'Edit', onClick: () => setEditing(branch) },
            { label: 'Make Default', hidden: branch.is_default || branch.status !== 'active', onClick: () => change(branch.id, 'default') },
            { label: branch.status === 'active' ? 'Deactivate' : 'Activate', hidden: branch.is_default, destructive: branch.status === 'active', onClick: () => change(branch.id, branch.status === 'active' ? 'deactivate' : 'activate') },
          ]} />}</td>
          <td className={`px-4 py-3 ${branch.status === 'inactive' ? 'opacity-60' : ''}`}>
            {canManage ? <button type="button" disabled={busy} aria-label={`Edit ${branch.name}`} onClick={() => setEditing(branch)} className="text-left font-medium hover:text-brand focus-visible:ring-2 focus-visible:ring-focus">{branch.name}</button> : branch.name}
            {branch.is_default && <span className="ml-2 text-xs text-brand">Default</span>}
            <p className="text-xs text-foreground-muted">{branch.code}</p>
          </td>
          <td className={`px-4 py-3 ${branch.status === 'inactive' ? 'opacity-60' : ''}`}>{branch.city || '—'}</td><td className={`px-4 py-3 ${branch.status === 'inactive' ? 'opacity-60' : ''}`}>{branch.state || '—'}</td>
          <td className={`px-4 py-3 ${branch.status === 'inactive' ? 'opacity-60' : ''}`}>{branch.timezone}</td><td className="px-4 py-3"><StatusBadge status={branch.status} /></td>
        </tr>)}</tbody></table></div>
        {!rows.length && <p>No branches match this search.</p>}
      </>}
      </div>
      {!loading && !error && <TablePagination page={page} pageSize={BRANCH_PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} entityLabel="branches" />}
    </>}
  </section>
}

function BranchForm({ branch, onCancel, onSaved, agencyId }: { branch: AgencyBranch | null; onCancel: () => void; onSaved: () => void; agencyId?: string }) {
  const { register, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm<BranchFormData>({
    resolver: zodResolver(branchFormSchema), mode: 'onBlur',
    defaultValues: { id: branch?.id, name: branch?.name ?? '', timezone: branch?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      street_address: branch?.street_address ?? '', city: branch?.city ?? '', state: normalizeUSState(branch?.state ?? ''), zip_code: branch?.zip_code ?? '', phone: branch?.phone ?? '', email: branch?.email ?? '' },
  })
  const save = handleSubmit(async data => {
    try {
      const result = agencyId ? await saveBranchAction(data, agencyId) : await saveBranchAction(data)
      if (result.success) { toast.success('Branch saved'); onSaved() }
      else if ('fieldErrors' in result && result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) setError(field as keyof BranchFormData, { message: messages[0] }, { shouldFocus: true })
      } else toast.error(result.error)
    } catch { toast.error('Unable to save the branch. Refresh before retrying.') }
  })
  const fields = [ ['name', 'Branch name', true], ['timezone', 'Time zone', true],
    ['street_address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip_code', 'ZIP code'] ] as const
  return <form noValidate onSubmit={save} className="space-y-4">
    <h3 className="font-semibold">{branch ? 'Edit Branch' : 'Add Branch'}</h3>
    {branch && <p className="text-sm text-foreground-muted">Branch code: {branch.code}</p>}
    <fieldset disabled={isSubmitting} className="grid gap-4 md:grid-cols-2">
      {fields.map(([key, label, required]) => <div key={key}>
        <label htmlFor={`branch-${key}`}>{label}{required && <span className="text-danger"> *</span>}</label>
        {key === 'state'
          ? <StateSelect id="branch-state" {...register('state')} currentValue={watch('state')} className={inputClass}
            aria-invalid={!!errors.state} aria-describedby={errors.state ? 'branch-state-error' : undefined} />
          : <input id={`branch-${key}`} {...register(key)} required={!!required} className={inputClass}
            aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `branch-${key}-error` : undefined} />}
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
