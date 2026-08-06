import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import * as q from '@/lib/supabase/query'
import Link from 'next/link'
import { 
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react'

export default async function ExpertClientsPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: expert } = await q.getLicensingExpertById(supabase, id)

  const [{ data: clients }] = await Promise.all([
    expert?.user_id ? q.getClientsByExpertId(supabase, expert.user_id) : Promise.resolve({ data: [] })
  ])

  if (!expert) {
    redirect('/pages/admin/users?tab=experts')
  }

  const clientIds = clients?.map(c => c.id) || []
  const { data: clientStates } =
    clientIds.length > 0 ? await q.getClientStatesByClientIds(supabase, clientIds) : { data: [] }

  const statesByClient: Record<string, string[]> = {}
  clientStates?.forEach(cs => {
    if (!statesByClient[cs.client_id]) {
      statesByClient[cs.client_id] = []
    }
    statesByClient[cs.client_id].push(cs.state)
  })

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const activeClients = clients?.filter(c => c.status === 'active').length || 0
  const inactiveClients = clients?.filter(c => c.status === 'inactive').length || 0
  const pendingClients = clients?.filter(c => c.status === 'pending').length || 0

  return (
      <div className="space-y-6">
        <Link
          href={`/pages/admin/users?tab=experts`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Expert Profile
        </Link>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Clients Assigned to {expert.first_name} {expert.last_name}
            </h1>
            <p className="text-sm text-gray-600">Manage all clients assigned to this expert</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{activeClients}</div>
                  <div className="text-sm text-gray-600">Active Clients</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{inactiveClients}</div>
                  <div className="text-sm text-gray-600">Inactive Clients</div>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">{pendingClients}</div>
                  <div className="text-sm text-gray-600">Pending Clients</div>
                </div>
              </div>
            </div>
          </div>

          {/* Clients List */}
          {clients && clients.length > 0 ? (
            <div className="space-y-4">
              {clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/pages/admin/clients/${client.id}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {getInitials(client.company_name)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{client.company_name}</h3>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            client.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : client.status === 'pending'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {client.status}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" />
                            <span>{client.contact_email}</span>
                          </div>
                          {client.contact_phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3 h-3" />
                              <span>{client.contact_phone}</span>
                            </div>
                          )}
                          {statesByClient[client.id] && statesByClient[client.id].length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap mt-2">
                              <MapPin className="w-3 h-3" />
                              {statesByClient[client.id].map(state => (
                                <span key={state} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                  {state}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No clients assigned to this expert</p>
            </div>
          )}
        </div>
      </div>
  )
}
