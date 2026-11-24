import 'server-only'
import { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { authorizeStoredObject, auditStoredObjectAccess } from './authorization'
import { downloadFile, type DownloadedFile } from './client'
import { STORAGE_DOWNLOAD_MAX_BYTES } from './contracts'
import { reportReadFailure } from './diagnostics'

/** Server consumers must not call a browser-relative signing endpoint or fetch stored source URLs. */
export async function readAuthorizedStoredFile(bucket: string, path: string): Promise<DownloadedFile | null> {
  let stage: 'source-session' | 'record-authorization' | 'read-audit' = 'source-session'
  try {
    const session = await getSession()
    if (!session) return null
    const authorized = await withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
      stage = 'record-authorization'
      const object = await authorizeStoredObject(bucket, path)
      if (!object) return false
      stage = 'read-audit'
      await auditStoredObjectAccess(session.user.id, object, 'DOWNLOAD')
      return true
    })
    if (!authorized) return null
    return await downloadFile(bucket, path, STORAGE_DOWNLOAD_MAX_BYTES)
  } catch (error) {
    reportReadFailure(stage, error)
    return null
  }
}
