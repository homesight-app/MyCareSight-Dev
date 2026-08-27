'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, FileText, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { type CertLicense } from './CertificationDetailModal'
import CertificationDetailModal from './CertificationDetailModal'
import TablePagination from '@/components/ui/TablePagination'
import { formatDateShort } from '@/lib/format-date'

const CERT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'all',           label: 'All' },
  { value: 'state_license', label: 'State License' },
  { value: 'medicare',      label: 'Medicare' },
  { value: 'medicaid',      label: 'Medicaid' },
  { value: 'accreditation', label: 'Accreditation' },
  { value: 'bond',          label: 'Bond' },
  { value: 'insurance',     label: 'Insurance' },
  { value: 'other',         label: 'Other' },
]

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  expired:  'bg-red-100 text-red-700',
  expiring: 'bg-orange-100 text-orange-700',
  pending:  'bg-yellow-100 text-yellow-700',
}

function isExpiringSoon(expiryDate?: string | null) {
  if (!expiryDate) return false
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return days >= 0 && days <= 90
}

type SortKey = 'name' | 'state' | 'number' | 'activated' | 'expires' | 'status'

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-40" />
  return dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
}

interface AgencyCertificationsContentProps {
  certifications: CertLicense[]
  agencyId: string
}

export default function AgencyCertificationsContent({ certifications, agencyId }: AgencyCertificationsContentProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => { setPage(0) }, [search, statusFilter, catFilter, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase()
    return certifications
      .filter(l => {
        if (statusFilter === 'active'   && !(l.status === 'active' && !isExpiringSoon(l.expiry_date))) return false
        if (statusFilter === 'expiring' && !(l.status === 'active' && isExpiringSoon(l.expiry_date)))  return false
        if (statusFilter === 'expired'  && l.status !== 'expired') return false
        if (catFilter !== 'all' && (l.certification_category ?? 'state_license') !== catFilter) return false
        if (term && !l.license_name.toLowerCase().includes(term) &&
            !(l.license_number ?? '').toLowerCase().includes(term) &&
            !(l.state ?? '').toLowerCase().includes(term)) return false
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortKey === 'name')      cmp = a.license_name.localeCompare(b.license_name)
        if (sortKey === 'state')     cmp = (a.state ?? '').localeCompare(b.state ?? '')
        if (sortKey === 'number')    cmp = (a.license_number ?? '').localeCompare(b.license_number ?? '')
        if (sortKey === 'activated') cmp = (a.activated_date ?? '').localeCompare(b.activated_date ?? '')
        if (sortKey === 'expires')   cmp = (a.expiry_date ?? '').localeCompare(b.expiry_date ?? '')
        if (sortKey === 'status')    cmp = a.status.localeCompare(b.status)
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [certifications, statusFilter, search, catFilter, sortKey, sortDir])

  const pagedDisplayed = useMemo(
    () => displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [displayed, page]
  )

  const selectedCert = selectedCertId ? certifications.find(l => l.id === selectedCertId) ?? null : null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certifications</h1>
        <p className="text-sm text-gray-500 mt-1">View and manage your agency&apos;s certifications and license documents.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="text-base font-semibold text-gray-900">All Certifications</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {certifications.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-44"
              />
            </div>
            <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
              {([
                { value: 'all',      label: 'All' },
                { value: 'active',   label: 'Active' },
                { value: 'expiring', label: 'Expiring' },
                { value: 'expired',  label: 'Expired' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    statusFilter === value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
          {CERT_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCatFilter(cat.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                catFilter === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {certifications.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No certifications on file yet. Your expert will add certifications as they are obtained.
          </div>
        ) : displayed.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No certifications match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {([
                    ['name',      'Certification'],
                    ['state',     'State'],
                    ['number',    'Cert #'],
                    ['activated', 'Issued'],
                    ['expires',   'Expires'],
                    ['status',    'Status'],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                    >
                      <span className="inline-flex items-center gap-1">
                        {label} <SortIcon active={sortKey === key} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedDisplayed.map(cert => (
                  <tr
                    key={cert.id}
                    onClick={() => setSelectedCertId(cert.id)}
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {cert.license_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {cert.state ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {cert.state}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Federal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {cert.license_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDateShort(cert.activated_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDateShort(cert.expiry_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[cert.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {isExpiringSoon(cert.expiry_date) && cert.status === 'active'
                          ? 'Expiring Soon'
                          : cert.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {displayed.length > 0 && (
          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={displayed.length}
            onPageChange={setPage}
            entityLabel="certifications"
          />
        )}
      </div>

      {selectedCert && (
        <CertificationDetailModal
          license={selectedCert}
          agencyId={agencyId}
          backPath="/pages/agency/certifications"
          canEdit={true}
          onClose={() => setSelectedCertId(null)}
        />
      )}
    </div>
  )
}
