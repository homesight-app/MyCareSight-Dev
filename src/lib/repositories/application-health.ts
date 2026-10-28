import 'server-only'
import sql from '@/db'

/** Check only the database connection; never return database details to callers. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
