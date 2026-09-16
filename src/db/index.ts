import 'server-only'
import postgres from 'postgres'
import { AsyncLocalStorage } from 'async_hooks'

const _sql = postgres(process.env.DATABASE_URL!, {
  ssl: 'require',
  max: 10,
  idle_timeout: 30,
  connect_timeout: 30,
  prepare: false, // required for Neon pooler
})

const _store = new AsyncLocalStorage<any>()

// Intercepts ONLY tagged-template calls (sql`...`). All property accesses
// (sql.begin, sql.unsafe, sql.options, etc.) fall through to _sql directly —
// this avoids accidentally nesting transactions or corrupting structural state.
// All query functions in src/lib/supabase/query/* use the sql`...` form only,
// so the apply-only proxy covers the full query layer without a get-trap.
export const sql = new Proxy(_sql, {
  apply(_target, _thisArg, args) {
    const tx = _store.getStore()
    return tx
      ? (tx as unknown as (...a: unknown[]) => unknown)(...args)
      : (_sql as unknown as (...a: unknown[]) => unknown)(...args)
  },
  get(target, prop, receiver) {
    const tx = _store.getStore()
    if (prop === 'unsafe') {
      const source = tx ?? target
      return source.unsafe.bind(source)
    }
    if (prop === 'begin') return target.begin.bind(target)
    const value = Reflect.get(target, prop, receiver)
    return typeof value === 'function' ? value.bind(target) : value
  },
}) as typeof _sql

export default sql

/**
 * Runs `fn` inside a postgres.js transaction with RLS session variables set via
 * SET LOCAL (transaction-scoped — safe with connection pooling).
 *
 * All sql`...` calls inside fn (including those inside imported query functions)
 * automatically route through the transaction tx via the Proxy above —
 * zero changes needed to the ~550 query functions.
 *
 * withUserContext is exported so server actions can also call it directly
 * once they are audited for Phase 4.5 RLS rollout.
 */
export async function withUserContext<T>(
  userId: string,
  role: string,
  agencyId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  return _sql.begin(async (tx): Promise<any> => {
    await tx`
      SELECT
        set_config('app.current_user_id',  ${userId},         true),
        set_config('app.current_user_role', ${role},           true),
        set_config('app.current_agency_id', ${agencyId ?? ''}, true)
    `
    return _store.run(tx, fn)
  }) as Promise<T>
}
