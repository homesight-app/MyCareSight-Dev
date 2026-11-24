'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/PrimaryButton'
import { branchOptionsAction } from '@/app/actions/agency-branches'

export default function AgencyBranchFilter({ value }: { value?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof branchOptionsAction>> | null>(null)
  async function show() {
    setOpen(true)
    if (result?.success) return
    setLoading(true)
    try { setResult(await branchOptionsAction()) }
    catch { setResult({ success: false, error: 'Unable to load branch choices.' }) }
    finally { setLoading(false) }
  }
  return <div className="mb-3 flex flex-wrap items-center gap-3">
    <Button type="button" variant="secondary" onClick={show} disabled={loading}>{value ? 'Branch filter applied' : 'All branches — filter'}</Button>
    {open && loading && <span role="status">Loading branches…</span>}
    {open && !loading && result && !result.success && <span role="alert">{result.error}</span>}
    {open && !loading && result?.success && <label>Branch <select value={value ?? ''}
      className="rounded-ui-control border border-secondary-border px-3 py-2"
      onChange={event => {
        const params = new URLSearchParams(window.location.search)
        params.delete('page')
        if (event.target.value) params.set('branch', event.target.value)
        else params.delete('branch')
        router.push(`?${params.toString()}`, { scroll: false })
      }}>
      <option value="">All branches</option>
      {result.data.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.status === 'inactive' ? ' (inactive)' : ''}</option>)}
    </select></label>}
  </div>
}
