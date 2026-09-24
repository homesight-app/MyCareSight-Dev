import 'server-only'

import { z } from 'zod'
import sql from '@/db'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'

class LeadReadError extends Error {}

export async function authorizeAndAuditAgencyLeadRead(agencyId: string, leadId: string): Promise<{
  allowed: boolean
  error?: string
}> {
  if (!z.uuid().safeParse(agencyId).success || !z.uuid().safeParse(leadId).success) {
    return { allowed: false, error: 'Invalid lead.' }
  }
  try {
    return await withAgencyManagerFinancialRead(async actor => {
      if (actor.agencyId !== agencyId) throw new LeadReadError('Forbidden')
      const [lead] = await sql<{ id: string }[]>`
        SELECT id FROM public.leads
        WHERE id = ${leadId}::uuid
          AND agency_id = ${actor.agencyId}::uuid
          AND lead_type = 'patient'
        LIMIT 1
      `
      if (!lead) throw new LeadReadError('Lead not found.')
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (${actor.agencyId}::uuid, 'leads', ${lead.id}::uuid, 'VIEW_LEAD', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'view_patient_lead' })}::jsonb)
      `
      return { allowed: true }
    })
  } catch (error) {
    return { allowed: false, error: error instanceof LeadReadError ? error.message : 'Unable to authorize lead access.' }
  }
}

export async function readAgencyLeadStageCounts(agencyId: string): Promise<{
  data: { stage: string; count: number }[] | null
  error: { message: string } | null
}> {
  if (!z.uuid().safeParse(agencyId).success) return { data: null, error: { message: 'Invalid agency.' } }
  try {
    return await withAgencyManagerFinancialRead(async actor => {
      if (actor.agencyId !== agencyId) throw new LeadReadError('Forbidden')
      const rows = await sql<{ stage: string; count: number }[]>`
        SELECT stage, count(*)::integer AS count
        FROM public.leads
        WHERE agency_id = ${actor.agencyId}::uuid
          AND lead_type = 'patient'
          AND status = 'active'
        GROUP BY stage
        ORDER BY stage
      `
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (${actor.agencyId}::uuid, 'leads', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_patient_lead_stage_counts' })}::jsonb)
      `
      return { data: rows.map(row => ({ stage: row.stage, count: Number(row.count) })), error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof LeadReadError ? error.message : 'Unable to load lead pipeline.' } }
  }
}
