import 'server-only'

import { z } from 'zod'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'

type ApplicationResource =
  | { applicationId: string }
  | { playbookItemId: string }
  | { documentId: string }
  | { conversationId: string }

export type AuthorizedApplication = {
  id: string
  agencyId: string | null
  assignedExpertId: string | null
  actorId: string
  actorRole: string
}

export class ApplicationAccessError extends Error {
  constructor(message = 'Not found or not authorized') {
    super(message)
    this.name = 'ApplicationAccessError'
  }
}

function resourceId(resource: ApplicationResource) {
  if ('applicationId' in resource) return resource.applicationId
  if ('playbookItemId' in resource) return resource.playbookItemId
  if ('documentId' in resource) return resource.documentId
  return resource.conversationId
}

async function resolveApplication(resource: ApplicationResource) {
  if ('applicationId' in resource) {
    return sql<{ id: string; agency_id: string | null; assigned_expert_id: string | null }[]>`
      SELECT id, agency_id, assigned_expert_id
      FROM public.applications
      WHERE id = ${resource.applicationId}::uuid
      LIMIT 1
    `
  }
  if ('playbookItemId' in resource) {
    return sql<{ id: string; agency_id: string | null; assigned_expert_id: string | null }[]>`
      SELECT application.id, application.agency_id, application.assigned_expert_id
      FROM public.application_playbook_items item
      JOIN public.applications application ON application.id = item.application_id
      WHERE item.id = ${resource.playbookItemId}::uuid
      LIMIT 1
    `
  }
  if ('documentId' in resource) {
    return sql<{ id: string; agency_id: string | null; assigned_expert_id: string | null }[]>`
      SELECT application.id, application.agency_id, application.assigned_expert_id
      FROM public.application_documents document
      JOIN public.applications application ON application.id = document.application_id
      WHERE document.id = ${resource.documentId}::uuid
      LIMIT 1
    `
  }
  return sql<{ id: string; agency_id: string | null; assigned_expert_id: string | null }[]>`
    SELECT application.id, application.agency_id, application.assigned_expert_id
    FROM public.conversations conversation
    JOIN public.applications application ON application.id = conversation.application_id
    WHERE conversation.id = ${resource.conversationId}::uuid
    LIMIT 1
  `
}

/**
 * Runs an application operation in one actor-scoped transaction after resolving
 * the resource to its authoritative application and enforcing platform or exact
 * active-agency access. Agency actors must also own HomeSights Services.
 */
export async function withAuthorizedApplication<T>(
  resource: ApplicationResource,
  run: (application: AuthorizedApplication) => Promise<T>
): Promise<T> {
  const session = await getSession()
  const id = resourceId(resource)
  if (!session || !z.uuid().safeParse(id).success) throw new ApplicationAccessError()

  return withUserContext(session.user.id, '', null, async () => {
    const [actor] = await sql<{ id: string; role: string }[]>`
      SELECT id, role
      FROM public.user_profiles
      WHERE id = ${session.user.id}::uuid AND is_active = true
      LIMIT 1
    `
    if (!actor) throw new ApplicationAccessError()

    const [application] = await resolveApplication(resource)
    if (!application) throw new ApplicationAccessError()

    let allowed = actor.role === 'admin'
      || (actor.role === 'expert' && application.assigned_expert_id === actor.id)

    if (!allowed && application.agency_id && ['company_owner', 'care_coordinator'].includes(actor.role)) {
      const [membership] = await sql`
        SELECT 1
        FROM public.user_agency_roles membership
        JOIN public.agencies agency ON agency.id = membership.agency_id
        JOIN public.plan_capabilities plan_capability ON plan_capability.plan_id = agency.plan_id
        JOIN public.capability_catalog capability
          ON capability.key = plan_capability.capability_key
         AND capability.is_active = true
        WHERE membership.user_id = ${actor.id}::uuid
          AND membership.agency_id = ${application.agency_id}::uuid
          AND membership.role = ${actor.role}
          AND membership.status = 'active'
          AND plan_capability.capability_key = 'homesights_services'
        LIMIT 1
      `
      allowed = Boolean(membership)
    }

    if (!allowed) throw new ApplicationAccessError()
    await sql`
      SELECT
        set_config('app.current_user_role', ${actor.role}, true),
        set_config('app.current_agency_id', ${application.agency_id ?? ''}, true)
    `

    return run({
      id: application.id,
      agencyId: application.agency_id,
      assignedExpertId: application.assigned_expert_id,
      actorId: actor.id,
      actorRole: actor.role,
    })
  })
}
