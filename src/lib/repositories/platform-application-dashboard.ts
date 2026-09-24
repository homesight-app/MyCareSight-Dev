import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'

type PlatformRole = 'admin' | 'expert'
type PlatformActor = { id: string; role: PlatformRole }
class AccessError extends Error {}

async function withPlatformActor<T>(roles: PlatformRole[], run: (actor: PlatformActor) => Promise<T>): Promise<T> {
  const session = await getSession()
  if (!session || !z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')

  return withActorContext(session.user.id, async () => {
    const [actor] = await sql<{ id: string; role: string }[]>`
      SELECT id, role
      FROM public.user_profiles
      WHERE id = ${session.user.id}::uuid
        AND is_active = true
        AND role = ANY(${roles}::text[])
      LIMIT 1
    `
    if (!actor) throw new AccessError('Forbidden')
    await sql`SELECT set_config('app.current_user_role', ${actor.role}, true)`
    return run({ id: actor.id, role: actor.role as PlatformRole })
  })
}

export type AdminClientDashboardMetrics = {
  activeApplicationCount: number
  pendingReviewCount: number
  clientIds: string[]
}

export async function readAdminClientDashboardMetrics(): Promise<{
  data: AdminClientDashboardMetrics | null
  error: { message: string } | null
}> {
  try {
    return await withPlatformActor(['admin'], async actor => {
      const [counts, clients] = await Promise.all([
        sql<{ active_count: number; pending_count: number }[]>`
          SELECT
            count(*) FILTER (WHERE status IN ('requested','in_progress','under_review','needs_revision'))::integer AS active_count,
            count(*) FILTER (WHERE status = 'under_review')::integer AS pending_count
          FROM public.applications
        `,
        sql<{ id: string }[]>`SELECT id FROM public.agency_admins ORDER BY id`,
      ])
      const data = {
        activeApplicationCount: Number(counts[0]?.active_count ?? 0),
        pendingReviewCount: Number(counts[0]?.pending_count ?? 0),
        clientIds: clients.map(row => row.id),
      }
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'applications', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_admin_client_dashboard_metrics' })}::jsonb)
      `
      return { data, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load client dashboard metrics.' } }
  }
}

export type ExpertClientDashboardMetrics = {
  totalCount: number
  activeCount: number
  pendingCount: number
}

export async function readExpertClientDashboardMetrics(expertUserId: string): Promise<{
  data: ExpertClientDashboardMetrics | null
  error: { message: string } | null
}> {
  if (!z.uuid().safeParse(expertUserId).success) {
    return { data: null, error: { message: 'Invalid expert.' } }
  }
  try {
    return await withPlatformActor(['expert'], async actor => {
      if (actor.id !== expertUserId) throw new AccessError('Forbidden')
      const [counts] = await sql<{ total_count: number; active_count: number; pending_count: number }[]>`
        SELECT
          count(*)::integer AS total_count,
          count(*) FILTER (WHERE status IN ('requested','in_progress','under_review','needs_revision'))::integer AS active_count,
          count(*) FILTER (WHERE status IN ('under_review','needs_revision'))::integer AS pending_count
        FROM public.applications
        WHERE assigned_expert_id = ${actor.id}::uuid
      `
      const data = {
        totalCount: Number(counts?.total_count ?? 0),
        activeCount: Number(counts?.active_count ?? 0),
        pendingCount: Number(counts?.pending_count ?? 0),
      }
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'applications', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_expert_client_dashboard_metrics' })}::jsonb)
      `
      return { data, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load expert dashboard metrics.' } }
  }
}

export async function readAdminLeadPlatformStaff(): Promise<{
  data: { id: string; full_name: string | null }[] | null
  error: { message: string } | null
}> {
  try {
    return await withPlatformActor(['admin'], async actor => {
      const data = await sql<{ id: string; full_name: string | null }[]>`
        SELECT id, full_name
        FROM public.user_profiles
        WHERE is_active = true AND role IN ('admin', 'expert')
        ORDER BY full_name NULLS LAST, id
      `
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'user_profiles', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_admin_lead_platform_staff' })}::jsonb)
      `
      return { data, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load platform staff.' } }
  }
}

export async function readAdminProgramReferences(input: {
  categoryId: string | null
  subcategoryId: string | null
  playbookItemId: string | null
}): Promise<{
  data: { categoryName: string | null; subcategoryName: string | null; playbookId: string | null } | null
  error: { message: string } | null
}> {
  const ids = [input.categoryId, input.subcategoryId, input.playbookItemId].filter((value): value is string => Boolean(value))
  if (ids.some(id => !z.uuid().safeParse(id).success)) {
    return { data: null, error: { message: 'Invalid program reference.' } }
  }
  try {
    return await withPlatformActor(['admin'], async actor => {
      const configurationIds = [input.categoryId, input.subcategoryId].filter((value): value is string => Boolean(value))
      const [configurationRows, playbookRows] = await Promise.all([
        configurationIds.length > 0
          ? sql<{ id: string; name: string }[]>`
              SELECT id, name FROM public.configuration_values
              WHERE id = ANY(${configurationIds}::uuid[])
            `
          : Promise.resolve([]),
        input.playbookItemId
          ? sql<{ playbook_id: string }[]>`
              SELECT playbook_id FROM public.playbook_items
              WHERE id = ${input.playbookItemId}::uuid
              LIMIT 1
            `
          : Promise.resolve([]),
      ])
      const names = new Map(configurationRows.map(row => [row.id, row.name]))
      const data = {
        categoryName: input.categoryId ? names.get(input.categoryId) ?? null : null,
        subcategoryName: input.subcategoryId ? names.get(input.subcategoryId) ?? null : null,
        playbookId: playbookRows[0]?.playbook_id ?? null,
      }
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'applications', NULL, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_admin_program_references' })}::jsonb)
      `
      return { data, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load program references.' } }
  }
}

export async function readAdminExpertEmail(userId: string): Promise<{
  data: { email: string } | null
  error: { message: string } | null
}> {
  if (!z.uuid().safeParse(userId).success) return { data: null, error: { message: 'Invalid user.' } }
  try {
    return await withPlatformActor(['admin'], async actor => {
      const [data] = await sql<{ email: string }[]>`
        SELECT email FROM public.user_profiles
        WHERE id = ${userId}::uuid AND role = 'expert'
        LIMIT 1
      `
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'user_profiles', ${userId}::uuid, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_admin_expert_email' })}::jsonb)
      `
      return { data: data ?? null, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load expert email.' } }
  }
}

export async function readExpertProgramPlaybookId(applicationId: string, playbookItemId: string | null): Promise<{
  data: { playbookId: string | null } | null
  error: { message: string } | null
}> {
  if (!z.uuid().safeParse(applicationId).success || (playbookItemId && !z.uuid().safeParse(playbookItemId).success)) {
    return { data: null, error: { message: 'Invalid program reference.' } }
  }
  try {
    return await withPlatformActor(['expert'], async actor => {
      const [application] = await sql<{ id: string }[]>`
        SELECT id FROM public.applications
        WHERE id = ${applicationId}::uuid AND assigned_expert_id = ${actor.id}::uuid
        LIMIT 1
      `
      if (!application) throw new AccessError('Forbidden')
      const playbookRows = playbookItemId
        ? await sql<{ playbook_id: string }[]>`
            SELECT playbook_id FROM public.playbook_items
            WHERE id = ${playbookItemId}::uuid
            LIMIT 1
          `
        : []
      await sql`
        INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
        VALUES (NULL, 'applications', ${applicationId}::uuid, 'READ', ${actor.id}::uuid,
          ${JSON.stringify({ operation: 'read_expert_program_playbook' })}::jsonb)
      `
      return { data: { playbookId: playbookRows[0]?.playbook_id ?? null }, error: null }
    })
  } catch (error) {
    return { data: null, error: { message: error instanceof AccessError ? error.message : 'Unable to load program playbook.' } }
  }
}
