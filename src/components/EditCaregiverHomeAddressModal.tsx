'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapPin, Save } from 'lucide-react'
import Button from '@/components/ui/PrimaryButton'
import { createClient } from '@/lib/supabase/client'
import * as q from '@/lib/supabase/query'
import { useRouter } from 'next/navigation'
import ModalWrapper from './Modal'

interface Caregiver {
  id: string
  first_name: string
  last_name: string
  address?: string | null
  state?: string | null
  zip_code?: string | null
}

interface EditCaregiverHomeAddressModalProps {
  isOpen: boolean
  onClose: () => void
  caregiver: Caregiver
  onSuccess?: () => void
}

const parseAddressParts = (address?: string | null) => {
  const parts = (address ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  const street = parts[0] ?? ''
  const city = parts.length >= 2 ? parts.slice(1).join(', ') : ''
  return { street, city }
}

export default function EditCaregiverHomeAddressModal({
  isOpen,
  onClose,
  caregiver,
  onSuccess,
}: EditCaregiverHomeAddressModalProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initial = useMemo(() => parseAddressParts(caregiver.address), [caregiver.address])

  const [streetAddress, setStreetAddress] = useState(initial.street)
  const [city, setCity] = useState(initial.city)
  const [state, setStateValue] = useState(caregiver.state ?? '')
  const [zipCode, setZipCode] = useState(caregiver.zip_code ?? '')

  useEffect(() => {
    if (!isOpen) return
    const parts = parseAddressParts(caregiver.address)
    setStreetAddress(parts.street)
    setCity(parts.city)
    setStateValue(caregiver.state ?? '')
    setZipCode(caregiver.zip_code ?? '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caregiver.id])

  const handleClose = () => {
    if (!isSaving) onClose()
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const newAddress = [streetAddress.trim(), city.trim()].filter(Boolean).join(', ')

      const supabase = createClient()
      const { error: updateError } = await q.updateStaffMember(supabase, caregiver.id, {
        address: newAddress,
        state: state || null,
        zip_code: zipCode || null,
      })

      if (updateError) throw updateError

      router.refresh()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setError(err?.message || 'Failed to update home address.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={handleClose}
      title={`Home Address \u2014 ${caregiver.first_name} ${caregiver.last_name}`}
      subtitle="The caregiver's distance matching uses zip code coordinates. Exact addresses are displayed for reference only."
      size="lg"
    >
      <div className="space-y-5">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        ) : null}

        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-50 rounded-lg shrink-0">
            <MapPin className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Update Address</h2>
            <p className="text-sm text-gray-500 mt-1">Add or adjust city, state, and zip code.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Street Address</label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isSaving}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setStateValue(e.target.value)}
                placeholder="TX"
                className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">ZIP Code</label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              inputMode="numeric"
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" type="button" onClick={handleSave} disabled={isSaving} loading={isSaving} icon={Save}>
            Save Address
          </Button>
        </div>
      </div>
    </ModalWrapper>
  )
}

