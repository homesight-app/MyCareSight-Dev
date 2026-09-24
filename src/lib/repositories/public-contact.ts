import 'server-only'

import sql from '@/db'
import type { PublicContactInput } from '@/lib/schemas/public-contact'

export async function submitPublicContactLead(input: PublicContactInput): Promise<{
  accepted: boolean
  rateLimited: boolean
}> {
  return sql.begin(async tx => {
    // Serialize submissions for the same normalized email so concurrent requests
    // cannot all pass the three-per-day limit.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 9142026))`
    const [countRow] = await tx<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM public.leads
      WHERE contact_email = ${input.email}
        AND source = 'Website'
        AND created_at >= now() - interval '24 hours'
    `
    if (Number(countRow?.count ?? 0) >= 3) return { accepted: false, rateLimited: true }

    const noteLines = ['[Website Contact Form]']
    if (input.bestTime) noteLines.push(`Best Time to Call: ${input.bestTime}`)
    if (input.message) noteLines.push('---', input.message)
    const [lead] = await tx<{ id: string }[]>`
      INSERT INTO public.leads (
        lead_type, contact_first_name, contact_last_name, contact_email, contact_phone,
        company_name, service_type, stage, status, source, sms_consent,
        contact_address1, contact_address2, contact_city, contact_state, contact_zip,
        notes, updated_at
      ) VALUES (
        'agency', ${input.firstName}, ${input.lastName}, ${input.email}, ${input.phone || null},
        ${input.company || null}, ${input.serviceType || null}, 'new', 'active', 'Website',
        ${input.smsConsent === 'yes'}, ${input.address1 || null}, ${input.address2 || null},
        ${input.city || null}, ${input.state || null}, ${input.zip || null}, ${noteLines.join('\n')}, now()
      ) RETURNING id
    `
    await tx`
      INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
      VALUES (NULL, 'leads', ${lead.id}::uuid, 'CREATE', NULL,
        ${JSON.stringify({ operation: 'public_contact_submission', source: 'Website' })}::jsonb)
    `
    return { accepted: true, rateLimited: false }
  })
}
