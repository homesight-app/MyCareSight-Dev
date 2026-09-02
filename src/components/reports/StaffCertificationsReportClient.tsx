'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Download, Search, XCircle } from 'lucide-react'
import DownloadCSVButton from '@/components/DownloadCSVButton'
import DownloadCertificationButton from '@/components/DownloadCertificationButton'

type CertificationRow = {
  staff_name: string
  contact: string
  certification: string
  cert_number: string
  state: string
  issuing_authority: string
  issue_date: string
  expiration: string
  status: string
  document_url: string | null
}

export default function StaffCertificationsReportClient({
  reportData,
}: {
  reportData: CertificationRow[]
}) {
  const [query, setQuery] = useState('')

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return reportData
    return reportData.filter((row) =>
      `${row.staff_name} ${row.contact} ${row.certification} ${row.status}`.toLowerCase().includes(q)
    )
  }, [reportData, query])

  const totalCertifications = filteredData.length
  const activeCount = filteredData.filter((r) => r.status === 'Active').length
  const expiringOrExpiredCount = filteredData.filter((r) => r.status === 'Expiring Soon' || r.status === 'Expired').length

  const csvData = filteredData.map((row) => ({
    'Staff Name': row.staff_name,
    Contact: row.contact,
    Certification: row.certification,
    'Cert Number': row.cert_number,
    State: row.state,
    'Issuing Authority': row.issuing_authority,
    'Issue Date': row.issue_date,
    Expiration: row.expiration,
    Status: row.status,
  }))

  const getStatusBadge = (status: string) => {
    if (status === 'Active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <CheckCircle2 className="w-3 h-3" />
          Active
        </span>
      )
    }
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Staff Certifications Report</h1>
          <p className="text-gray-600">Complete listing of all staff certifications with status and expiration dates</p>
        </div>
        <DownloadCSVButton
          data={csvData}
          filename="staff-certifications-report"
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
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Staff Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Certification</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Cert Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Issuing Authority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Issue Date</th>
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
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.state}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{row.issuing_authority}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">{row.issue_date}</td>
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

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Certifications</p>
                <p className="text-2xl font-bold text-gray-900">{totalCertifications}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Active</p>
                <p className="text-2xl font-bold text-green-600">{activeCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Expiring/Expired</p>
                <p className="text-2xl font-bold text-red-600">{expiringOrExpiredCount}</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">No certification data found</p>
        </div>
      )}
    </div>
  )
}
