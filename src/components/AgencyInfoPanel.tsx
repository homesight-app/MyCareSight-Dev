'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import AgencySummaryCard from '@/components/AgencySummaryCard'
import Tabs from '@/components/ui/Tabs'
import Button from '@/components/ui/PrimaryButton'
import type { AgencyInfoRecord } from '@/lib/agency-branches'

const AgencyInfoSection = dynamic(() => import('@/components/AgencyInfoSection'), { loading: () => <p role="status">Loading editor…</p> })
const AgencyBranchSettings = dynamic(() => import('@/components/AgencyBranchSettings'), { loading: () => <p role="status">Loading branches…</p> })

export default function AgencyInfoPanel({ initialAgency, branchesEnabled = false, initialTab = 'overview' }: {
  initialAgency: AgencyInfoRecord
  branchesEnabled?: boolean
  initialTab?: 'overview' | 'branches'
}) {
  const [agency, setAgency] = useState(initialAgency)
  const [tab, setTab] = useState(branchesEnabled ? initialTab : 'overview')
  const [branchesOpened, setBranchesOpened] = useState(branchesEnabled && initialTab === 'branches')
  const [editing, setEditing] = useState(false)
  useEffect(() => { setAgency(initialAgency) }, [initialAgency])
  useEffect(() => { if (!branchesEnabled) setTab('overview') }, [branchesEnabled])
  return <section className="space-y-6" aria-label="Agency information">
    <AgencySummaryCard agency={agency} headingLevel={2} />
    <Tabs items={[{ key: 'overview', label: 'Agency Info' }, ...(branchesEnabled ? [{ key: 'branches', label: 'Branches' }] : [])]}
      active={tab} onChange={key => { if (key === 'overview' || key === 'branches') setTab(key); if (key === 'branches') setBranchesOpened(true) }} />
    <div hidden={tab !== 'overview'}>
      {editing ? <AgencyInfoSection initialAgency={agency} embedded onCancel={() => setEditing(false)}
        onSaved={data => { setAgency(current => ({ ...current, ...data, name: data.name ?? current.name })); setEditing(false) }} /> : <div className="space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Agency details</h3><Button variant="secondary" onClick={() => setEditing(true)}>Edit Agency Info</Button></div>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-foreground-muted">Primary license number</dt><dd>{agency.primary_license_number || '—'}</dd></div>
          <div><dt className="text-foreground-muted">Mailing address</dt><dd>{agency.same_as_physical !== false ? 'Same as physical address' :
            [agency.mailing_street_address, agency.mailing_city, agency.mailing_state, agency.mailing_zip_code].filter(Boolean).join(', ') || '—'}</dd></div></dl>
        <p className="text-sm text-foreground-muted">Agency details and office addresses are maintained separately. Manage office locations under Branches.</p>
      </div>}
    </div>
    <div hidden={tab !== 'branches'}>{branchesEnabled && branchesOpened && <AgencyBranchSettings />}</div>
  </section>
}
