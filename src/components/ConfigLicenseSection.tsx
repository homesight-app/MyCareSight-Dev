'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Search, Check, X, Pencil } from 'lucide-react'
import { updateLicenseType } from '@/app/actions/configuration'

interface LicenseType {
  id: string
  name: string
  state: string
  renewal_period_display: string
  cost_display: string
  service_fee_display?: string
  processing_time_display: string
}

interface EditingLicenseType {
  id: string
  renewalPeriod: string
  applicationFee: string
  serviceFee: string
  processingTime: string
}

interface ConfigLicenseSectionProps {
  licenseTypes: LicenseType[]
}

export default function ConfigLicenseSection({ licenseTypes: initialLicenseTypes }: ConfigLicenseSectionProps) {
  const router = useRouter()
  const [licenseTypes, setLicenseTypes] = useState(initialLicenseTypes)
  const [searchQuery, setSearchQuery] = useState('')
  const [editing, setEditing] = useState<EditingLicenseType | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const getServiceFeeDisplay = (lt: LicenseType) => {
    if (lt.service_fee_display) return lt.service_fee_display
    const appFee = parseFloat((lt.cost_display ?? '').replace(/[^0-9.]/g, '')) || 0
    return `$${(appFee * 0.1).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const handleEdit = (lt: LicenseType) => {
    setEditing({
      id: lt.id,
      renewalPeriod: lt.renewal_period_display || '1 year',
      applicationFee: lt.cost_display || '$0',
      serviceFee: getServiceFeeDisplay(lt),
      processingTime: lt.processing_time_display || '0 days',
    })
  }

  const handleSave = async () => {
    if (!editing) return
    setIsSaving(true)
    try {
      const result = await updateLicenseType(editing)
      if (result.error) {
        alert(`Error: ${result.error}`)
      } else {
        setLicenseTypes(prev =>
          prev.map(lt =>
            lt.id === editing.id
              ? {
                  ...lt,
                  renewal_period_display: editing.renewalPeriod,
                  cost_display: editing.applicationFee,
                  service_fee_display: editing.serviceFee,
                  processing_time_display: editing.processingTime,
                }
              : lt
          )
        )
        setEditing(null)
        router.refresh()
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const filtered = licenseTypes.filter(lt => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return lt.name.toLowerCase().includes(q) || lt.state.toLowerCase().includes(q)
  })

  return (
    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">License Type Configuration</h2>
        </div>
        <p className="text-sm text-gray-600">Edit general information for all license types</p>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by license type or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">License Type</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">State</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Renewal Period</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Application Fee</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Service Fee</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Processing Time</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lt) => {
              const isEditing = editing?.id === lt.id
              return (
                <tr key={lt.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{lt.name}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{lt.state}</span>
                  </td>
                  {isEditing && editing ? (
                    <>
                      <td className="py-3 px-4">
                        <input type="text" value={editing.renewalPeriod} onChange={(e) => setEditing({ ...editing, renewalPeriod: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white" />
                      </td>
                      <td className="py-3 px-4">
                        <input type="text" value={editing.applicationFee} onChange={(e) => setEditing({ ...editing, applicationFee: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white" />
                      </td>
                      <td className="py-3 px-4">
                        <input type="text" value={editing.serviceFee} onChange={(e) => setEditing({ ...editing, serviceFee: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white" />
                      </td>
                      <td className="py-3 px-4">
                        <input type="text" value={editing.processingTime} onChange={(e) => setEditing({ ...editing, processingTime: e.target.value })} className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button onClick={handleSave} disabled={isSaving} className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditing(null)} disabled={isSaving} className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4 text-sm text-gray-700">{lt.renewal_period_display || 'N/A'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{lt.cost_display || '$0'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{getServiceFeeDisplay(lt)}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{lt.processing_time_display || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <button onClick={() => handleEdit(lt)} className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No license types found</p>
        </div>
      )}
    </div>
  )
}
