import 'server-only'
import sql from '@/db'
import { databaseTimestamp } from '@/lib/database-date-contract'

/** Both metadata commit and orphan cleanup must hold this transaction-scoped lock. */
export async function lockAgencyDocumentUpload(path: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'agency-document/' + path}, 0))`
}

/** Caller has authorized the agency and holds the upload lock; never loads a collection. */
export async function findAgencyDocumentUpload(agencyId: string, path: string) {
  const rows = await sql<{
    id: string; document_name: string; file_url: string; file_name: string | null;
    document_type: string | null; created_at: Date | string;
  }[]>`
    SELECT id, document_name, file_url, file_name, document_type, created_at
    FROM public.agency_documents
    WHERE agency_id = ${agencyId}::uuid AND file_url = ${path}
    LIMIT 1
  `
  return rows[0] ? { ...rows[0], created_at: databaseTimestamp(rows[0].created_at) } : null
}
