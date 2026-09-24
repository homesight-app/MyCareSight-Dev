import 'server-only'

import sql from '@/db'
import { getSession } from '@/lib/auth'
import { STORAGE_BUCKET, type StorageBucket, type UploadPurpose } from './contracts'

export { STORAGE_BUCKET }
export type { StorageBucket }

export type AuthorizedObject = {
  agencyId: string | null
  recordId: string
  tableName: string
}

export type AuthorizedUpload = AuthorizedObject & {
  bucket: StorageBucket
  pathPrefix: string
}

type Actor = { id: string; role: string }

function validObjectPath(path: string) {
  return path.length > 0
    && path.length <= 2048
    && !path.includes('\0')
    && !path.split('/').some(segment => segment === '..')
}

const agencyAccess = (actor: Actor, agencySql: ReturnType<typeof sql>) => sql`
  (
    ${actor.role} = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.user_agency_roles membership
      WHERE membership.user_id = ${actor.id}::uuid
        AND membership.agency_id = ${agencySql}
        AND membership.status = 'active'
        AND membership.role = ${actor.role}
    )
  )
`

export async function authorizeStoredObject(
  bucket: string,
  path: string
): Promise<AuthorizedObject | null> {
  if (!validObjectPath(path)) return null
  const session = await getSession()
  if (!session) return null

  const actors = await sql<Actor[]>`
    SELECT id, role FROM public.user_profiles
    WHERE id = ${session.user.id}::uuid AND is_active = true
  `
  const actor = actors[0]
  if (!actor) return null

  if (bucket === STORAGE_BUCKET.APPLICATION) {
    const applicationRows = await sql<AuthorizedObject[]>`
      SELECT document.application_id AS "recordId", application.agency_id AS "agencyId",
        'application_documents'::text AS "tableName"
      FROM public.application_documents document
      JOIN public.applications application ON application.id = document.application_id
      WHERE document.document_url = ${path}
        AND (
          ${actor.role} = 'admin'
          OR (${actor.role} = 'expert' AND application.assigned_expert_id = ${actor.id}::uuid)
          OR application.company_owner_id = ${actor.id}::uuid
          OR ${agencyAccess(actor, sql`application.agency_id`)}
          OR (
            ${actor.role} = 'staff_member'
            AND EXISTS (
              SELECT 1 FROM public.caregiver_members caregiver
              WHERE caregiver.id = application.caregiver_member_id
                AND caregiver.user_id = ${actor.id}::uuid
                AND caregiver.status = 'active'
            )
          )
        )
      LIMIT 1
    `
    if (applicationRows[0]) return applicationRows[0]

    const licenseRows = await sql<AuthorizedObject[]>`
      SELECT document.license_id AS "recordId", license.agency_id AS "agencyId",
        'license_documents'::text AS "tableName"
      FROM public.license_documents document
      JOIN public.licenses license ON license.id = document.license_id
      WHERE document.document_url = ${path}
        AND (
          ${actor.role} IN ('admin', 'expert')
          OR license.company_owner_id = ${actor.id}::uuid
          OR ${agencyAccess(actor, sql`license.agency_id`)}
          OR (
            ${actor.role} = 'staff_member'
            AND EXISTS (
              SELECT 1 FROM public.caregiver_members caregiver
              WHERE caregiver.id = license.caregiver_member_id
                AND caregiver.user_id = ${actor.id}::uuid
                AND caregiver.status = 'active'
            )
          )
        )
      LIMIT 1
    `
    if (licenseRows[0]) return licenseRows[0]

    const credentialRows = await sql<AuthorizedObject[]>`
      SELECT credential.id AS "recordId", credential.agency_id AS "agencyId",
        'caregiver_credentials'::text AS "tableName"
      FROM public.caregiver_credentials credential
      LEFT JOIN public.caregiver_members caregiver ON caregiver.id = credential.caregiver_member_id
      WHERE credential.document_url = ${path}
        AND (
          ${actor.role} IN ('admin', 'expert')
          OR credential.user_id = ${actor.id}::uuid
          OR caregiver.user_id = ${actor.id}::uuid
          OR ${agencyAccess(actor, sql`credential.agency_id`)}
        )
      LIMIT 1
    `
    return credentialRows[0] ?? null
  }

  if (bucket === STORAGE_BUCKET.PATIENT) {
    const rows = await sql<AuthorizedObject[]>`
      SELECT patient.id AS "recordId", patient.agency_id AS "agencyId",
        'patients'::text AS "tableName"
      FROM public.patients patient
      WHERE (
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(patient.documents, '[]'::jsonb)) document
          WHERE document->>'path' = ${path}
        )
        OR EXISTS (
          SELECT 1 FROM public.patient_incidents incident
          WHERE incident.patient_id = patient.id AND incident.file_path = ${path}
        )
      )
      AND (
        ${actor.role} IN ('admin', 'expert')
        OR ${agencyAccess(actor, sql`patient.agency_id`)}
      )
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (bucket === STORAGE_BUCKET.STAFF_MEMBER) {
    const rows = await sql<AuthorizedObject[]>`
      SELECT caregiver.id AS "recordId", caregiver.agency_id AS "agencyId",
        'caregiver_members'::text AS "tableName"
      FROM public.caregiver_members caregiver
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(caregiver.documents, '[]'::jsonb)) document
        WHERE document->>'path' = ${path}
      )
      AND (
        ${actor.role} IN ('admin', 'expert')
        OR caregiver.user_id = ${actor.id}::uuid
        OR ${agencyAccess(actor, sql`caregiver.agency_id`)}
      )
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (bucket === STORAGE_BUCKET.LEAD) {
    const rows = await sql<AuthorizedObject[]>`
      SELECT document.lead_id AS "recordId", lead.agency_id AS "agencyId",
        'lead_documents'::text AS "tableName"
      FROM public.lead_documents document
      JOIN public.leads lead ON lead.id = document.lead_id
      WHERE document.file_url = ${path}
        AND (${actor.role} = 'admin' OR ${agencyAccess(actor, sql`lead.agency_id`)})
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (bucket === STORAGE_BUCKET.AGENCY) {
    const rows = await sql<AuthorizedObject[]>`
      SELECT document.id AS "recordId", document.agency_id AS "agencyId",
        'agency_documents'::text AS "tableName"
      FROM public.agency_documents document
      WHERE document.file_url = ${path}
        AND (${actor.role} = 'admin' OR ${agencyAccess(actor, sql`document.agency_id`)})
      LIMIT 1
    `
    return rows[0] ?? null
  }

  if (bucket === STORAGE_BUCKET.LICENSE_TEMPLATES) {
    const rows = await sql<AuthorizedObject[]>`
      SELECT template.id AS "recordId", NULL::uuid AS "agencyId",
        'license_requirement_templates'::text AS "tableName"
      FROM public.license_requirement_templates template
      WHERE template.file_url = ${path}
      UNION ALL
      SELECT template.id AS "recordId", NULL::uuid AS "agencyId",
        'playbook_templates'::text AS "tableName"
      FROM public.playbook_templates template
      WHERE template.file_url = ${path}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  return null
}

