'use client'

import { useEffect, useState } from 'react'
import AgencyInfoPanel from '@/components/AgencyInfoPanel'
import { getAgencyInfoAction } from '@/app/actions/agency-branches'

export default function AgencyInfoLoader({ branchesEnabled = false, initialTab = 'overview', initialError }: {
  branchesEnabled?: boolean; initialTab?: 'overview' | 'branches'; initialError?: string
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getAgencyInfoAction>> | null>(initialError ? { success: false, error: initialError } : null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (initialError && retry === 0) return
    let current = true
    setResult(null)
    getAgencyInfoAction().then(value => { if (current) setResult(value) }).catch(() => {
      if (current) setResult({ success: false, error: 'Unable to load agency information. Reopen this section to retry.' })
    })
    return () => { current = false }
  }, [retry, initialError])
  if (!result) return <p role="status">Loading agency information…</p>
  if (!result.success) return <div role="alert">{result.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>
  return <AgencyInfoPanel initialAgency={result.data} branchesEnabled={branchesEnabled} initialTab={initialTab} />
}
