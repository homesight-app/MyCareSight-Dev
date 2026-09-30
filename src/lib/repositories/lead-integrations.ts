import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import sql from '@/db'
import { normalizeDatabaseRows } from '@/lib/database-date-contract'
import type { WebsiteLeadInput } from '@/lib/schemas/lead-integration'
import type { LeadIntegrationCredentialSummary } from '@/types/lead-integrations'

const IP_WINDOW_MINUTES = 5
const IP_REQUEST_LIMIT = 120
const CREDENTIAL_WINDOW_MINUTES = 1
const CREDENTIAL_REQUEST_LIMIT = 60
const RATE_LIMIT_CLEANUP_BATCH_SIZE = 1000

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function ipFingerprint(ipAddress: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is required for integration rate limiting')
  return createHmac('sha256', secret)
    .update(`lead-integration-ip:${ipAddress}`, 'utf8')
    .digest('hex')
}

function nullable(value: string): string | null {
  return value || null
}

export async function listLeadIntegrationCredentials(
  agencyId: string
): Promise<LeadIntegrationCredentialSummary[]> {
  const rows = await sql`
    SELECT id, agency_id, name, key_prefix, status, created_at, expires_at,
           last_used_at, revoked_at
    FROM public.lead_integration_credentials
    WHERE agency_id = ${agencyId}
    ORDER BY created_at DESC
  `
  return normalizeDatabaseRows(rows, {
    timestamps: ['created_at', 'expires_at', 'last_used_at', 'revoked_at'],
  }).map(row => ({
    id: String(row.id),
    agencyId: String(row.agency_id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    status: row.status as 'active' | 'revoked',
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  }))
}

export async function createLeadIntegrationCredential(input: {
  agencyId: string
  name: string
  createdBy: string
}): Promise<{ apiKey: string; credential: LeadIntegrationCredentialSummary }> {
  const keyPrefix = randomBytes(6).toString('hex')
  const apiKey = `mcs_web_${keyPrefix}_${randomBytes(32).toString('base64url')}`
  const keyHash = sha256(apiKey)

  return sql.begin(async tx => {
    const [credential] = await tx<{
      id: string
      agency_id: string
      name: string
      key_prefix: string
      status: 'active'
      created_at: Date | string
      expires_at: null
      last_used_at: null
      revoked_at: null
    }[]>`
      INSERT INTO public.lead_integration_credentials (
        agency_id, name, key_prefix, key_hash, created_by
      )
      SELECT agency.id, ${input.name}, ${keyPrefix}, ${keyHash}, actor.id
      FROM public.agencies agency
      JOIN public.user_profiles actor ON actor.id = ${input.createdBy}
      WHERE agency.id = ${input.agencyId}
        AND agency.status = 'active'
        AND actor.is_active = true
        AND actor.role = 'admin'
      RETURNING id, agency_id, name, key_prefix, status, created_at,
                expires_at, last_used_at, revoked_at
    `
    if (!credential) throw new Error('Agency or administrator is unavailable')

    await tx`
      INSERT INTO public.audit_log (
        agency_id, table_name, record_id, action, performed_by_user_id, details
      ) VALUES (
        ${input.agencyId}, 'lead_integration_credentials', ${credential.id},
        'CREATE', ${input.createdBy},
        ${tx.json({ operation: 'create_website_lead_credential' })}
      )
    `

    const [normalized] = normalizeDatabaseRows([credential], {
      timestamps: ['created_at', 'expires_at', 'last_used_at', 'revoked_at'],
    })
    return {
      apiKey,
      credential: {
        id: normalized.id,
        agencyId: normalized.agency_id,
        name: normalized.name,
        keyPrefix: normalized.key_prefix,
        status: normalized.status,
        createdAt: String(normalized.created_at),
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      },
    }
  })
}

export async function revokeLeadIntegrationCredential(input: {
  agencyId: string
  credentialId: string
  revokedBy: string
}): Promise<boolean> {
  return sql.begin(async tx => {
    const [credential] = await tx<{ id: string }[]>`
      UPDATE public.lead_integration_credentials credential
      SET status = 'revoked', revoked_by = actor.id, revoked_at = now()
      FROM public.user_profiles actor
      WHERE credential.id = ${input.credentialId}
        AND credential.agency_id = ${input.agencyId}
        AND credential.status = 'active'
        AND actor.id = ${input.revokedBy}
        AND actor.is_active = true
        AND actor.role = 'admin'
      RETURNING credential.id
    `
    if (!credential) return false

    await tx`
      INSERT INTO public.audit_log (
        agency_id, table_name, record_id, action, performed_by_user_id, details
      ) VALUES (
        ${input.agencyId}, 'lead_integration_credentials', ${credential.id},
        'REVOKE', ${input.revokedBy},
        ${tx.json({ operation: 'revoke_website_lead_credential' })}
      )
    `
    return true
  })
}

export type WebsiteLeadIngestionResult =
  | { kind: 'created' | 'duplicate'; leadId: string }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'idempotency_conflict' }
  | { kind: 'agency_unavailable' }

