'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save } from 'lucide-react'
import Modal from './Modal'
import Button from '@/components/ui/PrimaryButton'
import {
  insertCaregiverLicenseApplicationAction,
  updateCaregiverLicenseAction,
} from '@/app/actions/caregiver-licenses'
import {
  caregiverCredentialInputSchema,
  type CaregiverCredentialInput,
} from '@/lib/schemas/caregiver-credential'

export interface CaregiverLicenseRow {
  id: string
  license_type: string
  license_number: string
  state?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  issuing_authority?: string | null
  status: string
  document_url?: string | null
  days_until_expiry?: number | null
}

interface AddCaregiverLicenseModalProps {
  isOpen: boolean
  onClose: () => void
  staffId: string
  staffName: string
  credential?: CaregiverLicenseRow | null
  onSuccess?: () => void
}

const defaults = (staffId: string, credential?: CaregiverLicenseRow | null): CaregiverCredentialInput => ({
  staffMemberId: staffId,
  ...(credential ? { credentialId: credential.id } : {}),
  licenseType: credential?.license_type ?? '',
  licenseNumber: credential?.license_number ?? '',
  state: credential?.state ?? '',
  issueDate: credential?.issue_date ?? '',
  expiryDate: credential?.expiry_date ?? '',
  issuingAuthority: credential?.issuing_authority ?? '',
})

export default function AddCaregiverLicenseModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  credential,
  onSuccess,
}: AddCaregiverLicenseModalProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const editing = Boolean(credential)
  const form = useForm<CaregiverCredentialInput>({
    resolver: zodResolver(caregiverCredentialInputSchema),
    mode: 'onBlur',
    defaultValues: defaults(staffId, credential),
  })

  useEffect(() => {
    if (isOpen) form.reset(defaults(staffId, credential))
  }, [credential, form, isOpen, staffId])

  const onSubmit = form.handleSubmit(async values => {
    setFormError(null)
    const result = editing
      ? await updateCaregiverLicenseAction(values)
      : await insertCaregiverLicenseApplicationAction(values)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    router.refresh()
    onSuccess?.()
    onClose()
  })

  const handleClose = () => {
    if (!form.formState.isSubmitting) {
      setFormError(null)
      form.reset(defaults(staffId, credential))
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${editing ? 'Edit' : 'Add'} Certification - ${staffName}`}
      size="lg"
      overlayClassName="z-[100]"
      lockBodyScroll={false}
      closeOnEscape={!form.formState.isSubmitting}
    >
      <form noValidate className="space-y-4" onSubmit={onSubmit}>
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
        ) : null}

        <div>
          <label htmlFor="credential-type" className="mb-2 block text-sm font-semibold text-gray-700">
            Certification Type <span className="text-red-500">*</span>
          </label>
          <input id="credential-type" {...form.register('licenseType')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          {form.formState.errors.licenseType ? <p className="mt-1 text-sm text-red-600">{form.formState.errors.licenseType.message}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="credential-number" className="mb-2 block text-sm font-semibold text-gray-700">
              Certification Number <span className="text-red-500">*</span>
            </label>
            <input id="credential-number" {...form.register('licenseNumber')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
            {form.formState.errors.licenseNumber ? <p className="mt-1 text-sm text-red-600">{form.formState.errors.licenseNumber.message}</p> : null}
          </div>
          <div>
            <label htmlFor="credential-state" className="mb-2 block text-sm font-semibold text-gray-700">State</label>
            <input id="credential-state" {...form.register('state')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </div>
        </div>

        <div>
          <label htmlFor="credential-authority" className="mb-2 block text-sm font-semibold text-gray-700">Issuing Authority</label>
          <input id="credential-authority" {...form.register('issuingAuthority')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="credential-issued" className="mb-2 block text-sm font-semibold text-gray-700">Issue Date</label>
            <input id="credential-issued" type="date" {...form.register('issueDate')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </div>
          <div>
            <label htmlFor="credential-expires" className="mb-2 block text-sm font-semibold text-gray-700">Expiration Date</label>
            <input id="credential-expires" type="date" {...form.register('expiryDate')} className="block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            icon={form.formState.isSubmitting ? Loader2 : editing ? Save : Plus}
            loading={form.formState.isSubmitting}
          >
            {editing ? 'Save Certification' : 'Add Certification'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
