'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, KeyRound, Link2, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/ui/PrimaryButton'
import {
  createLeadIntegrationCredentialAction,
  revokeLeadIntegrationCredentialAction,
} from '@/app/actions/lead-integrations'
import {
  createLeadIntegrationCredentialSchema,
  type CreateLeadIntegrationCredentialInput,
} from '@/lib/schemas/lead-integration'
import type { LeadIntegrationCredentialSummary } from '@/types/lead-integrations'

export default function AgencyLeadIntegrationPanel({
  agencyId,
  initialCredentials,
}: {
  agencyId: string
  initialCredentials: LeadIntegrationCredentialSummary[]
}) {
  const [credentials, setCredentials] = useState(initialCredentials)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const form = useForm<CreateLeadIntegrationCredentialInput>({
    resolver: zodResolver(createLeadIntegrationCredentialSchema),
    mode: 'onBlur',
    defaultValues: { agencyId, name: 'Client website' },
  })

  const createCredential = form.handleSubmit(async values => {
    const result = await createLeadIntegrationCredentialAction(values)
    if (!result.success) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'name' || field === 'agencyId') {
          form.setError(field, { message: messages[0] })
        }
      }
      if (!result.fieldErrors) toast.error(result.error ?? 'Unable to create credential')
      return
    }
    if (!result.apiKey || !result.credential) {
      toast.error('The credential was created without a usable key.')
      return
    }
    setCredentials(current => [result.credential!, ...current])
    setNewApiKey(result.apiKey)
    form.reset({ agencyId, name: 'Client website' })
    toast.success('Website credential created')
  })

  const revokeCredential = async (credential: LeadIntegrationCredentialSummary) => {
    if (!window.confirm(`Revoke “${credential.name}”? The website will stop submitting leads immediately.`)) return
    setRevokingId(credential.id)
    const result = await revokeLeadIntegrationCredentialAction({
      agencyId,
      credentialId: credential.id,
    })
    setRevokingId(null)
    if (!result.success) {
      toast.error(result.error ?? 'Unable to revoke credential')
      return
    }
    const revokedAt = new Date().toISOString()
    setCredentials(current => current.map(item =>
      item.id === credential.id ? { ...item, status: 'revoked', revokedAt } : item
    ))
    toast.success('Website credential revoked')
  }

  const copyApiKey = async () => {
    if (!newApiKey) return
    try {
      await navigator.clipboard.writeText(newApiKey)
      toast.success('API key copied')
    } catch {
      toast.error('Copy failed. Select and copy the key manually.')
    }
  }

  return (
    <section className="border-t border-gray-200 pt-6 mt-8">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-5 h-5 text-slate-600" />
        <h4 className="text-sm font-semibold text-gray-900">Website Lead Integration</h4>
      </div>
      <p className="text-sm text-gray-600 mb-5 max-w-2xl">
        Create a server-side credential for this agency&apos;s website. Submitted contacts enter the agency lead pipeline with Website as the source.
      </p>

      {newApiKey && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 max-w-2xl">
          <p className="text-sm font-semibold text-amber-900">Copy this API key now</p>
          <p className="text-xs text-amber-800 mt-1 mb-3">It is shown once and cannot be retrieved later.</p>
          <div className="flex items-start gap-2">
            <code className="flex-1 break-all rounded bg-white border border-amber-200 p-3 text-xs text-gray-900 select-all">
              {newApiKey}
            </code>
            <Button type="button" variant="secondary" size="sm" icon={Copy} onClick={copyApiKey}>
              Copy
            </Button>
          </div>
          <button type="button" className="mt-3 text-xs text-amber-900 underline" onClick={() => setNewApiKey(null)}>
            I stored the key securely
          </button>
        </div>
      )}

      <form onSubmit={createCredential} noValidate className="flex flex-col sm:flex-row sm:items-start gap-3 max-w-2xl mb-6">
        <input type="hidden" {...form.register('agencyId')} />
        <div className="flex-1">
          <label htmlFor="integration-name" className="block text-xs font-medium text-gray-700 mb-1">
            Credential name <span className="text-red-600">*</span>
          </label>
          <input
            id="integration-name"
            {...form.register('name')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={KeyRound}
          loading={form.formState.isSubmitting}
          className="sm:mt-6 whitespace-nowrap"
        >
          Create API Key
        </Button>
      </form>

      <div className="space-y-2 max-w-2xl">
        {credentials.length === 0 ? (
          <p className="text-sm text-gray-500">No website credentials have been created.</p>
        ) : credentials.map(credential => (
          <div key={credential.id} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{credential.name}</p>
                <span className={`text-xs rounded-full px-2 py-0.5 ${credential.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {credential.status === 'active' ? 'Active' : 'Revoked'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Key mcs_web_{credential.keyPrefix}_… · Created {new Date(credential.createdAt).toLocaleDateString()}
                {credential.lastUsedAt ? ` · Last used ${new Date(credential.lastUsedAt).toLocaleString()}` : ' · Never used'}
              </p>
            </div>
            {credential.status === 'active' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={ShieldX}
                loading={revokingId === credential.id}
                onClick={() => revokeCredential(credential)}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
