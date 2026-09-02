'use client'

import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import DownloadCSVButton from '@/components/DownloadCSVButton'

type StaffRosterRow = {
  staff_name: string
  email: string
  phone: string
  role: string
  job_title: string
  status: string
}

export default function StaffRosterReportClient({
  reportData,
}: {
  reportData: StaffRosterRow[]
}) {
  const [query, setQuery] = useState('')

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return reportData
    return reportData.filter((row) =>
      `${row.staff_name} ${row.email} ${row.phone} ${row.role} ${row.job_title} ${row.status}`
        .toLowerCase()
        .includes(q)
    )
  }, [reportData, query])

  const csvData = filteredData.map((row) => ({
    'Caregiver Name': row.staff_name,
    Email: row.email,
    Phone: row.phone,
    Role: row.role,
    'Job Title': row.job_title,
    Status: row.status,
  }))

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Staff Roster Report</h1>
          <p className="text-gray-600">Caregiver list with contact and role information</p>
        </div>
        <DownloadCSVButton
          data={csvData}
          filename="staff-roster-report"
          className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-brand-hover transition-colors flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </DownloadCSVButton>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search caregiver, email, phone, role, status"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900"
        />
      </div>

      {filteredData.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Caregiver Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Job Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.map((row, index) => (
                <tr key={`${row.staff_name}-${row.email}-${index}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.staff_name}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">{row.email}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.phone}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.role}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.job_title}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">No caregivers in your roster</p>
        </div>
      )}
    </div>
  )
}
