'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import { assignRecordBranchesAction, getRecordBranchesAction } from '@/app/actions/agency-branches'
import { branchAssignmentSchema } from '@/lib/schemas/agency-branches'
import type { BranchRecordKind } from '@/lib/agency-branches'
import type { z } from 'zod'

/** On-demand: unopened assignments issue no request and never block record data. */
export default function RecordBranchAssignment({ kind, recordId }: { kind: BranchRecordKind; recordId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof getRecordBranchesAction>> | null>(null)
  const { control, register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof branchAssignmentSchema>>({
    resolver: zodResolver(branchAssignmentSchema), mode: 'onBlur', defaultValues: { kind, recordId, branchIds: [] },
  })
  async function show() {
    setOpen(true)
    if (result?.success) return
    setLoading(true)
    try {
      const response = await getRecordBranchesAction({ kind, recordId })
      setResult(response)
      if (response.success) reset({ kind, recordId, branchIds: response.data.branchIds })
    } catch { setResult({ success: false, error: 'Unable to load branch assignments.' }) }
    finally { setLoading(false) }
  }
  const save = handleSubmit(async data => {
    try {
      const response = await assignRecordBranchesAction(data)
      if (response.success) { toast.success('Branch assignment saved'); setOpen(false); setResult(null); router.refresh() }
      else if ('fieldErrors' in response && response.fieldErrors) setError('branchIds', { message: response.fieldErrors.branchIds?.[0] ?? response.error })
      else toast.error(response.error)
    } catch { toast.error('Unable to save the assignment. Refresh before retrying.') }
  })
  return <section className="my-3 rounded-ui-control border border-secondary-border p-3" aria-label="Branch assignment">
    <Button type="button" variant="secondary" size="sm" onClick={() => open ? setOpen(false) : show()} disabled={loading || isSubmitting} aria-expanded={open}>Branches</Button>
    {open && <div className="mt-3 space-y-3">
      {loading && <p role="status">Loading branch assignment…</p>}
      {!loading && result && !result.success && <p role="alert">{result.error} <Button variant="secondary" onClick={show}>Retry</Button></p>}
      {!loading && result?.success && <form noValidate onSubmit={save}>
        <p className="text-sm mb-2">{kind === 'application' ? 'This program has one shared workflow across its selected branches.' : kind === 'client' ? 'Choose the current branch. Clients with existing visits require the later reviewed transfer workflow.' : 'Select the current branch for this lead.'}</p>
        <fieldset disabled={isSubmitting || !result.data.canEdit}>
          <legend className="font-semibold">{kind === 'application' ? 'Associated branches' : 'Current branch'} <span className="text-danger">*</span></legend>
          {kind === 'application' ? result.data.branches.map(branch => <label key={branch.id} className="block">
            <input type="checkbox" value={branch.id} {...register('branchIds')} disabled={isSubmitting || !result.data.canEdit || branch.status !== 'active'} /> {branch.name}{branch.status !== 'active' && ' (inactive)'}
          </label>) : <Controller name="branchIds" control={control} render={({ field }) => <select aria-label="Current branch"
            ref={field.ref} name={field.name} onBlur={field.onBlur} value={field.value[0] ?? ''} onChange={event => field.onChange([event.target.value])}
            className="rounded-ui-control border border-secondary-border px-3 py-2">
            {result.data.branches.map(branch => <option key={branch.id} value={branch.id} disabled={branch.status !== 'active'}>{branch.name}{branch.status !== 'active' && ' (inactive)'}</option>)}
          </select>} />}
        </fieldset>
        {errors.branchIds && <p role="alert" className="text-danger">{errors.branchIds.message}</p>}
        {result.data.canEdit && <Button className="mt-3" type="submit" loading={isSubmitting}>Save Assignment</Button>}
      </form>}
    </div>}
  </section>
}
