'use client'

import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { MapPin, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/PrimaryButton'
import Modal from '@/components/Modal'
import { updateCaregiverHomeAddressAction } from '@/app/actions/caregiver-profile'
import {
  caregiverHomeAddressSchema,
  type CaregiverHomeAddressInput,
} from '@/lib/schemas/caregiver-profile'

interface Caregiver {
  id: string
  first_name: string
  last_name: string
  address?: string | null
  state?: string | null
  zip_code?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  caregiver: Caregiver
  onSuccess?: () => void
}

const parseAddressParts = (address?: string | null) => {
  const parts = (address ?? '').split(',').map(part => part.trim()).filter(Boolean)
  return { streetAddress: parts[0] ?? '', city: parts.length >= 2 ? parts.slice(1).join(', ') : '' }
}

export default function EditCaregiverHomeAddressModal({ isOpen, onClose, caregiver, onSuccess }: Props) {
  const router = useRouter()
  const initial = useMemo(() => parseAddressParts(caregiver.address), [caregiver.address])
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<CaregiverHomeAddressInput>({
    resolver: zodResolver(caregiverHomeAddressSchema),
    mode: 'onBlur',
    defaultValues: {
      caregiverMemberId: caregiver.id,
      streetAddress: initial.streetAddress,
      city: initial.city,
      state: caregiver.state ?? '',
      zipCode: caregiver.zip_code ?? '',
    },
  })

  useEffect(() => {
    if (!isOpen) return
    const parts = parseAddressParts(caregiver.address)
    form.reset({
      caregiverMemberId: caregiver.id,
      streetAddress: parts.streetAddress,
      city: parts.city,
      state: caregiver.state ?? '',
      zipCode: caregiver.zip_code ?? '',
    })
    setServerError(null)
  }, [caregiver.address, caregiver.id, caregiver.state, caregiver.zip_code, form, isOpen])

  const submit = form.handleSubmit(async values => {
    setServerError(null)
    const result = await updateCaregiverHomeAddressAction(values)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field in values) form.setError(field as keyof CaregiverHomeAddressInput, { message: messages[0] })
      }
      setServerError(result.error ?? 'Unable to update home address.')
      return
    }
    router.refresh()
    onSuccess?.()
  })

  const field = (name: 'streetAddress' | 'city' | 'state' | 'zipCode', label: string, props?: { placeholder?: string; inputMode?: 'numeric' }) => (
    <label className="block text-sm font-semibold text-gray-700">
      {label}
      <input
        {...form.register(name)}
        {...props}
        className="mt-2 block w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-blue-500"
        disabled={form.formState.isSubmitting}
      />
      {form.formState.errors[name] ? <span className="mt-1 block text-xs font-normal text-red-600">{form.formState.errors[name]?.message}</span> : null}
    </label>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Home Address — ${caregiver.first_name} ${caregiver.last_name}`}
      subtitle="The caregiver's distance matching uses ZIP code coordinates. Exact addresses are displayed for reference only."
      size="lg"
      closeOnEscape={!form.formState.isSubmitting}
      closeOnBackdropClick={!form.formState.isSubmitting}
    >
      <form noValidate onSubmit={submit} className="space-y-5">
        {serverError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div> : null}
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-green-50 p-2"><MapPin className="h-5 w-5 text-green-600" /></div>
          <div><h2 className="text-lg font-bold text-gray-900">Update Address</h2><p className="mt-1 text-sm text-gray-500">Add or adjust city, state, and ZIP code.</p></div>
        </div>
        <div className="space-y-4">
          {field('streetAddress', 'Street Address')}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {field('city', 'City')}
            {field('state', 'State', { placeholder: 'TX' })}
          </div>
          {field('zipCode', 'ZIP Code', { inputMode: 'numeric' })}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button variant="primary" type="submit" loading={form.formState.isSubmitting} icon={Save}>Save Address</Button>
        </div>
      </form>
    </Modal>
  )
}