export async function ingestWebsiteLead(input: {
  apiKey: string
  idempotencyKey: string
  ipAddress: string
  lead: WebsiteLeadInput
}): Promise<WebsiteLeadIngestionResult> {
  const apiKeyHash = sha256(input.apiKey)
  const ipHash = ipFingerprint(input.ipAddress)
  const idempotencyKeyHash = sha256(input.idempotencyKey)
  const requestHash = sha256(JSON.stringify(input.lead))

  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`ip:${ipHash}`}, 17017))`
    await tx`
      DELETE FROM public.lead_integration_rate_limit_events
      WHERE id IN (
        SELECT id
        FROM public.lead_integration_rate_limit_events
        WHERE created_at < now() - interval '1 day'
        ORDER BY created_at
        LIMIT ${RATE_LIMIT_CLEANUP_BATCH_SIZE}
      )
    `
    const [ipAttempts] = await tx<{ attempts: number }[]>`
      SELECT count(*)::integer AS attempts
      FROM public.lead_integration_rate_limit_events
      WHERE scope = 'ip'
        AND subject_hash = ${ipHash}
        AND created_at >= now() - (${IP_WINDOW_MINUTES} * interval '1 minute')
    `
    if (Number(ipAttempts?.attempts ?? 0) >= IP_REQUEST_LIMIT) {
      return { kind: 'rate_limited' }
    }
    await tx`
      INSERT INTO public.lead_integration_rate_limit_events (scope, subject_hash)
      VALUES ('ip', ${ipHash})
    `

    const [credential] = await tx<{
      id: string
      agency_id: string
    }[]>`
      SELECT id, agency_id
      FROM public.lead_integration_credentials
      WHERE key_hash = ${apiKeyHash}
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
    `
    if (!credential) return { kind: 'unauthorized' }

    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`credential:${credential.id}`}, 17017))`
    const [credentialAttempts] = await tx<{ attempts: number }[]>`
      SELECT count(*)::integer AS attempts
      FROM public.lead_integration_rate_limit_events
      WHERE scope = 'credential'
        AND subject_hash = ${apiKeyHash}
        AND created_at >= now() - (${CREDENTIAL_WINDOW_MINUTES} * interval '1 minute')
    `
    if (Number(credentialAttempts?.attempts ?? 0) >= CREDENTIAL_REQUEST_LIMIT) {
      return { kind: 'rate_limited' }
    }
    await tx`
      INSERT INTO public.lead_integration_rate_limit_events (scope, subject_hash)
      VALUES ('credential', ${apiKeyHash})
    `

    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`delivery:${credential.id}:${idempotencyKeyHash}`}, 17017))`
    const [priorDelivery] = await tx<{ lead_id: string; request_hash: string }[]>`
      SELECT lead_id, request_hash
      FROM public.lead_integration_deliveries
      WHERE credential_id = ${credential.id}
        AND idempotency_key_hash = ${idempotencyKeyHash}
      LIMIT 1
    `
    if (priorDelivery) {
      if (priorDelivery.request_hash !== requestHash) return { kind: 'idempotency_conflict' }
      await tx`
        UPDATE public.lead_integration_credentials
        SET last_used_at = now()
        WHERE id = ${credential.id}
      `
      return { kind: 'duplicate', leadId: priorDelivery.lead_id }
    }

    const [agency] = await tx<{ id: string }[]>`
      SELECT id FROM public.agencies
      WHERE id = ${credential.agency_id} AND status = 'active'
      LIMIT 1
    `
    if (!agency) return { kind: 'agency_unavailable' }

    const [entryStage] = await tx<{ key: string }[]>`
      SELECT key
      FROM public.agency_lead_stages
      WHERE agency_id = ${credential.agency_id} AND is_entry = true
      ORDER BY sort_order, id
      LIMIT 1
    `
    const stage = entryStage?.key ?? 'new'

    const [lead] = await tx<{ id: string }[]>`
      INSERT INTO public.leads (
        lead_type, agency_id, contact_first_name, contact_last_name,
        contact_email, contact_phone, company_name, service_type,
        stage, status, source, sms_consent,
        contact_address1, contact_address2, contact_city, contact_state,
        contact_zip, notes, updated_at
      ) VALUES (
        'patient', ${credential.agency_id}, ${input.lead.firstName}, ${input.lead.lastName},
        ${input.lead.email}, ${nullable(input.lead.phone)}, ${nullable(input.lead.companyName)},
        ${input.lead.serviceType ?? null}, ${stage}, 'active', 'Website', ${input.lead.smsConsent},
        ${nullable(input.lead.address1)}, ${nullable(input.lead.address2)},
        ${nullable(input.lead.city)}, ${nullable(input.lead.state)}, ${nullable(input.lead.zip)},
        ${nullable(input.lead.message)}, now()
      )
      RETURNING id
    `

    const [delivery] = await tx<{ id: string }[]>`
      INSERT INTO public.lead_integration_deliveries (
        credential_id, agency_id, idempotency_key_hash, request_hash, lead_id
      ) VALUES (
        ${credential.id}, ${credential.agency_id}, ${idempotencyKeyHash}, ${requestHash}, ${lead.id}
      )
      RETURNING id
    `

    await tx`
      UPDATE public.lead_integration_credentials
      SET last_used_at = now()
      WHERE id = ${credential.id}
    `
    await tx`
      INSERT INTO public.audit_log (
        agency_id, table_name, record_id, action, performed_by_user_id, details
      ) VALUES (
        ${credential.agency_id}, 'leads', ${lead.id}, 'CREATE', NULL,
        ${tx.json({
          operation: 'website_lead_ingestion',
          source: 'Website',
          credential_id: credential.id,
          delivery_id: delivery.id,
        })}
      )
    `

    return { kind: 'created', leadId: lead.id }
  })
}
