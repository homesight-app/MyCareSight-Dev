'use client'

import { useState } from 'react'
import { Settings, DollarSign, Edit, Check, X } from 'lucide-react'
import { updatePricing } from '@/app/actions/configuration'

interface Pricing {
  owner_admin_license: number
  staff_license: number
}

interface ConfigPricingSectionProps {
  initialPricing: Pricing
}

export default function ConfigPricingSection({ initialPricing }: ConfigPricingSectionProps) {
  const [pricing, setPricing] = useState(initialPricing)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({
    ownerAdminLicense: initialPricing.owner_admin_license,
    staffLicense: initialPricing.staff_license,
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleCancel = () => {
    setForm({ ownerAdminLicense: pricing.owner_admin_license, staffLicense: pricing.staff_license })
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updatePricing(form)
      if (result.error) {
        alert(`Error: ${result.error}`)
      } else {
        setPricing({ owner_admin_license: form.ownerAdminLicense, staff_license: form.staffLicense })
        setIsEditing(false)
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  return (
    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">User License Pricing</h2>
            <p className="text-sm text-gray-600">Set monthly subscription costs for different user types</p>
          </div>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={handleCancel} disabled={isSaving} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
            <button onClick={handleSave} disabled={isSaving} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
              <Check className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Owner/Admin License Cost (Monthly)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={form.ownerAdminLicense}
                onChange={(e) => setForm({ ...form, ownerAdminLicense: parseFloat(e.target.value) || 0 })}
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
                value={form.staffLicense}
                onChange={(e) => setForm({ ...form, staffLicense: parseFloat(e.target.value) || 0 })}
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
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{fmt(pricing.owner_admin_license)} per month</div>
              <p className="text-sm text-gray-600">Cost for business owners and administrators</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{fmt(pricing.staff_license)} per month</div>
              <p className="text-sm text-gray-600">Cost for staff and team members</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
