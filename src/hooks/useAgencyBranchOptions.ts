'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { branchOptionsAction } from '@/app/actions/agency-branches'

/** Per-mounted-surface cache; no polling, global identity cache or browser storage. */
export function useAgencyBranchOptions(enabled = true) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof branchOptionsAction>> | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [version, setVersion] = useState(0)
  const pending = useRef<ReturnType<typeof branchOptionsAction> | null>(null)
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    pending.current ??= branchOptionsAction()
    void pending.current.then(value => { if (!cancelled) setResult(value) })
      .catch(() => { if (!cancelled) setResult({ success: false, error: 'Unable to load branches.' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled, version])
  const retry = useCallback(() => { pending.current = null; setVersion(value => value + 1) }, [])
  return { result, loading, retry }
}
