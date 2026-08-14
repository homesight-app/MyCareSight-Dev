'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, DollarSign, Search, Edit, Check, X, Pencil } from 'lucide-react'
import { updatePricing, updateLicenseType } from '@/app/actions/configuration'
import SystemListsManagement from '@/components/SystemListsManagement'
import PlaybookCategoriesSection from '@/components/PlaybookCategoriesSection'

interface Pricing {
  owner_admin_license: number
  staff_license: number
}

interface LicenseType {
  id: string
  name: string
  state: string
  renewal_period_display: string
  cost_display: string
  service_fee_display?: string
  processing_time_display: string
}

interface CertificationType {
  id: number
  certification_type: string
  created_at?: string
}


interface StaffRole {
  id: number
  name: string
  created_at?: string
}

interface TaskCatalogItem {
  id: string
  name: string
  categoryId: string
  categoryName: string
}

interface TaskCategoryItem {
  id: string
  name: string
}

interface PlaybookCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  subcategories: { id: string; category_id: string; name: string; description: string | null; is_active: boolean; sort_order: number }[]
}

interface ConfigurationContentProps {
  initialPricing: Pricing
  licenseTypes: LicenseType[]
  certificationTypes: CertificationType[]
  staffRoles: StaffRole[]
  skilledTasks: TaskCatalogItem[]
  nonSkilledTasks: TaskCatalogItem[]
  skilledTaskCategories: TaskCategoryItem[]
  nonSkilledTaskCategories: TaskCategoryItem[]
  playbookCategories: PlaybookCategory[]
}

interface EditingLicenseType {
  id: string
  renewalPeriod: string
  applicationFee: string
  serviceFee: string
  processingTime: string
}

