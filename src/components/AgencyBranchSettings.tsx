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
import StatusBadge from '@/components/ui/StatusBadge'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'

const inputClass = 'w-full rounded-ui-control border border-secondary-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus'

const branchColumns: DataTableColumn<AgencyBranch>[] = [
  { key: 'name', label: 'Name', sortable: true, render: branch => <>
    <span>{branch.name}</span>{branch.is_default && <span className="ml-2 text-xs text-brand">Default</span>}
    <span className="block text-xs font-normal text-foreground-muted">{branch.code}</span>
  </> },
  { key: 'city', label: 'City', sortable: true, render: branch => branch.city || '—' },
  { key: 'state', label: 'State', sortable: true, render: branch => branch.state || '—' },
  { key: 'timezone', label: 'Time zone', render: branch => branch.timezone },
  { key: 'status', label: 'Status', retainEmphasis: true, render: branch => <StatusBadge status={branch.status} /> },
]

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
      onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} /> : <DataTable label="Agency branches" entityLabel="branches" rows={rows} columns={branchColumns}
      getRowKey={branch => branch.id} getRowLabel={branch => branch.name}
      pagination={{ page, pageSize: BRANCH_PAGE_SIZE, totalCount, onPageChange: setPage }}
      search={{ value: search, onChange: setSearch, placeholder: 'Search branches by name or code…' }}
      sort={{ value: sort, onChange: setSort }} loading={loading} error={error} disabled={busy}
      onRefresh={refresh} onRetry={refresh} emptyMessage="No branches match this search."
      addAction={canManage ? { label: 'Add Branch', onClick: () => setEditing('new') } : undefined}
      rowNavigation={canManage ? { columnKey: 'name', onOpen: branch => setEditing(branch), getLabel: branch => 'Edit ' + branch.name } : undefined}
      isRowInactive={branch => branch.status === 'inactive'}
      rowActions={canManage ? branch => [
        { label: 'Edit', onClick: () => setEditing(branch) },
        { label: 'Make Default', hidden: branch.is_default || branch.status !== 'active', onClick: () => change(branch.id, 'default') },
        { label: branch.status === 'active' ? 'Deactivate' : 'Activate', hidden: branch.is_default, destructive: branch.status === 'active', onClick: () => change(branch.id, branch.status === 'active' ? 'deactivate' : 'activate') },
      ] : undefined}
    />}
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
