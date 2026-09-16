import sql from '@/db'

export async function getTemplates(
  opts: {
    type?: 'document' | 'email'
    category?: string
    agencyId?: string
    search?: string
    includeInactive?: boolean
  } = {}
) {
  try {
    const inactiveCond = opts.includeInactive ? sql`` : sql`AND t.is_active = TRUE`
    const typeCond     = opts.type     ? sql`AND t.type = ${opts.type}`         : sql``
    const categoryCond = opts.category ? sql`AND t.category = ${opts.category}` : sql``
    const agencyCond   = opts.agencyId
      ? sql`AND (t.is_global = TRUE OR t.agency_id = ${opts.agencyId})`
      : sql``
    const searchCond   = opts.search
      ? sql`AND t.name ILIKE ${'%' + opts.search.trim() + '%'}`
      : sql``

    const rows = await sql`
      SELECT
        t.id,
        t.name,
        t.type,
        t.category,
        t.description,
        t.subject,
        t.variables_used,
        t.is_global,
        t.agency_id,
        t.created_by,
        t.is_active,
        t.created_at,
        t.updated_at,
        json_build_object('id', a.id, 'name', a.name) AS agency
      FROM templates t
      LEFT JOIN agencies a ON a.id = t.agency_id
      WHERE TRUE
        ${inactiveCond}
        ${typeCond}
        ${categoryCond}
        ${agencyCond}
        ${searchCond}
      ORDER BY t.is_global DESC, t.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}

export async function getTemplateById(id: string) {
  try {
    const rows = await sql`
      SELECT
        id,
        name,
        type,
        category,
        description,
        subject,
        content,
        variables_used,
        is_global,
        agency_id,
        created_by,
        is_active,
        created_at,
        updated_at
      FROM templates
      WHERE id = ${id}
    `
    if (!rows[0]) throw new Error('Row not found')
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: '', details: '', hint: '', name: 'Error' } }
  }
}