export default function ConfigurationContent({
  initialPricing,
  licenseTypes: initialLicenseTypes,
  certificationTypes,
  staffRoles,
  skilledTasks,
  nonSkilledTasks,
  skilledTaskCategories,
  nonSkilledTaskCategories,
  playbookCategories,
}: ConfigurationContentProps) {
  const router = useRouter()
  const [pricing, setPricing] = useState(initialPricing)
  const [licenseTypes, setLicenseTypes] = useState(initialLicenseTypes)
  const [isEditingPricing, setIsEditingPricing] = useState(false)
  const [pricingForm, setPricingForm] = useState({
    ownerAdminLicense: initialPricing.owner_admin_license,
    staffLicense: initialPricing.staff_license
  })
  const [isSavingPricing, setIsSavingPricing] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [editingLicenseType, setEditingLicenseType] = useState<EditingLicenseType | null>(null)
  const [isSavingLicenseType, setIsSavingLicenseType] = useState(false)

  // Get service fee from license type
  const getServiceFee = (licenseType: LicenseType) => {
    if (licenseType.service_fee_display) {
      const feeMatch = licenseType.service_fee_display.replace(/[^0-9.]/g, '')
      return feeMatch ? parseFloat(feeMatch) : 0
    }
    // Fallback: calculate as 10% of application fee if not set
    const appFeeMatch = licenseType.cost_display?.replace(/[^0-9.]/g, '') || '0'
    const appFee = parseFloat(appFeeMatch)
    return appFee * 0.1
  }

  const getServiceFeeDisplay = (licenseType: LicenseType) => {
    if (licenseType.service_fee_display) {
      return licenseType.service_fee_display
    }
    const serviceFee = getServiceFee(licenseType)
    return `$${serviceFee.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const handleEditPricing = () => {
    setIsEditingPricing(true)
  }

  const handleCancelPricing = () => {
    setPricingForm({
      ownerAdminLicense: pricing.owner_admin_license,
      staffLicense: pricing.staff_license
    })
    setIsEditingPricing(false)
  }

  const handleSavePricing = async () => {
    setIsSavingPricing(true)
    try {
      const result = await updatePricing(pricingForm)
      if (result.error) {
        alert(`Error: ${result.error}`)
      } else {
        setPricing({
          owner_admin_license: pricingForm.ownerAdminLicense,
          staff_license: pricingForm.staffLicense
        })
        setIsEditingPricing(false)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setIsSavingPricing(false)
    }
  }

  const handleEditLicenseType = (licenseType: LicenseType) => {
    setEditingLicenseType({
      id: licenseType.id,
      renewalPeriod: licenseType.renewal_period_display || '1 year',
      applicationFee: licenseType.cost_display || '$0',
      serviceFee: getServiceFeeDisplay(licenseType),
      processingTime: licenseType.processing_time_display || '0 days'
    })
  }

  const handleCancelLicenseType = () => {
    setEditingLicenseType(null)
  }

  const handleSaveLicenseType = async () => {
    if (!editingLicenseType) return

    setIsSavingLicenseType(true)
    try {
      const result = await updateLicenseType(editingLicenseType)
      if (result.error) {
        alert(`Error: ${result.error}`)
      } else {
        // Update the license type in the local state
        setLicenseTypes(prevTypes => 
          prevTypes.map(lt => 
            lt.id === editingLicenseType.id 
              ? {
                  ...lt,
                  renewal_period_display: editingLicenseType.renewalPeriod,
                  cost_display: editingLicenseType.applicationFee,
                  service_fee_display: editingLicenseType.serviceFee,
                  processing_time_display: editingLicenseType.processingTime
                }
              : lt
          )
        )
        setEditingLicenseType(null)
        // Refresh server data
        router.refresh()
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setIsSavingLicenseType(false)
    }
  }

  const filteredLicenseTypes = licenseTypes.filter(lt => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      lt.name.toLowerCase().includes(query) ||
      lt.state.toLowerCase().includes(query)
    )
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          
          <h1 className="text-2xl font-bold text-gray-900"></h1>
        </div>
        
      </div>

      {/* User License Pricing Section */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-green-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">User License Pricing</h2>
              <p className="text-sm text-gray-600">Set monthly subscription costs for different user types</p>
            </div>
          </div>
          {!isEditingPricing ? (
            <button
              onClick={handleEditPricing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelPricing}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSavingPricing}
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleSavePricing}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                disabled={isSavingPricing}
              >
                <Check className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {isEditingPricing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Owner/Admin License Cost (Monthly)</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={pricingForm.ownerAdminLicense}
                  onChange={(e) => setPricingForm({
                    ...pricingForm,
                    ownerAdminLicense: parseFloat(e.target.value) || 0
                  })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
                <span className="text-gray-500">per month</span>
              </div>
              <p className="text-xs text-gray-500">Cost for business owners and administrators</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Staff License Cost (Monthly)</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={pricingForm.staffLicense}
                  onChange={(e) => setPricingForm({
                    ...pricingForm,
                    staffLicense: parseFloat(e.target.value) || 0
                  })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
                <span className="text-gray-500">per month</span>
              </div>
              <p className="text-xs text-gray-500">Cost for staff and team members</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(pricing.owner_admin_license)} per month
                </div>
                <p className="text-sm text-gray-600">Cost for business owners and administrators</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(pricing.staff_license)} per month
                </div>
                <p className="text-sm text-gray-600">Cost for staff and team members</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* License Type Configuration Section */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">License Type Configuration</h2>
          </div>
          <p className="text-sm text-gray-600">Edit general information for all license types</p>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by license type or state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white"
            />
          </div>
        </div>

        {/* License Types Table */}
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
              {filteredLicenseTypes.map((licenseType) => {
                const isEditing = editingLicenseType?.id === licenseType.id
                const serviceFeeDisplay = getServiceFeeDisplay(licenseType)

                return (
                  <tr key={licenseType.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{licenseType.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                        {licenseType.state}
                      </span>
                    </td>
                    {isEditing ? (
                      <>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={editingLicenseType.renewalPeriod}
                            onChange={(e) => setEditingLicenseType({
                              ...editingLicenseType,
                              renewalPeriod: e.target.value
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={editingLicenseType.applicationFee}
                            onChange={(e) => setEditingLicenseType({
                              ...editingLicenseType,
                              applicationFee: e.target.value
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={editingLicenseType.serviceFee}
                            onChange={(e) => setEditingLicenseType({
                              ...editingLicenseType,
                              serviceFee: e.target.value
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={editingLicenseType.processingTime}
                            onChange={(e) => setEditingLicenseType({
                              ...editingLicenseType,
                              processingTime: e.target.value
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSaveLicenseType}
                              disabled={isSavingLicenseType}
                              className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelLicenseType}
                              disabled={isSavingLicenseType}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-sm text-gray-700">{licenseType.renewal_period_display || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{licenseType.cost_display || '$0'}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{serviceFeeDisplay}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{licenseType.processing_time_display || 'N/A'}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleEditLicenseType(licenseType)}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          >
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

        {filteredLicenseTypes.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No license types found</p>
          </div>
        )}
      </div>

      {/* System Lists Management Section */}
      <SystemListsManagement
        initialCertificationTypes={certificationTypes}
        initialStaffRoles={staffRoles}
        initialSkilledTasks={skilledTasks}
        initialNonSkilledTasks={nonSkilledTasks}
        initialSkilledTaskCategories={skilledTaskCategories}
        initialNonSkilledTaskCategories={nonSkilledTaskCategories}
      />

      {/* Playbook Categories Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Playbook Categories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Categories and subcategories used to classify playbooks, programs, and certifications.
          </p>
        </div>
        <PlaybookCategoriesSection initialCategories={playbookCategories} />
      </div>
    </div>
  )
}
