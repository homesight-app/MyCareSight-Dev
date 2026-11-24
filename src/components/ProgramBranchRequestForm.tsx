'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import { branchOptionsAction, requestProgramBranchesAction } from '@/app/actions/agency-branches'
import { programBranchRequestSchema } from '@/lib/schemas/agency-branches'
import type { z } from 'zod'

/** Reuses the shared review modal; no parallel enrollment or catalog picker. */
export default function ProgramBranchRequestForm({ playbookId, state, onSaved, onBusyChange }: { playbookId: string; state: string; onSaved: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof branchOptionsAction>> | null>(null)
  const { register, reset, setError, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof programBranchRequestSchema>>({
    resolver: zodResolver(programBranchRequestSchema), mode: 'onBlur',
    defaultValues: { requestId: crypto.randomUUID(), playbook_id: playbookId, state, branchIds: [] },
  })
  useEffect(() => {
    let current = true
    branchOptionsAction().then(result => {
      if (!current) return
      setChoices(result)
      if (result.success) reset({ requestId: crypto.randomUUID(), playbook_id: playbookId, state,
        branchIds: result.data.filter(branch => branch.is_default && branch.status === 'active').map(branch => branch.id) })
    }).catch(() => { if (current) setChoices({ success: false, error: 'Unable to load branches. Reopen the review to retry.' }) })
    return () => { current = false }
  }, [playbookId, state, reset])
  const submit = handleSubmit(async data => {
    onBusyChange?.(true)
    try {
      const result = await requestProgramBranchesAction(data)
      if (result.success) { toast.success('Program requested'); onSaved() }
      else if ('fieldErrors' in result && result.fieldErrors) setError('branchIds', { message: result.fieldErrors.branchIds?.[0] ?? result.error })
      else toast.error(result.error)
    } catch { toast.error('Unable to confirm the request. Reopen your services before retrying.') }
    finally { onBusyChange?.(false) }
  })
  return <form noValidate onSubmit={submit} className="space-y-3">
    <p className="text-sm">Choose one or more branches. They will share one application, progress and common documents.</p>
    {!choices && <p role="status">Loading branches…</p>}
    {choices && !choices.success && <p role="alert">{choices.error}</p>}
    {choices?.success && <fieldset disabled={isSubmitting}>
      <legend className="font-semibold">Branches <span className="text-danger">*</span></legend>
      {choices.data.filter(branch => branch.status === 'active').map(branch => <label key={branch.id} className="block">
        <input type="checkbox" {...register('branchIds')} value={branch.id} /> {branch.name}{branch.is_default && ' (default)'}
      </label>)}
    </fieldset>}
    {errors.branchIds && <p role="alert" className="text-danger">{errors.branchIds.message}</p>}
    <Button type="submit" loading={isSubmitting} disabled={!choices?.success}>Submit Program Request</Button>
  </form>
}
