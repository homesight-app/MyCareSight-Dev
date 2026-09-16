import sql from '@/db'

const LICENSE_COLS = 'id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id'
const LICENSE_DOC_COLS = 'id, license_id, document_name, document_url, document_type, created_at, expiry_date'

/** Insert a license and return the created row. */
export async function insertLicenseReturning(
  data: Record<string, unknown>
) {
  try {
    const rows = await sql`INSERT INTO licenses ${sql(data, ...Object.keys(data) as any)} RETURNING id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert a license_document. */
export async function insertLicenseDocument(
  data: Record<string, unknown>
) {
  try {
    await sql`INSERT INTO license_documents ${sql(data, ...Object.keys(data) as any)}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Update license by id (e.g. expiry_date). */
export async function updateLicenseById(
  licenseId: string,
  data: Record<string, unknown>
) {
  try {
    await sql`UPDATE licenses SET ${sql(data, ...Object.keys(data) as any)} WHERE id = ${licenseId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get latest license_document by license_id (document_url, document_name). */
export async function getLatestLicenseDocumentByLicenseId(
  licenseId: string
) {
  try {
    const rows = await sql`SELECT document_url, document_name FROM license_documents WHERE license_id = ${licenseId} ORDER BY created_at DESC LIMIT 1`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get licenses by company_owner_id. */
export async function getLicensesByCompanyOwnerId(companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE company_owner_id = ${companyOwnerId}`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get licenses by company_owner_id ordered by expiry_date asc. */
export async function getLicensesByCompanyOwnerIdOrdered(companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE company_owner_id = ${companyOwnerId} ORDER BY expiry_date ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license_documents license_id (for document counts). */
export async function getLicenseDocumentLicenseIds() {
  try {
    const rows = await sql`SELECT license_id FROM license_documents`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license_documents by license ids (for document counts). */
export async function getLicenseDocumentsByLicenseIds(licenseIds: string[]) {
  if (licenseIds.length === 0) return { data: [], error: null }
  try {
    const rows = await sql`SELECT license_id FROM license_documents WHERE license_id = ANY(${licenseIds as any})`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license by id. */
export async function getLicenseById(licenseId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE id = ${licenseId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license by id and company_owner_id (for dashboard detail). */
export async function getLicenseByIdAndOwner(licenseId: string, companyOwnerId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE id = ${licenseId} AND company_owner_id = ${companyOwnerId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all licenses for an agency (agency-centric view for admin/expert). */
export async function getLicensesByAgencyId(agencyId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE agency_id = ${agencyId} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get licenses by agency_id ordered by expiry_date asc. */
export async function getLicensesByAgencyIdOrdered(agencyId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE agency_id = ${agencyId} ORDER BY expiry_date ASC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license by id and agency_id (for detail page authorization). */
export async function getLicenseByIdAndAgencyId(licenseId: string, agencyId: string) {
  try {
    const rows = await sql`SELECT id, company_owner_id, state, license_name, license_number, status, activated_date, expiry_date, renewal_due_date, created_at, updated_at, agency_id, issuing_body, first_issued_date, previous_version_id, category_id, subcategory_id FROM licenses WHERE id = ${licenseId} AND agency_id = ${agencyId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get license_documents by license_id. */
export async function getLicenseDocumentsByLicenseId(licenseId: string) {
  try {
    const rows = await sql`SELECT id, license_id, document_name, document_url, document_type, created_at, expiry_date FROM license_documents WHERE license_id = ${licenseId} ORDER BY created_at DESC`
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get all certifications for an agency with linked programs (for the Certifications tab). */
export async function getAgencyCertificationsWithHistory(agencyId: string) {
  try {
    const rows = await sql`
      SELECT
        l.id, l.agency_id, l.company_owner_id, l.license_name, l.license_number, l.state, l.status,
        l.activated_date, l.first_issued_date, l.expiry_date, l.renewal_due_date,
        l.issuing_body, l.previous_version_id, l.created_at, l.updated_at,
        json_build_object('id', cat.id, 'name', cat.name) AS category,
        json_build_object('id', sub.id, 'name', sub.name) AS subcategory,
        COALESCE(json_agg(
          DISTINCT jsonb_build_object(
            'id', ca.id,
            'link_type', ca.link_type,
            'linked_at', ca.linked_at,
            'applications', json_build_object(
              'id', app.id, 'status', app.status, 'application_name', app.application_name,
              'created_at', app.created_at, 'started_date', app.started_date
            )
          )
        ) FILTER (WHERE ca.id IS NOT NULL), '[]') AS certification_applications,
        COALESCE(json_agg(
          DISTINCT jsonb_build_object(
            'id', ld.id, 'document_name', ld.document_name, 'document_url', ld.document_url,
            'document_type', ld.document_type, 'created_at', ld.created_at
          )
        ) FILTER (WHERE ld.id IS NOT NULL), '[]') AS license_documents
      FROM licenses l
      LEFT JOIN configuration_values cat ON cat.id = l.category_id
      LEFT JOIN configuration_values sub ON sub.id = l.subcategory_id
      LEFT JOIN certification_applications ca ON ca.certification_id = l.id
      LEFT JOIN applications app ON app.id = ca.application_id
      LEFT JOIN license_documents ld ON ld.license_id = l.id
      WHERE l.agency_id = ${agencyId}
      GROUP BY l.id, cat.id, sub.id
      ORDER BY l.created_at DESC
    `
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Fetch a single license_document row to get its storage path before deletion. */
export async function getLicenseDocumentUrlById(documentId: string) {
  try {
    const rows = await sql`SELECT id, document_url FROM license_documents WHERE id = ${documentId}`
    if (!rows.length) return { data: null, error: new Error('Not found') }
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Delete a license_document record by id. */
export async function deleteLicenseDocumentById(documentId: string) {
  try {
    await sql`DELETE FROM license_documents WHERE id = ${documentId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get agency programs (playbook-based) that can be linked to a certification (not yet linked, agency-scoped). */
export async function getAgencyApplicationsForLinking(agencyId: string, excludeApplicationIds: string[]) {
  try {
    let rows: Record<string, unknown>[]
    if (excludeApplicationIds.length > 0) {
      rows = await sql`SELECT id, application_name, status, started_date, license_type_id FROM applications WHERE agency_id = ${agencyId} AND playbook_id IS NOT NULL AND id != ALL(${excludeApplicationIds as any}) ORDER BY created_at DESC`
    } else {
      rows = await sql`SELECT id, application_name, status, started_date, license_type_id FROM applications WHERE agency_id = ${agencyId} AND playbook_id IS NOT NULL ORDER BY created_at DESC`
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Get agency certifications that can be linked to a program (not yet linked, agency-scoped). */
export async function getAgencyCertificationsForLinking(agencyId: string, excludeCertificationIds: string[]) {
  try {
    let rows: Record<string, unknown>[]
    if (excludeCertificationIds.length > 0) {
      rows = await sql`SELECT id, license_name, license_number, status, expiry_date FROM licenses WHERE agency_id = ${agencyId} AND id != ALL(${excludeCertificationIds as any}) ORDER BY license_name ASC`
    } else {
      rows = await sql`SELECT id, license_name, license_number, status, expiry_date FROM licenses WHERE agency_id = ${agencyId} ORDER BY license_name ASC`
    }
    return { data: rows as unknown as any[], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Insert a certification_applications link row. */
export async function insertCertificationApplication(
  data: { certification_id: string; application_id: string; link_type: 'created_from' | 'renewal_of'; linked_by: string }
) {
  try {
    const rows = await sql`INSERT INTO certification_applications ${sql(data as Record<string, unknown>, ...Object.keys(data) as any)} RETURNING *`
    return { data: (rows as unknown as any[])[0], error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}

/** Delete a certification_applications link row. */
export async function deleteCertificationApplication(
  certificationId: string,
  applicationId: string
) {
  try {
    await sql`DELETE FROM certification_applications WHERE certification_id = ${certificationId} AND application_id = ${applicationId}`
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: err as Error }
  }
}
