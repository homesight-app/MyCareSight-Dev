import sql from '@/db'

export type InternalNoteSubjectType =
  | 'patient'
  | 'caregiver'
  | 'visit'
  | 'application'
  | 'application_step'
  | 'application_document'
  | 'application_playbook_item'

export async function getInternalNotesBySubject(
  subjectType: InternalNoteSubjectType,
  subjectId: string
) {
  try {
    const rows = await sql`
      SELECT
        n.id,
        n.content,
        n.subject_type,
        n.subject_id,
        n.agency_id,
        n.created_at,
        n.updated_at,
        n.created_by,
        n.updated_by,
        n.tagged_patient_id,
        n.tagged_caregiver_id,
        json_build_object('full_name', author.full_name) AS author,
        json_build_object('full_name', updater.full_name) AS updater,
        CASE
          WHEN tp.id IS NOT NULL THEN json_build_object('id', tp.id, 'first_name', tp.first_name, 'last_name', tp.last_name)
          ELSE NULL
        END AS tagged_patient,
        CASE
          WHEN tc.id IS NOT NULL THEN json_build_object('id', tc.id, 'first_name', tc.first_name, 'last_name', tc.last_name)
          ELSE NULL
        END AS tagged_caregiver
      FROM internal_notes n
      LEFT JOIN user_profiles author ON author.id = n.created_by
      LEFT JOIN user_profiles updater ON updater.id = n.updated_by
      LEFT JOIN patients tp ON tp.id = n.tagged_patient_id
      LEFT JOIN caregiver_members tc ON tc.id = n.tagged_caregiver_id
      WHERE n.subject_type = ${subjectType}
        AND n.subject_id = ${subjectId}
      ORDER BY n.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getAssociatedNotesByPatient(patientId: string) {
  try {
    const rows = await sql`
      SELECT
        n.id,
        n.content,
        n.subject_type,
        n.subject_id,
        n.agency_id,
        n.created_at,
        n.tagged_patient_id,
        n.tagged_caregiver_id,
        json_build_object('full_name', up.full_name) AS author
      FROM internal_notes n
      LEFT JOIN user_profiles up ON up.id = n.created_by
      WHERE n.tagged_patient_id = ${patientId}
      ORDER BY n.created_at DESC
      LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getAssociatedNotesByCaregiver(caregiverId: string) {
  try {
    const rows = await sql`
      SELECT
        n.id,
        n.content,
        n.subject_type,
        n.subject_id,
        n.agency_id,
        n.created_at,
        n.tagged_patient_id,
        n.tagged_caregiver_id,
        json_build_object('full_name', up.full_name) AS author
      FROM internal_notes n
      LEFT JOIN user_profiles up ON up.id = n.created_by
      WHERE n.tagged_caregiver_id = ${caregiverId}
      ORDER BY n.created_at DESC
      LIMIT 500
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function insertInternalNote(
  data: {
    agency_id: string
    subject_type: string
    subject_id: string
    content: string
    created_by: string
    tagged_patient_id?: string | null
    tagged_caregiver_id?: string | null
  }
) {
  try {
    const rows = await sql`
      INSERT INTO internal_notes ${sql(data, ...Object.keys(data) as any)}
      RETURNING id
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function updateInternalNote(
  id: string,
  updates: {
    content: string
    updated_by: string
    updated_at: string
    tagged_patient_id?: string | null
    tagged_caregiver_id?: string | null
  }
) {
  try {
    const rows = await sql`
      UPDATE internal_notes
      SET ${sql(updates, ...Object.keys(updates) as any)}
      WHERE id = ${id}
      RETURNING id, content
    `
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function getInternalNoteById(id: string) {
  try {
    const rows = await sql`
      SELECT id, content, subject_type, subject_id, agency_id, tagged_patient_id, tagged_caregiver_id
      FROM internal_notes
      WHERE id = ${id}
    `
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

export async function deleteInternalNote(id: string) {
  try {
    const rows = await sql`
      DELETE FROM internal_notes
      WHERE id = ${id}
      RETURNING id, content, subject_type, subject_id, agency_id, tagged_patient_id, tagged_caregiver_id
    `
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
