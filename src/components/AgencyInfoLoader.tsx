'use client'

import { useEffect, useState } from 'react'
import AgencyInfoSection from '@/components/AgencyInfoSection'
import { getAgencyInfoAction } from '@/app/actions/agency-branches'

export default function AgencyInfoLoader() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getAgencyInfoAction>> | null>(null)
  useEffect(() => {
    let current = true
    getAgencyInfoAction().then(value => { if (current) setResult(value) }).catch(() => {
      if (current) setResult({ success: false, error: 'Unable to load agency information. Reopen this section to retry.' })
    })
    return () => { current = false }
  }, [])
  if (!result) return <p role="status">Loading agency information…</p>
  if (!result.success) return <p role="alert">{result.error}</p>
  return <AgencyInfoSection initialAgency={result.data} />
}
