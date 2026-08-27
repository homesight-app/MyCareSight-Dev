import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ClientsContent from '@/components/ClientsContent'
import FeatureGate from '@/components/FeatureGate'

const PAGE_SIZE = 50

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string; lead?: string; firstName?: string; lastName?: string; email?: string; phone?: string; gender?: string; dateOfBirth?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/pages/auth/login')

  const supabase = await createClient()

  const params = await searchParams

  const page         = Math.max(0, parseInt(params.page ?? '0') || 0)
  const search       = params.q ?? ''
  const statusFilter = params.status ?? 'active'
  const leadId       = params.lead ?? null

  const agencyId = (session!.profile as { agency_id?: string | null } | null)?.agency_id ?? null

  const [clientsResult, counts] = agencyId
    ? await Promise.all([
        q.getPatientsByAgencyId(supabase, agencyId, { page, pageSize: PAGE_SIZE, search, status: statusFilter }),
        q.getPatientCountsByAgencyId(supabase, agencyId),
      ])
    : [{ data: [], count: 0, error: null }, { total: 0, active: 0 }]

  const clients = clientsResult.data ?? []
  const totalCount = clientsResult.count ?? 0

  const prefill = leadId ? {
    firstName:   params.firstName   ?? '',
    lastName:    params.lastName    ?? '',
    email:       params.email       ?? '',
    phone:       params.phone       ?? '',
    gender:      params.gender      ?? '',
    dateOfBirth: params.dateOfBirth ?? '',
  } : undefined

  return (
    <FeatureGate feature="clients" agencyId={agencyId}>
      <ClientsContent
        clients={clients}
        totalCount={totalCount}
        activeCount={counts.active}
        totalAllCount={counts.total}
        page={page}
        pageSize={PAGE_SIZE}
        search={search}
        statusFilter={statusFilter}
        leadId={leadId}
        prefill={prefill}
      />
    </FeatureGate>
  )
}
