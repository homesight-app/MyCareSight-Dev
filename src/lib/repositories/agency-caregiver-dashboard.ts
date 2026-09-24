import 'server-only'

import { z } from 'zod'
import sql from '@/db'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'

export type AgencyCaregiverDashboardStats = {
  totalStaff: number
  activeStaff: number
  expiringLicenses: number
}

type Result = {
  data: AgencyCaregiverDashboardStats | null
  error: { message: string } | null
}

class DashboardReadError extends Error {}

export async function readAgencyCaregiverDashboardStats(agencyId: string): Promise<Result> {
  if (!z.uuid().safeParse(agencyId).success) {
    return { data: null, error: { message: 'Invalid agency.' } }
  }

  try {
    return await withAgencyManagerFinancialRead(async actor => {
      if (actor.agencyId !== agencyId) throw new DashboardReadError('Forbidden')

      const [row] = await sql<{
        total_staff: number
        active_staff: number
        expiring_licenses: number
      }[]>`
        SELECT
          (SELECT count(*)::integer
             FROM public.caregiver_members member
            WHERE member.agency_id = ${actor.agencyId}::uuid) AS total_staff,
          (SELECT count(*)::integer
             FROM public.caregiver_members member
            WHERE member.agency_id = ${actor.agencyId}::uuid
              AND member.status = 'active') AS active_staff,
          (SELECT count(*)::integer
             FROM public.caregiver_credentials credential
             JOIN public.caregiver_members member
               ON member.id = credential.caregiver_member_id
              AND member.agency_id = credential.agency_id
            WHERE credential.agency_id = ${actor.agencyId}::uuid
              AND credential.expiration_date > CURRENT_DATE
              AND credential.expiration_date <= CURRENT_DATE + 30) AS expiring_licenses
      `

      const data = {
        totalStaff: Number(row?.total_staff ?? 0),
        activeStaff: Number(row?.active_staff ?? 0),
        expiringLicenses: Number(row?.expiring_licenses ?? 0),
      }

      await sql`
        INSERT INTO public.audit_log (
          agency_id, table_name, record_id, action, performed_by_user_id, details
        ) VALUES (
          ${actor.agencyId}::uuid, 'caregiver_members', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_caregiver_dashboard_stats' })}::jsonb
        )
      `

      return { data, error: null }
    })
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof DashboardReadError
          ? error.message
          : 'Unable to load caregiver dashboard statistics.',
      },
    }
  }
}
