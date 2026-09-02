'use client'

import { useMemo, useState } from 'react'
import { Clock, Download, Search, XCircle } from 'lucide-react'
import DownloadCSVButton from '@/components/DownloadCSVButton'
import DownloadCertificationButton from '@/components/DownloadCertificationButton'

type ExpiringCertificationRow = {
  staff_name: string
  contact: string
  certification: string
  cert_number: string
  expiration: string
  status: string
  document_url: string | null
}

export default function ExpiringCertificationsReportClient({
  reportData,
}: {
  reportData: ExpiringCertificationRow[]
}) {
  const [query, setQuery] = useState('')

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return reportData
    return reportData.filter((row) =>
      `${row.staff_name} ${row.contact} ${row.certification} ${row.status}`.toLowerCase().includes(q)
    )
  }, [reportData, query])

  const csvData = filteredData.map((row) => ({
    'Staff Name': row.staff_name,
    Contact: row.contact,
    Certification: row.certification,
    'Cert Number': row.cert_number,
    Expiration: row.expiration,
    Status: row.status,
  }))

  const getStatusBadge = (status: string) => {
    if (status === 'Expiring Soon') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
          <Clock className="w-3 h-3" />
          Expiring Soon
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" />
        Expired
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Expiring Certifications Report</h1>
          <p className="text-gray-600">Staff certifications that are expiring soon or have expired</p>
        </div>
        <DownloadCSVButton
          data={csvData}
          filename="expiring-certifications-report"
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
          placeholder="Search staff, contact, certification, status"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900"
        />
      </div>

      {filteredData.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Staff Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Certification</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Cert Number</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.map((row, index) => (
                <tr key={`${row.staff_name}-${row.certification}-${index}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.staff_name}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">{row.contact}</td>
                  <td className="px-4 py-4 text-sm text-gray-900">{row.certification}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.cert_number}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.expiration}</td>
                  <td className="px-4 py-4 whitespace-nowrap">{getStatusBadge(row.status)}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <DownloadCertificationButton
                      documentUrl={row.document_url}
                      certificationName={row.certification}
                      staffName={row.staff_name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">No expiring certifications found</p>
        </div>
      )}
    </div>
  )
}
