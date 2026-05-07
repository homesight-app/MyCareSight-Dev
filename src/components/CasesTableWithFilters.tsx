'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download } from 'lucide-react'

interface Case {
  id: string
  case_id: string
  business_name: string
  owner_name?: string
  state: string
  status: string
  progress_percentage?: number
  documents_count?: number
  steps_count?: number
  last_activity?: string | Date | null
}

interface CasesTableWithFiltersProps {
  cases: Case[]
}

export default function CasesTableWithFilters({ cases }: CasesTableWithFiltersProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('All Statuses')
  const [selectedState, setSelectedState] = useState('All States')

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return 'N/A'
    const d = typeof date === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00') : new Date(date)) : date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Get all unique states from cases
  const allStates = useMemo(() => {
    const statesSet = new Set<string>()
    cases.forEach(c => {
      if (c.state) statesSet.add(c.state)
    })
    return Array.from(statesSet).sort()
  }, [cases])

  // Filter cases based on search and filters
  const filteredCases = useMemo(() => {
    return cases.filter(caseItem => {
      // Search filter (case ID, business name, owner)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          caseItem.case_id?.toLowerCase().includes(query) ||
          caseItem.business_name?.toLowerCase().includes(query) ||
          caseItem.owner_name?.toLowerCase().includes(query)

        if (!matchesSearch) return false
      }

      // Status filter
      if (selectedStatus !== 'All Statuses') {
        const statusMap: Record<string, string> = {
          'In Progress': 'in_progress',
          'Under Review': 'under_review',
          'Approved': 'approved',
          'Rejected': 'rejected'
        }
        const mappedStatus = statusMap[selectedStatus]
        if (caseItem.status !== mappedStatus) return false
      }

      // State filter
      if (selectedState !== 'All States') {
        if (caseItem.state !== selectedState) return false
      }

      return true
    })
  }, [cases, searchQuery, selectedStatus, selectedState])

  const handleRowClick = (caseId: string) => {
    router.push(`/pages/admin/licenses/applications/${caseId}`)
  }

  const handleViewClick = (e: React.MouseEvent, caseId: string) => {
    e.stopPropagation()
    router.push(`/pages/admin/licenses/applications/${caseId}`)
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-gray-200">
        <div className="flex flex-col gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
            <input
              type="text"
              placeholder="Search by case ID, business name, or owner..."
              className="w-full pl-9 md:pl-10 pr-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 min-w-[120px] px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            >
              <option>All Statuses</option>
              <option>In Progress</option>
              <option>Under Review</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="flex-1 min-w-[120px] px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            >
              <option>All States</option>
              {allStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            <button className="flex items-center gap-2 px-3 md:px-4 py-2 text-sm md:text-base bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Case ID</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Business Name</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">Owner</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">State</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">Progress</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Documents</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell">Steps</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden xl:table-cell">Last Activity</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCases && filteredCases.length > 0 ? (
              filteredCases.map((caseItem) => (
                <tr
                  key={caseItem.id}
                  onClick={() => handleRowClick(caseItem.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">{caseItem.case_id}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-900">{caseItem.business_name}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden sm:table-cell">{caseItem.owner_name}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600">{caseItem.state}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      caseItem.status === 'approved' ? 'bg-green-100 text-green-800' :
                      caseItem.status === 'under_review' ? 'bg-yellow-100 text-yellow-800' :
                      caseItem.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {caseItem.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                    <div className="w-20 md:w-24 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${caseItem.progress_percentage || 0}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600 mt-1 block">{caseItem.progress_percentage || 0}%</span>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden lg:table-cell">{caseItem.documents_count || 0}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden lg:table-cell">{caseItem.steps_count || 0}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-600 hidden xl:table-cell">{formatDate(caseItem.last_activity)}</td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs md:text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleViewClick(e, caseItem.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                  No cases found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
