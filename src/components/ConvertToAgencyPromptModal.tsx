'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2 } from 'lucide-react'
import { convertLeadToAgency } from '@/app/actions/leads'
import Button from '@/components/ui/PrimaryButton'

interface Props {
  open: boolean
  lead: { id: string; company_name?: string | null }
  onClose: () => void
}

export default function ConvertToAgencyPromptModal({ open, lead, onClose }: Props) {
  const router = useRouter()
  const [agencyName, setAgencyName] = useState(lead.company_name ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [convertedAgencyId, setConvertedAgencyId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAgencyName(lead.company_name ?? '')
      setError(null)
      setConvertedAgencyId(null)
    }
  }, [open, lead.id, lead.company_name])

  if (!open) return null

  const handleConvert = () => {
    setError(null)
    startTransition(async () => {
      const result = await convertLeadToAgency(lead.id, agencyName.trim() || undefined)
      if (result.error) { setError(result.error); return }
      setConvertedAgencyId(result.agencyId)
    })
  }

  if (convertedAgencyId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Agency Created</h3>
              <p className="text-sm text-gray-500">{agencyName} is ready for onboarding</p>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button variant="secondary" type="button" onClick={onClose} className="flex-1">
              Back to Leads
            </Button>
            <Button variant="primary" type="button" onClick={() => router.push(`/pages/admin/agencies/${convertedAgencyId}`)} className="flex-1">
              Go to Agency
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Convert to Agency?</h3>
            <p className="text-sm text-gray-500">Create an agency account for this signed lead</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agency Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={agencyName}
              onChange={e => setAgencyName(e.target.value)}
              placeholder="Enter agency name"
              disabled={isPending}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isPending} className="flex-1">
            Skip for Now
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleConvert}
            disabled={!agencyName.trim() || isPending}
            loading={isPending}
            className="flex-1"
          >
            {isPending ? 'Converting…' : 'Convert Now'}
          </Button>
        </div>
      </div>
    </div>
  )
}