export async function auditStoredObjectAccess(
  actorId: string,
  object: AuthorizedObject,
  operation: 'SIGNED_URL' | 'UPLOAD' | 'DELETE'
) {
  await sql`
    INSERT INTO public.audit_log
      (agency_id, table_name, record_id, action, performed_by_user_id, details)
    VALUES (
      ${object.agencyId}::uuid,
      ${object.tableName},
      ${object.recordId}::uuid,
      ${operation === 'SIGNED_URL' ? 'READ' : operation === 'UPLOAD' ? 'CREATE' : 'DELETE'},
      ${actorId}::uuid,
      ${JSON.stringify({ operation })}::jsonb
    )
  `
}

export async function authorizeStorageUpload(
  purpose: UploadPurpose,
  resourceId: string | null
): Promise<AuthorizedUpload | null> {
  const session = await getSession()
  if (!session) return null
  const actors = await sql<Actor[]>`
    SELECT id, role FROM public.user_profiles
    WHERE id = ${session.user.id}::uuid AND is_active = true
  `
  const actor = actors[0]
  if (!actor) return null

  if (purpose === 'caregiver-certification') {
    const rows = await sql<{ id: string; agencyId: string }[]>`
      SELECT id, agency_id AS "agencyId"
      FROM public.caregiver_members
      WHERE user_id = ${actor.id}::uuid AND status = 'active'
      LIMIT 1
    `
    const row = rows[0]
    return row ? {
      agencyId: row.agencyId,
      recordId: row.id,
      tableName: 'caregiver_credentials',
      bucket: STORAGE_BUCKET.APPLICATION,
      pathPrefix: `certifications/${actor.id}/`,
    } : null
  }
  if (!resourceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resourceId)) {
    return null
  }

  if (purpose === 'patient-incident') {
    const rows = await sql<{ patientId: string; agencyId: string }[]>`
      SELECT patient.id AS "patientId", patient.agency_id AS "agencyId"
      FROM public.patient_incidents incident
      JOIN public.patients patient ON patient.id = incident.patient_id
      WHERE incident.id = ${resourceId}::uuid
        AND (${actor.role} = 'admin' OR ${agencyAccess(actor, sql`patient.agency_id`)})
      LIMIT 1
    `
    const row = rows[0]
    return row ? {
      agencyId: row.agencyId,
      recordId: resourceId,
      tableName: 'patient_incidents',
      bucket: STORAGE_BUCKET.PATIENT,
      pathPrefix: `${row.patientId}/incidents/${resourceId}_`,
    } : null
  }

  if (purpose === 'application-document') {
    const rows = await sql<{ agencyId: string | null }[]>`
      SELECT application.agency_id AS "agencyId"
      FROM public.applications application
      WHERE application.id = ${resourceId}::uuid
        AND (
          ${actor.role} = 'admin'
          OR (${actor.role} = 'expert' AND application.assigned_expert_id = ${actor.id}::uuid)
          OR application.company_owner_id = ${actor.id}::uuid
          OR ${agencyAccess(actor, sql`application.agency_id`)}
          OR (
            ${actor.role} = 'staff_member'
            AND EXISTS (
              SELECT 1 FROM public.caregiver_members caregiver
              WHERE caregiver.id = application.caregiver_member_id
                AND caregiver.user_id = ${actor.id}::uuid
                AND caregiver.status = 'active'
            )
          )
        )
      LIMIT 1
    `
    const row = rows[0]
    return row ? {
      agencyId: row.agencyId,
      recordId: resourceId,
      tableName: 'applications',
      bucket: STORAGE_BUCKET.APPLICATION,
      pathPrefix: `${resourceId}/`,
    } : null
  }

  if (purpose === 'license-document') {
    const rows = await sql<{ agencyId: string | null }[]>`
      SELECT license.agency_id AS "agencyId"
      FROM public.licenses license
      WHERE license.id = ${resourceId}::uuid
        AND (
          ${actor.role} IN ('admin', 'expert')
          OR license.company_owner_id = ${actor.id}::uuid
          OR ${agencyAccess(actor, sql`license.agency_id`)}
          OR (
            ${actor.role} = 'staff_member'
            AND EXISTS (
              SELECT 1 FROM public.caregiver_members caregiver
              WHERE caregiver.id = license.caregiver_member_id
                AND caregiver.user_id = ${actor.id}::uuid
                AND caregiver.status = 'active'
            )
          )
        )
      LIMIT 1
    `
    const row = rows[0]
    return row ? {
      agencyId: row.agencyId,
      recordId: resourceId,
      tableName: 'licenses',
      bucket: STORAGE_BUCKET.APPLICATION,
      pathPrefix: `${resourceId}/`,
    } : null
  }

  if (purpose === 'license-requirement-template' && actor.role === 'admin') {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM public.license_requirements WHERE id = ${resourceId}::uuid LIMIT 1
    `
    return rows[0] ? {
      agencyId: null,
      recordId: resourceId,
      tableName: 'license_requirements',
      bucket: STORAGE_BUCKET.LICENSE_TEMPLATES,
      pathPrefix: `${resourceId}/`,
    } : null
  }

  if (purpose === 'playbook-template' && actor.role === 'admin') {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM public.playbooks WHERE id = ${resourceId}::uuid LIMIT 1
    `
    return rows[0] ? {
      agencyId: null,
      recordId: resourceId,
      tableName: 'playbooks',
      bucket: STORAGE_BUCKET.LICENSE_TEMPLATES,
      pathPrefix: `playbooks/${resourceId}/`,
    } : null
  }

  return null
}
