'use client'

import { useEffect, useRef, useState } from 'react'
import { branchOptionsAction } from '@/app/actions/agency-branches'
import Button from '@/components/ui/PrimaryButton'

/** Mounted only inside an existing editor. One authorized, bounded options read. */
export default function BranchSelectField({ id, value, currentName, onChange, disabled, error }: {
  id: string; value?: string; currentName?: string | null; onChange: (value: string, name?: string) => void; disabled?: boolean; error?: string
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof branchOptionsAction>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const pending = useRef<ReturnType<typeof branchOptionsAction> | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    pending.current ??= branchOptionsAction()
    void pending.current.then(response => { if (!cancelled) setResult(response) })
      .catch(() => { if (!cancelled) setResult({ success: false, error: 'Unable to load branches.' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [retry])
  const rows = result?.success ? result.data : []
  return <div>
    <label htmlFor={id} className="block text-sm text-gray-600 mb-1">Branch <span className="text-danger">*</span></label>
    <select id={id} value={value ?? ''} onChange={event => onChange(event.target.value, rows.find(row => row.id === event.target.value)?.name)} disabled={disabled || loading || !result?.success}
      aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      {!value && <option value="">Choose a branch</option>}
      {value && !rows.some(row => row.id === value) && <option value={value}>{currentName || 'Current branch'}</option>}
      {rows.map(row => <option key={row.id} value={row.id} disabled={row.status !== 'active'}>{row.name}{row.status !== 'active' ? ' (inactive)' : ''}{row.is_default ? ' (default)' : ''}</option>)}
    </select>
    {loading && <p role="status" className="text-sm text-gray-500">Loading branches…</p>}
    {!loading && result && !result.success && <p role="alert" className="text-sm text-danger">{result.error} <Button size="sm" variant="secondary" type="button" onClick={() => { pending.current = null; setRetry(value => value + 1) }}>Retry</Button></p>}
    {error && <p id={id + '-error'} role="alert" className="text-sm text-danger">{error}</p>}
  </div>
}
