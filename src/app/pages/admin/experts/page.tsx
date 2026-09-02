import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import ExpertListWithFilters from '@/components/ExpertListWithFilters'
import { 
  Users, 
  CheckCircle2,
  Briefcase,
  Plus
} from 'lucide-react'
import Link from 'next/link'

export default async function ExpertsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: experts } = await q.getLicensingExpertsOrdered(supabase)
  const expertIds = experts?.map(e => e.id) || []
  const { data: expertStates } =
    expertIds.length > 0 ? await q.getExpertStatesByExpertIds(supabase, expertIds) : { data: [] }
  const { data: clients } = await q.getClientsByExpertIds(
    supabase,
    expertIds.filter((id): id is string => id != null)
  )

  // Calculate statistics
  const totalExperts = experts?.length || 0
  const activeExperts = experts?.filter(e => e.status === 'active').length || 0
  const assignedClients = clients?.length || 0

  // Group states by expert
  const statesByExpert: Record<string, string[]> = {}
  expertStates?.forEach(es => {
    if (!statesByExpert[es.expert_id]) {
      statesByExpert[es.expert_id] = []
    }
    statesByExpert[es.expert_id].push(es.state)
  })

  // Count clients per expert
  const clientsByExpert: Record<string, number> = {}
  clients?.forEach(c => {
    if (c.expert_id) {
      clientsByExpert[c.expert_id] = (clientsByExpert[c.expert_id] || 0) + 1
    }
  })

  return (
      <div className="space-y-4 md:space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2 md:gap-3">
              <Users className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
              <span className="break-words">Licensing Experts</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">Manage your team of licensing consultants and specialists.</p>
          </div>
          <Link
            href="/pages/admin/experts/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-brand-hover transition-colors font-medium text-sm md:text-base whitespace-nowrap"
          >
            <Plus className="w-4 h-4 md:w-5 md:h-5" />
            Add Expert
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{totalExperts}</div>
            <div className="text-xs md:text-sm text-gray-600">Total Experts</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
              </div>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{activeExperts}</div>
            <div className="text-xs md:text-sm text-gray-600">Active Experts</div>
          </div>

          <div className="bg-white rounded-xl p-4 md:p-6 shadow-md border border-gray-100">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{assignedClients}</div>
            <div className="text-xs md:text-sm text-gray-600">Assigned Clients</div>
          </div>
        </div>

        {/* Expert List with Filters */}
        <ExpertListWithFilters
          experts={experts || []}
          statesByExpert={statesByExpert}
          clientsByExpert={clientsByExpert}
        />
      </div>
  )
}

