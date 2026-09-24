import 'server-only'

import sql from '@/db'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'
import * as schedules from '@/lib/supabase/query/schedules'
import {
  recurringScheduleCreateSchema,
  recurringScheduleUpdateSchema,
  scheduleCreateSchema,
  scheduleDateRangeSchema,
  scheduleIdSchema,
  scheduleUpdateSchema,
} from '@/lib/schemas/scheduling'

class SchedulingError extends Error {}
const asError = (error:unknown) => new Error(error instanceof SchedulingError
  ? error.message : 'Unable to complete the scheduling request.')

async function audit(actor:{id:string;agencyId:string},recordId:string|null,action:string,operation:string,count?:number){
  await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES(${actor.agencyId}::uuid,'scheduled_visits',${recordId}::uuid,${action},${actor.id}::uuid,
      ${JSON.stringify({operation,...(count===undefined?{}:{count})})}::jsonb)`
}
async function requirePatient(actor:{agencyId:string},patientId:string){
  const [row]=await sql`SELECT id FROM public.patients WHERE id=${patientId}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
  if(!row)throw new SchedulingError('Patient not found in your agency.')
}
async function requireVisit(actor:{agencyId:string},visitId:string){
  const [row]=await sql<{id:string;patient_id:string;visit_series_id:string|null}[]>`SELECT id,patient_id,visit_series_id
    FROM public.scheduled_visits WHERE id=${visitId}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
  if(!row)throw new SchedulingError('Visit not found in your agency.')
  return row
}
async function validateLinks(actor:{agencyId:string},patientId:string,input:{
  caregiver_id?:string|null;contract_id?:string|null;patient_address_id?:string|null
}){
  if(input.caregiver_id){const [row]=await sql`SELECT id FROM public.caregiver_members
    WHERE id=${input.caregiver_id}::uuid AND agency_id=${actor.agencyId}::uuid LIMIT 1`
    if(!row)throw new SchedulingError('Caregiver not found in your agency.')}
  if(input.contract_id){const [row]=await sql`SELECT id FROM public.patient_service_contracts
    WHERE id=${input.contract_id}::uuid AND agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid LIMIT 1`
    if(!row)throw new SchedulingError('Service contract does not belong to this patient.')}
  if(input.patient_address_id){const [row]=await sql`SELECT id FROM public.patient_addresses
    WHERE id=${input.patient_address_id}::uuid AND agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid LIMIT 1`
    if(!row)throw new SchedulingError('Address does not belong to this patient.')}
}
const ensure = <T extends {error:unknown;data?:unknown}>(result:T):T => {
  if(result.error)throw new SchedulingError(result.error instanceof Error?result.error.message:
    typeof result.error==='object'&&result.error&&'message' in result.error?String(result.error.message):String(result.error))
  return result
}

export async function managerGetSchedulesByPatient(patientId:string){
  if(!scheduleIdSchema.safeParse(patientId).success)return {data:null,error:new Error('Invalid patient.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requirePatient(actor,patientId)
    const result=ensure(await schedules.getSchedulesByPatientId(patientId));await audit(actor,patientId,'READ','read_patient_schedules',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerGetSchedulesByPatientAndRange(patientId:string,startDate:string,endDate:string){
  if(!scheduleIdSchema.safeParse(patientId).success||!scheduleDateRangeSchema.safeParse({startDate,endDate}).success)return {data:null,error:new Error('Invalid schedule range.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requirePatient(actor,patientId)
    const result=ensure(await schedules.getSchedulesByPatientIdAndDateRange(patientId,startDate,endDate));await audit(actor,patientId,'READ','read_patient_schedule_range',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerGetSchedulesByAgencyAndRange(agencyId:string,startDate:string,endDate:string){
  if(!scheduleIdSchema.safeParse(agencyId).success||!scheduleDateRangeSchema.safeParse({startDate,endDate}).success)return {data:null,error:new Error('Invalid schedule range.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{if(actor.agencyId!==agencyId)throw new SchedulingError('Forbidden')
    const result=ensure(await schedules.getScheduledVisitsAsScheduleRowsForAgencyAndDateRange(agencyId,startDate,endDate));await audit(actor,null,'READ','read_agency_schedule_range',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerGetSchedulesByIds(ids:string[]){
  const clean=Array.from(new Set(ids));if(clean.some(id=>!scheduleIdSchema.safeParse(id).success))return {data:null,error:new Error('Invalid visit.')}
  if(clean.length===0)return {data:[],error:null}
  try{return await withAgencyManagerFinancialRead(async actor=>{const owned=await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
    WHERE id=ANY(${clean}::uuid[]) AND agency_id=${actor.agencyId}::uuid ORDER BY id`
    if(owned.length!==clean.length)throw new SchedulingError('One or more visits were not found in your agency.')
    const result=ensure(await schedules.getScheduledVisitsByIdsAsScheduleRows(clean));await audit(actor,null,'READ','read_schedules_by_id',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerInsertSchedule(input:Parameters<typeof schedules.insertSchedule>[0]){
  const parsed=scheduleCreateSchema.safeParse(input);if(!parsed.success)return {data:null,error:new Error(parsed.error.issues[0]?.message??'Invalid schedule.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requirePatient(actor,parsed.data.patient_id);await validateLinks(actor,parsed.data.patient_id,parsed.data)
    const result=ensure(await schedules.insertSchedule(parsed.data));await audit(actor,result.data?.id??null,'INSERT','create_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerInsertRecurringSchedules(input:Parameters<typeof schedules.insertRecurringSchedulesFromSeries>[0]){
  const parsed=recurringScheduleCreateSchema.safeParse(input);if(!parsed.success)return {data:null,error:new Error(parsed.error.issues[0]?.message??'Invalid recurring schedule.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requirePatient(actor,parsed.data.patient_id);await validateLinks(actor,parsed.data.patient_id,parsed.data)
    const result=ensure(await schedules.insertRecurringSchedulesFromSeries(parsed.data));await audit(actor,null,'INSERT','create_recurring_schedules',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerUpdateSchedule(id:string,input:Parameters<typeof schedules.updateSchedule>[1]){
  const parsedId=scheduleIdSchema.safeParse(id),parsed=scheduleUpdateSchema.safeParse(input)
  if(!parsedId.success||!parsed.success)return {data:null,error:new Error(parsed.success?'Invalid visit.':parsed.error.issues[0]?.message??'Invalid visit.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{const visit=await requireVisit(actor,id);await validateLinks(actor,visit.patient_id,parsed.data)
    const result=ensure(await schedules.updateSchedule(id,parsed.data));await audit(actor,id,'UPDATE','update_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerUpdateRecurringSchedules(input:Parameters<typeof schedules.updateRecurringSchedulesByScope>[0]){
  const parsed=recurringScheduleUpdateSchema.safeParse(input);if(!parsed.success)return {updated_ids:[],error:{message:parsed.error.issues[0]?.message??'Invalid recurring update.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const seed=await requireVisit(actor,parsed.data.seed_schedule_id)
    if(seed.visit_series_id)await sql`SELECT id FROM public.scheduled_visits WHERE agency_id=${actor.agencyId}::uuid
      AND visit_series_id=${seed.visit_series_id}::uuid ORDER BY id FOR UPDATE`
    const result=await schedules.updateRecurringSchedulesByScope(parsed.data);if(result.error)throw new SchedulingError(result.error.message)
    await audit(actor,parsed.data.seed_schedule_id,'UPDATE','update_recurring_schedules',result.updated_ids.length);return result})
  }catch(error){return {updated_ids:[],error:{message:error instanceof SchedulingError?error.message:'Unable to update recurring visits. No changes were saved.'}}}
}
export async function managerDeleteSchedule(id:string){
  if(!scheduleIdSchema.safeParse(id).success)return {data:null,error:new Error('Invalid visit.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requireVisit(actor,id)
    const result=ensure(await schedules.deleteSchedule(id));await audit(actor,id,'DELETE','delete_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
