'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import {
  createLeadIntegrationCredential,
  revokeLeadIntegrationCredential,
} from '@/lib/repositories/lead-integrations'
import {
  createLeadIntegrationCredentialSchema,
  revokeLeadIntegrationCredentialSchema,
} from '@/lib/schemas/lead-integration'
import { zodErrorToFieldErrors } from '@/lib/validation'
import type { LeadIntegrationCredentialSummary } from '@/types/lead-integrations'
import { websiteLeadIntegrationEnabled } from '@/lib/features/website-lead-integration'

type CreateCredentialResult = {
  success: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  apiKey?: string
  credential?: LeadIntegrationCredentialSummary
}

async function requireAdmin() {
  const session = await getSession()
  if (!session) return null
  return session.profile?.role === 'admin' ? session : null
}

export async function createLeadIntegrationCredentialAction(
  input: unknown
): Promise<CreateCredentialResult> {
  if (!websiteLeadIntegrationEnabled()) {
    return { success: false, error: 'Website lead integration is not enabled.' }
  }
  const session = await requireAdmin()
  if (!session) return { success: false, error: 'Forbidden' }

  const parsed = createLeadIntegrationCredentialSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, fieldErrors: zodErrorToFieldErrors(parsed.error) }
  }

  try {
    const result = await createLeadIntegrationCredential({
      agencyId: parsed.data.agencyId,
      name: parsed.data.name,
      createdBy: session.user.id,
    })
    revalidatePath(`/pages/admin/agencies/${parsed.data.agencyId}`)
    return { success: true, ...result }
  } catch {
    console.error('[lead-integrations] Credential creation failed')
    return { success: false, error: 'Unable to create the website credential.' }
  }
}

export async function revokeLeadIntegrationCredentialAction(
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  if (!websiteLeadIntegrationEnabled()) {
    return { success: false, error: 'Website lead integration is not enabled.' }
  }
  const session = await requireAdmin()
  if (!session) return { success: false, error: 'Forbidden' }

  const parsed = revokeLeadIntegrationCredentialSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid request.' }

  try {
    const revoked = await revokeLeadIntegrationCredential({
      agencyId: parsed.data.agencyId,
      credentialId: parsed.data.credentialId,
      revokedBy: session.user.id,
    })
    if (!revoked) return { success: false, error: 'Credential was not found or is already revoked.' }
    revalidatePath(`/pages/admin/agencies/${parsed.data.agencyId}`)
    return { success: true }
  } catch {
    console.error('[lead-integrations] Credential revocation failed')
    return { success: false, error: 'Unable to revoke the website credential.' }
  }
}
