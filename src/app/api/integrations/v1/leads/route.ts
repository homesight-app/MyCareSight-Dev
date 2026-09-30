import { Buffer } from 'node:buffer'
import { NextRequest, NextResponse } from 'next/server'
import {
  leadIntegrationIdempotencyKeySchema,
  websiteLeadSchema,
} from '@/lib/schemas/lead-integration'
import { ingestWebsiteLead } from '@/lib/repositories/lead-integrations'
import { websiteLeadIntegrationEnabled } from '@/lib/features/website-lead-integration'

const MAX_BODY_BYTES = 32 * 1024

function json(body: Record<string, unknown>, status: number, extraHeaders?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  return match?.[1] ?? ''
}

function requestIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  if (!websiteLeadIntegrationEnabled()) {
    return json({ error: 'integration_unavailable' }, 503, { 'Retry-After': '300' })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415)
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413)
  }

  const idempotency = leadIntegrationIdempotencyKeySchema.safeParse(
    request.headers.get('idempotency-key') ?? ''
  )
  if (!idempotency.success) {
    return json({ error: 'invalid_idempotency_key' }, 400)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413)
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const parsed = websiteLeadSchema.safeParse(decoded)
  if (!parsed.success) {
    return json({
      error: 'validation_failed',
      fields: Array.from(new Set(parsed.error.issues.map(issue => issue.path.join('.')))).filter(Boolean),
    }, 400)
  }

  try {
    const result = await ingestWebsiteLead({
      apiKey: bearerToken(request),
      idempotencyKey: idempotency.data,
      ipAddress: requestIp(request),
      lead: parsed.data,
    })

    if (result.kind === 'unauthorized') return json({ error: 'unauthorized' }, 401)
    if (result.kind === 'rate_limited') {
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' })
    }
    if (result.kind === 'idempotency_conflict') {
      return json({ error: 'idempotency_conflict' }, 409)
    }
    if (result.kind === 'agency_unavailable') {
      return json({ error: 'agency_unavailable' }, 403)
    }
    return json({
      accepted: true,
      duplicate: result.kind === 'duplicate',
      leadId: result.leadId,
    }, result.kind === 'created' ? 201 : 200)
  } catch {
    console.error('[website-leads] Ingestion failed')
    return json({ error: 'service_unavailable' }, 503, { 'Retry-After': '30' })
  }
}
