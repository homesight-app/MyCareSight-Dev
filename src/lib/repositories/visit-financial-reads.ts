import 'server-only'
import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'

export type FinancialReadActor={id:string;role:'company_owner'|'care_coordinator';agencyId:string}
class AccessError extends Error{}

export async function withAgencyManagerFinancialRead<T>(run:(actor:FinancialReadActor)=>Promise<T>):Promise<T>{
  const session=await getSession()
  if(!session||!z.uuid().safeParse(session.user.id).success) throw new AccessError('Not authenticated')
  return withActorContext(session.user.id,async()=>{
    const [actor]=await sql<{id:string;role:string;agency_id:string|null}[]>`
      SELECT id,role,agency_id FROM user_profiles WHERE id=${session.user.id}::uuid AND is_active=true
      AND role IN ('company_owner','care_coordinator')`
    if(!actor?.agency_id) throw new AccessError('Forbidden')
    const [membership]=await sql`SELECT 1 FROM user_agency_roles WHERE user_id=${actor.id}::uuid
      AND agency_id=${actor.agency_id}::uuid AND role=${actor.role} AND status='active' LIMIT 1`
    if(!membership) throw new AccessError('Forbidden')
    await sql`SELECT set_config('app.current_user_role',${actor.role},true),set_config('app.current_agency_id',${actor.agency_id},true)`
    return run({id:actor.id,role:actor.role as FinancialReadActor['role'],agencyId:actor.agency_id})
  })
}

export async function readPendingTimeBillingCount():Promise<number>{
  try{return await withAgencyManagerFinancialRead(async actor=>{
    const [row]=await sql<{count:number}[]>`SELECT count(*)::integer count FROM visit_financials
      WHERE agency_id=${actor.agencyId}::uuid AND status='pending'`
    const count=Number(row?.count??0)
    await sql`INSERT INTO audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
      VALUES(${actor.agencyId}::uuid,'visit_financials',NULL,'READ',${actor.id}::uuid,
      ${JSON.stringify({operation:'count_pending_time_billing',result_count:count})}::jsonb)`
    return count
  })}catch{return 0}
}
