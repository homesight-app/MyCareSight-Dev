import sql from '@/db'

export async function getLeads(
  opts: {
    leadType: 'agency' | 'patient'
    agencyId?: string
    stage?: string
    search?: string
    includeArchived?: boolean
  }
) {
  try {
    const archivedFrag = !opts.includeArchived ? sql`AND l.status = 'active'` : sql``
    const agencyFrag   = opts.agencyId ? sql`AND l.agency_id = ${opts.agencyId}` : sql``
    const stageFrag    = opts.stage    ? sql`AND l.stage = ${opts.stage}`        : sql``
    const searchFrag   = opts.search?.trim()
      ? sql`AND (l.contact_first_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.contact_last_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.company_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.contact_email ILIKE ${'%' + opts.search.trim() + '%'})`
      : sql``

    const rows = await sql`
      SELECT
        l.id, l.lead_type, l.agency_id,
        l.contact_first_name, l.contact_last_name, l.contact_email, l.contact_phone,
        l.company_name, l.service_type, l.stage, l.source, l.price, l.retainer_amount,
        l.retainer_paid_date, l.installments, l.installment_amount, l.signed_date, l.notes,
        l.converted_agency_id, l.converted_client_id, l.converted_at,
        l.status, l.created_at, l.updated_at, l.assigned_to, l.created_by,
        l.contact_address1, l.contact_address2, l.contact_city, l.contact_state, l.contact_zip,
        l.lead_owner_id, l.proposal_sent_date, l.service_states,
        up.id   AS lead_owner_id_ref,
        up.full_name AS lead_owner_full_name
      FROM leads l
      LEFT JOIN user_profiles up ON up.id = l.lead_owner_id
      WHERE l.lead_type = ${opts.leadType}
      ${archivedFrag} ${agencyFrag} ${stageFrag} ${searchFrag}
      ORDER BY l.created_at DESC
      LIMIT 1000
    `

    const data = rows.map(r => ({
      ...r,
      lead_owner: r.lead_owner_id_ref ? { id: r.lead_owner_id_ref, full_name: r.lead_owner_full_name } : null,
    })) as unknown as any[]

    return { data, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export interface GetLeadsPaginatedOpts {
  leadType: 'agency' | 'patient'
  agencyId?: string
  page?: number
  pageSize?: number
  search?: string
  stageFilter?: string   // 'active' | 'all' | 'archived' | specific stage key
  serviceType?: string
  source?: string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}

function buildLeadFilterFragments(opts: GetLeadsPaginatedOpts) {
  const frags = [sql`l.lead_type = ${opts.leadType}`]

  if (opts.agencyId) frags.push(sql`l.agency_id = ${opts.agencyId}`)

  if (opts.stageFilter === 'archived') {
    frags.push(sql`l.status = 'archived'`)
  } else if (opts.stageFilter === 'active') {
    frags.push(sql`l.status = 'active'`)
    frags.push(sql`l.stage NOT IN ('on_hold', 'unresponsive', 'lost', 'signed')`)
  } else if (opts.stageFilter && opts.stageFilter !== 'all') {
    frags.push(sql`l.status = 'active'`)
    frags.push(sql`l.stage = ${opts.stageFilter}`)
  }
  // 'all': include archived — no status filter

  if (opts.serviceType && opts.serviceType !== 'all') frags.push(sql`l.service_type = ${opts.serviceType}`)
  if (opts.source      && opts.source      !== 'all') frags.push(sql`l.source = ${opts.source}`)

  if (opts.search?.trim()) {
    const term = opts.search.trim()
    frags.push(sql`(l.contact_first_name ILIKE ${'%' + term + '%'} OR l.contact_last_name ILIKE ${'%' + term + '%'} OR l.company_name ILIKE ${'%' + term + '%'} OR l.contact_email ILIKE ${'%' + term + '%'})`)
  }

  // Combine with AND
  return frags.reduce((acc, frag) => sql`${acc} AND ${frag}`)
}

export async function getLeadsPaginated(opts: GetLeadsPaginatedOpts) {
  try {
    const page     = opts.page     ?? 0
    const pageSize = opts.pageSize ?? 50
    const offset   = page * pageSize

    const sortCol = opts.sortKey === 'price'       ? sql`l.price`
                  : opts.sortKey === 'signed_date'  ? sql`l.signed_date`
                  : opts.sortKey === 'name'          ? sql`l.contact_last_name`
                  : opts.sortKey === 'company'       ? sql`l.company_name`
                  : opts.sortKey === 'stage'         ? sql`l.stage`
                  : opts.sortKey === 'source'        ? sql`l.source`
                  : sql`l.created_at`
    const sortDir  = (opts.sortDir ?? 'desc') === 'asc' ? sql`ASC` : sql`DESC`

    const where = buildLeadFilterFragments(opts)

    const [dataRows, countRows] = await Promise.all([
      sql`
        SELECT
          l.id, l.lead_type, l.agency_id,
          l.contact_first_name, l.contact_last_name, l.contact_email, l.contact_phone,
          l.company_name, l.service_type, l.stage, l.source, l.price, l.retainer_amount,
          l.retainer_paid_date, l.installments, l.installment_amount, l.signed_date, l.notes,
          l.converted_agency_id, l.converted_client_id, l.converted_at,
          l.status, l.created_at, l.updated_at, l.assigned_to, l.created_by,
          l.contact_address1, l.contact_address2, l.contact_city, l.contact_state, l.contact_zip,
          l.lead_owner_id, l.proposal_sent_date, l.service_states,
          up.id        AS lead_owner_id_ref,
          up.full_name AS lead_owner_full_name
        FROM leads l
        LEFT JOIN user_profiles up ON up.id = l.lead_owner_id
        WHERE ${where}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM leads l
        WHERE ${where}
      `,
    ])

    const data = dataRows.map(r => ({
      ...r,
      lead_owner: r.lead_owner_id_ref ? { id: r.lead_owner_id_ref, full_name: r.lead_owner_full_name } : null,
    }))

    return {
      data,
      count: countRows[0]?.count ?? 0,
      error: null,
    }
  } catch (err) {
    return { data: [], count: 0, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

/** Lightweight — returns only stage + status, used to compute tab counts. */
export async function getLeadStageCounts(
  opts: Pick<GetLeadsPaginatedOpts, 'leadType' | 'agencyId' | 'search' | 'serviceType' | 'source'>
) {
  try {
    const agencyFrag      = opts.agencyId ? sql`AND l.agency_id = ${opts.agencyId}` : sql``
    const serviceTypeFrag = opts.serviceType && opts.serviceType !== 'all' ? sql`AND l.service_type = ${opts.serviceType}` : sql``
    const sourceFrag      = opts.source    && opts.source      !== 'all' ? sql`AND l.source = ${opts.source}`             : sql``
    const searchFrag      = opts.search?.trim()
      ? sql`AND (l.contact_first_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.contact_last_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.company_name ILIKE ${'%' + opts.search.trim() + '%'} OR l.contact_email ILIKE ${'%' + opts.search.trim() + '%'})`
      : sql``

    const rows = await sql`
      SELECT l.stage, l.status
      FROM leads l
      WHERE l.lead_type = ${opts.leadType}
      ${agencyFrag} ${serviceTypeFrag} ${sourceFrag} ${searchFrag}
    `

    const allRows = rows as unknown as { stage: string; status: string }[]
    const nonArchived = allRows.filter(r => r.status !== 'archived')
    const TERMINAL = ['on_hold', 'unresponsive', 'lost', 'signed']
    const counts: Record<string, number> = {
      all:      nonArchived.length,
      active:   nonArchived.filter(r => !TERMINAL.includes(r.stage)).length,
      archived: allRows.filter(r => r.status === 'archived').length,
    }
    for (const r of nonArchived) {
      counts[r.stage] = (counts[r.stage] ?? 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}

/** Lightweight — returns distinct non-null sources, used to populate the source dropdown. */
export async function getLeadDistinctSources(
  opts: Pick<GetLeadsPaginatedOpts, 'leadType' | 'agencyId'>
) {
  try {
    const agencyFrag = opts.agencyId ? sql`AND agency_id = ${opts.agencyId}` : sql``
    const rows = await sql`
      SELECT DISTINCT source FROM leads
      WHERE lead_type = ${opts.leadType}
        AND source IS NOT NULL
      ${agencyFrag}
    `
    const sources = (rows as unknown as { source: string }[]).map(r => r.source).filter(Boolean)
    return sources.sort()
  } catch {
    return []
  }
}

export async function getLeadById(leadId: string) {
  try {
    const rows = await sql`
      SELECT
        l.id, l.lead_type, l.agency_id,
        l.contact_first_name, l.contact_last_name, l.contact_email, l.contact_phone,
        l.company_name, l.service_type, l.stage, l.source, l.price, l.retainer_amount,
        l.retainer_paid_date, l.installments, l.installment_amount, l.signed_date, l.notes,
        l.converted_agency_id, l.converted_client_id, l.converted_at,
        l.status, l.created_at, l.updated_at, l.assigned_to, l.created_by,
        l.contact_address1, l.contact_address2, l.contact_city, l.contact_state, l.contact_zip,
        l.lead_owner_id, l.proposal_sent_date, l.service_states,
        up.id        AS lead_owner_id_ref,
        up.full_name AS lead_owner_full_name,
        ag.id        AS converted_agency_ref_id,
        ag.name      AS converted_agency_name
      FROM leads l
      LEFT JOIN user_profiles up ON up.id = l.lead_owner_id
      LEFT JOIN agencies ag ON ag.id = l.converted_agency_id
      WHERE l.id = ${leadId}
      LIMIT 1
    `
    if (!rows[0]) throw new Error('Not found')
    const r = rows[0] as any
    return {
      data: {
        ...r,
        lead_owner:        r.lead_owner_id_ref     ? { id: r.lead_owner_id_ref,     full_name: r.lead_owner_full_name } : null,
        converted_agency:  r.converted_agency_ref_id ? { id: r.converted_agency_ref_id, name: r.converted_agency_name } : null,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadNotes(leadId: string) {
  try {
    const rows = await sql`
      SELECT
        ln.id, ln.lead_id, ln.author_id, ln.content, ln.note_type, ln.created_at,
        up.full_name AS author_full_name
      FROM lead_notes ln
      LEFT JOIN user_profiles up ON up.id = ln.author_id
      WHERE ln.lead_id = ${leadId}
      ORDER BY ln.created_at DESC
      LIMIT 200
    `
    const data = rows.map(r => ({
      ...r,
      author: r.author_full_name ? { full_name: r.author_full_name } : null,
    }))
    return { data, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadTasks(leadId: string) {
  try {
    const rows = await sql`
      SELECT id, lead_id, created_by, assigned_to, title, due_date, completed_at, created_at, updated_at
      FROM lead_tasks
      WHERE lead_id = ${leadId}
      ORDER BY completed_at ASC NULLS FIRST, due_date ASC NULLS LAST, created_at ASC
      LIMIT 200
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadDocuments(leadId: string) {
  try {
    const rows = await sql`
      SELECT id, lead_id, document_name, file_url, file_name, document_type, description, uploaded_by, created_at
      FROM lead_documents
      WHERE lead_id = ${leadId}
      ORDER BY created_at DESC
      LIMIT 200
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function insertLeadDocument(
  data: { lead_id: string; document_name: string; file_url: string; file_name?: string | null; document_type?: string | null; description?: string | null; uploaded_by: string }
) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`INSERT INTO lead_documents ${sql(data, ...keys)} RETURNING id`
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function deleteLeadDocument(docId: string) {
  try {
    await sql`DELETE FROM lead_documents WHERE id = ${docId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadsByAgency(agencyId: string) {
  try {
    const rows = await sql`
      SELECT
        id, contact_first_name, contact_last_name, company_name,
        service_type, stage, source, price, retainer_amount,
        installment_amount, signed_date, converted_at, created_at
      FROM leads
      WHERE lead_type = 'agency'
        AND converted_agency_id = ${agencyId}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadDocumentsByLeadIds(leadIds: string[]) {
  if (leadIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT id, lead_id, document_name, file_url, file_name, document_type, created_at
      FROM lead_documents
      WHERE lead_id IN ${sql(leadIds)}
      ORDER BY created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadTaskStatusByLeadIds(leadIds: string[], today: string) {
  if (leadIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT lead_id, due_date
      FROM lead_tasks
      WHERE lead_id IN ${sql(leadIds)}
        AND completed_at IS NULL
        AND due_date <= ${today}
    `
    return { data: rows as unknown as { lead_id: string; due_date: string }[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function linkLeadToExistingAgency(leadId: string, agencyId: string) {
  try {
    await sql`
      UPDATE leads
      SET converted_agency_id = ${agencyId}, updated_at = ${new Date().toISOString()}
      WHERE id = ${leadId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function unlinkLeadFromAgency(leadId: string) {
  try {
    await sql`
      UPDATE leads
      SET converted_agency_id = NULL, updated_at = ${new Date().toISOString()}
      WHERE id = ${leadId}
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getLeadNotesByLeadIds(leadIds: string[]) {
  if (leadIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`
      SELECT
        ln.id, ln.lead_id, ln.author_id, ln.content, ln.note_type, ln.created_at,
        up.full_name AS author_full_name
      FROM lead_notes ln
      LEFT JOIN user_profiles up ON up.id = ln.author_id
      WHERE ln.lead_id IN ${sql(leadIds)}
      ORDER BY ln.created_at DESC
    `
    const data = rows.map(r => ({
      ...r,
      author: r.author_full_name ? { full_name: r.author_full_name } : null,
    }))
    return { data, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

// ─── Agency lead stages ────────────────────────────────────────────────────

export async function getAgencyLeadStages(agencyId: string) {
  try {
    const rows = await sql`
      SELECT id, agency_id, key, label, color, sort_order, is_entry, is_won, is_lost, created_at
      FROM agency_lead_stages
      WHERE agency_id = ${agencyId}
      ORDER BY sort_order ASC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

const DEFAULT_AGENCY_STAGES = [
  { key: 'new',         label: 'New',           color: 'bg-gray-100 text-gray-600',      sort_order: 0,  is_entry: true,  is_won: false, is_lost: false },
  { key: 'contacted',   label: 'Contacted',     color: 'bg-blue-100 text-blue-700',      sort_order: 10, is_entry: false, is_won: false, is_lost: false },
  { key: 'quoted',      label: 'Quoted',        color: 'bg-indigo-100 text-indigo-700',  sort_order: 20, is_entry: false, is_won: false, is_lost: false },
  { key: 'closed_won',  label: 'Closed - Won',  color: 'bg-green-100 text-green-700',   sort_order: 90, is_entry: false, is_won: true,  is_lost: false },
  { key: 'closed_lost', label: 'Closed - Lost', color: 'bg-red-100 text-red-600',       sort_order: 91, is_entry: false, is_won: false, is_lost: true  },
]

export async function seedDefaultAgencyLeadStages(agencyId: string) {
  try {
    const rows = DEFAULT_AGENCY_STAGES.map(s => ({ ...s, agency_id: agencyId }))
    for (const row of rows) {
      const keys = Object.keys(row) as unknown as any[]
      await sql`
        INSERT INTO agency_lead_stages ${sql(row, ...keys)}
        ON CONFLICT (agency_id, key) DO NOTHING
      `
    }
    return getAgencyLeadStages(agencyId)
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'stage'
}

export async function createAgencyLeadStage(
  agencyId: string,
  data: { label: string; color: string }
) {
  try {
    const existingRows = await sql`
      SELECT sort_order FROM agency_lead_stages
      WHERE agency_id = ${agencyId}
        AND is_won = false
        AND is_lost = false
        AND is_entry = false
      ORDER BY sort_order DESC
      LIMIT 1
    `

    const maxCustomOrder = existingRows[0]?.sort_order ?? 20
    const sortOrder = Math.min(maxCustomOrder + 10, 88)
    const key = slugify(data.label) + '_' + Date.now().toString(36)

    const payload = { agency_id: agencyId, key, label: data.label, color: data.color, sort_order: sortOrder }
    const keys = Object.keys(payload) as unknown as any[]
    const rows = await sql`
      INSERT INTO agency_lead_stages ${sql(payload, ...keys)}
      RETURNING id, key, label, color, sort_order, is_entry, is_won, is_lost
    `
    if (!rows[0]) throw new Error('Insert returned no rows')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function updateAgencyLeadStage(
  stageId: string,
  data: { label?: string; color?: string; sort_order?: number }
) {
  try {
    const keys = Object.keys(data) as unknown as any[]
    const rows = await sql`
      UPDATE agency_lead_stages
      SET ${sql(data, ...keys)}
      WHERE id = ${stageId}
      RETURNING id, key, label, color, sort_order, is_entry, is_won, is_lost
    `
    if (!rows[0]) throw new Error('Not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function deleteAgencyLeadStage(stageId: string) {
  try {
    await sql`
      DELETE FROM agency_lead_stages
      WHERE id = ${stageId}
        AND is_entry = false
        AND is_won = false
        AND is_lost = false
    `
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function reorderAgencyLeadStages(agencyId: string, orderedIds: string[]) {
  try {
    await Promise.all(
      orderedIds.map((id, idx) =>
        sql`UPDATE agency_lead_stages SET sort_order = ${idx * 10} WHERE id = ${id} AND agency_id = ${agencyId}`
      )
    )
    return { error: null }
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

// ─── Patient lead details ──────────────────────────────────────────────────

export interface PatientLeadDetails {
  id?: string
  lead_id: string
  poc_name?: string | null
  poc_phone?: string | null
  poc_relationship?: string | null
  poc_email?: string | null
  reason_for_care?: string | null
  mobility_status?: string | null
  cognitive_status?: string | null
  medical_conditions?: string | null
  gender?: string | null
  date_of_birth?: string | null
  start_date?: string | null
  schedule_type?: string | null
  living_situation?: string | null
  payment_method?: string | null
  insurance_carrier?: string | null
  insurance_policy_number?: string | null
  created_at?: string
  updated_at?: string
}

export async function getPatientLeadDetails(leadId: string) {
  try {
    const rows = await sql`
      SELECT id, lead_id, poc_name, poc_phone, poc_relationship, poc_email,
             reason_for_care, mobility_status, cognitive_status, medical_conditions,
             gender, date_of_birth, start_date, schedule_type, living_situation,
             payment_method, insurance_carrier, insurance_policy_number, created_at, updated_at
      FROM patient_lead_details
      WHERE lead_id = ${leadId}
      LIMIT 1
    `
    return { data: (rows[0] ?? null) as PatientLeadDetails | null, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function upsertPatientLeadDetails(
  leadId: string,
  data: Partial<Omit<PatientLeadDetails, 'id' | 'lead_id' | 'created_at' | 'updated_at'>>
) {
  try {
    const payload = { ...data, lead_id: leadId, updated_at: new Date().toISOString() }
    const keys = Object.keys(payload) as unknown as any[]
    const rows = await sql`
      INSERT INTO patient_lead_details ${sql(payload, ...keys)}
      ON CONFLICT (lead_id) DO UPDATE SET ${sql(payload, ...keys)}
      RETURNING id
    `
    if (!rows[0]) throw new Error('Upsert returned no rows')
    return { data: rows[0] as any, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
