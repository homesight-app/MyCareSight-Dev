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
  scheduleReplacementSchema,
  type ScheduleReplacementInput,
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
  const [row]=await sql<{id:string;patient_id:string;visit_series_id:string|null;caregiver_member_id:string|null}[]>`SELECT id,patient_id,visit_series_id,caregiver_member_id
    FROM public.scheduled_visits WHERE id=${visitId}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
  if(!row)throw new SchedulingError('Visit not found in your agency.')
  return row
}
async function validateLinks(actor:{agencyId:string},patientId:string,input:{
  caregiver_id?:string|null;contract_id?:string|null;patient_address_id?:string|null
}){
  if(input.caregiver_id){const [row]=await sql`SELECT id FROM public.caregiver_members
    WHERE id=${input.caregiver_id}::uuid AND agency_id=${actor.agencyId}::uuid AND status='active' FOR UPDATE`
    if(!row)throw new SchedulingError('An active caregiver was not found in your agency.')}
  if(input.contract_id){const [row]=await sql`SELECT id FROM public.patient_service_contracts
    WHERE id=${input.contract_id}::uuid AND agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid LIMIT 1`
    if(!row)throw new SchedulingError('Service contract does not belong to this patient.')}
  if(input.patient_address_id){const [row]=await sql`SELECT id FROM public.patient_addresses
    WHERE id=${input.patient_address_id}::uuid AND agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid LIMIT 1`
    if(!row)throw new SchedulingError('Address does not belong to this patient.')}
}

async function lockCaregivers(actor:{agencyId:string},caregiverIds:string[]){
  const clean=Array.from(new Set(caregiverIds.filter(Boolean))).sort()
  if(clean.length===0)return
  const rows=await sql<{id:string}[]>`SELECT id FROM public.caregiver_members
    WHERE agency_id=${actor.agencyId}::uuid AND status='active' AND id=ANY(${clean}::uuid[])
    ORDER BY id FOR UPDATE`
  if(rows.length!==clean.length)throw new SchedulingError('One or more active caregivers were not found in your agency.')
}

async function assertAssignmentIntegrity(actor:{agencyId:string},visitIds:string[]){
  const clean=Array.from(new Set(visitIds.filter(Boolean)))
  if(clean.length===0)return
  const [missingTime]=await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
    WHERE agency_id=${actor.agencyId}::uuid AND id=ANY(${clean}::uuid[])
      AND caregiver_member_id IS NOT NULL
      AND status IN ('scheduled','in_progress','on_hold')
      AND (visit_date IS NULL OR scheduled_start_time IS NULL OR scheduled_end_time IS NULL)
    LIMIT 1`
  if(missingTime)throw new SchedulingError('Set a start and end time before assigning a caregiver.')

  const [outsideAvailability]=await sql<{id:string}[]>`SELECT visit.id
    FROM public.scheduled_visits visit
    WHERE visit.agency_id=${actor.agencyId}::uuid AND visit.id=ANY(${clean}::uuid[])
      AND visit.caregiver_member_id IS NOT NULL
      AND visit.status IN ('scheduled','in_progress','on_hold')
      AND NOT EXISTS (
        SELECT 1 FROM public.caregiver_availability_slots slot
        WHERE (slot.agency_id=visit.agency_id OR slot.agency_id IS NULL)
          AND slot.caregiver_member_id=visit.caregiver_member_id
          AND slot.start_time<=visit.scheduled_start_time
          AND slot.end_time>=visit.scheduled_end_time
          AND (
            (slot.is_recurring=true
              AND extract(dow FROM visit.visit_date)::integer=ANY(slot.days_of_week)
              AND (slot.repeat_start IS NULL OR slot.repeat_start<=visit.visit_date)
              AND (slot.repeat_end IS NULL OR slot.repeat_end>=visit.visit_date))
            OR (slot.is_recurring=false AND slot.specific_date=visit.visit_date)
          )
      )
    LIMIT 1`
  if(outsideAvailability)throw new SchedulingError('The caregiver is not available for the full visit time.')

  const [conflict]=await sql<{id:string;conflict_id:string}[]>`SELECT visit.id, other.id AS conflict_id
    FROM public.scheduled_visits visit
    JOIN public.scheduled_visits other
      ON other.agency_id=visit.agency_id
     AND other.caregiver_member_id=visit.caregiver_member_id
     AND other.id<>visit.id
     AND other.status IN ('scheduled','in_progress','on_hold')
     AND (visit.visit_date + visit.scheduled_start_time)
          < (COALESCE(other.scheduled_end_date,other.visit_date) + other.scheduled_end_time)
     AND (COALESCE(visit.scheduled_end_date,visit.visit_date) + visit.scheduled_end_time)
          > (other.visit_date + other.scheduled_start_time)
    WHERE visit.agency_id=${actor.agencyId}::uuid AND visit.id=ANY(${clean}::uuid[])
      AND visit.caregiver_member_id IS NOT NULL
      AND visit.status IN ('scheduled','in_progress','on_hold')
    LIMIT 1`
  if(conflict)throw new SchedulingError('The caregiver is already assigned to an overlapping visit.')
}

async function assertPatientScheduleIntegrity(actor:{agencyId:string},patientId:string,visitIds:string[]){
  const clean=Array.from(new Set(visitIds.filter(Boolean)))
  if(clean.length===0)return
  const [conflict]=await sql<{id:string;conflict_id:string}[]>`SELECT visit.id,other.id conflict_id
    FROM public.scheduled_visits visit
    JOIN public.scheduled_visits other
      ON other.agency_id=visit.agency_id AND other.patient_id=visit.patient_id AND other.id<>visit.id
     AND other.status NOT IN ('missed','cancelled','voided')
     AND other.visit_date+COALESCE(other.scheduled_start_time,'00:00'::time)
          < COALESCE(visit.scheduled_end_date,visit.visit_date)+COALESCE(visit.scheduled_end_time,'23:59'::time)
     AND visit.visit_date+COALESCE(visit.scheduled_start_time,'00:00'::time)
          < COALESCE(other.scheduled_end_date,other.visit_date)+COALESCE(other.scheduled_end_time,'23:59'::time)
    WHERE visit.agency_id=${actor.agencyId}::uuid AND visit.patient_id=${patientId}::uuid
      AND visit.id=ANY(${clean}::uuid[])
    LIMIT 1`
  if(conflict)throw new SchedulingError('The client schedule changed and now overlaps another visit. Refresh and try again.')
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
    const result=ensure(await schedules.insertSchedule(parsed.data));if(result.data?.id)await assertAssignmentIntegrity(actor,[result.data.id]);await audit(actor,result.data?.id??null,'INSERT','create_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerInsertRecurringSchedules(input:Parameters<typeof schedules.insertRecurringSchedulesFromSeries>[0]){
  const parsed=recurringScheduleCreateSchema.safeParse(input);if(!parsed.success)return {data:null,error:new Error(parsed.error.issues[0]?.message??'Invalid recurring schedule.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requirePatient(actor,parsed.data.patient_id);await validateLinks(actor,parsed.data.patient_id,parsed.data)
    const result=ensure(await schedules.insertRecurringSchedulesFromSeries(parsed.data));await assertAssignmentIntegrity(actor,(result.data??[]).map(row=>row.id));await audit(actor,null,'INSERT','create_recurring_schedules',result.data?.length??0);return result})
  }catch(error){return {data:null,error:asError(error)}}
}

export async function managerReplaceSchedules(input:ScheduleReplacementInput){
  const parsed=scheduleReplacementSchema.safeParse(input)
  if(!parsed.success)return {data:null,error:new Error(parsed.error.issues[0]?.message??'Invalid replacement schedule.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{
    const patientId=parsed.data.kind==='single'?parsed.data.visits[0]!.patient_id:parsed.data.visit.patient_id
    if(parsed.data.kind==='single'&&parsed.data.visits.some(visit=>visit.patient_id!==patientId)){
      throw new SchedulingError('All replacement visits must belong to the same client.')
    }
    await requirePatient(actor,patientId)
    if(parsed.data.kind==='single'){
      for(const visit of parsed.data.visits)await validateLinks(actor,patientId,visit)
    }else await validateLinks(actor,patientId,parsed.data.visit)
    const replaceIds=Array.from(new Set(parsed.data.replaceVisitIds))
    if(replaceIds.length){const owned=await sql<{id:string}[]>`SELECT id FROM public.scheduled_visits
      WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid AND id=ANY(${replaceIds}::uuid[])
      ORDER BY id FOR UPDATE`
      if(owned.length!==replaceIds.length)throw new SchedulingError('One or more replacement visits were not found for this client.')
      for(const id of replaceIds)ensure(await schedules.deleteSchedule(id))}
    let createdIds:string[]=[]
    if(parsed.data.kind==='recurring'){
      const result=ensure(await schedules.insertRecurringSchedulesFromSeries(parsed.data.visit))
      createdIds=(result.data??[]).map(row=>row.id)
    }else{
      for(const visit of parsed.data.visits){
        const result=ensure(await schedules.insertSchedule(visit))
        if(result.data?.id)createdIds.push(result.data.id)
      }
    }
    await assertPatientScheduleIntegrity(actor,patientId,createdIds)
    await assertAssignmentIntegrity(actor,createdIds)
    await audit(actor,null,'REPLACE','replace_client_schedules',createdIds.length)
    return {data:{createdIds,replacedCount:replaceIds.length},error:null}
  })}catch(error){return {data:null,error:asError(error)}}
}
export async function managerUpdateSchedule(id:string,input:Parameters<typeof schedules.updateSchedule>[1]){
  const parsedId=scheduleIdSchema.safeParse(id),parsed=scheduleUpdateSchema.safeParse(input)
  if(!parsedId.success||!parsed.success)return {data:null,error:new Error(parsed.success?'Invalid visit.':parsed.error.issues[0]?.message??'Invalid visit.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{const visit=await requireVisit(actor,id);await validateLinks(actor,visit.patient_id,{...parsed.data,caregiver_id:parsed.data.caregiver_id===undefined?visit.caregiver_member_id:parsed.data.caregiver_id})
    const result=ensure(await schedules.updateSchedule(id,parsed.data));await assertAssignmentIntegrity(actor,[id]);await audit(actor,id,'UPDATE','update_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
export async function managerUpdateRecurringSchedules(input:Parameters<typeof schedules.updateRecurringSchedulesByScope>[0]){
  const parsed=recurringScheduleUpdateSchema.safeParse(input);if(!parsed.success)return {updated_ids:[],error:{message:parsed.error.issues[0]?.message??'Invalid recurring update.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const seed=await requireVisit(actor,parsed.data.seed_schedule_id)
    if(seed.visit_series_id){await sql`SELECT id FROM public.scheduled_visits WHERE agency_id=${actor.agencyId}::uuid
      AND visit_series_id=${seed.visit_series_id}::uuid ORDER BY id FOR UPDATE`
      if(parsed.data.patch.caregiver_id===undefined){const caregivers=await sql<{caregiver_member_id:string}[]>`SELECT DISTINCT caregiver_member_id
        FROM public.scheduled_visits WHERE agency_id=${actor.agencyId}::uuid AND visit_series_id=${seed.visit_series_id}::uuid
          AND caregiver_member_id IS NOT NULL`;await lockCaregivers(actor,caregivers.map(row=>row.caregiver_member_id))}}
    if(parsed.data.patch.caregiver_id)await lockCaregivers(actor,[parsed.data.patch.caregiver_id])
    const result=await schedules.updateRecurringSchedulesByScope(parsed.data);if(result.error)throw new SchedulingError(result.error.message)
    await assertAssignmentIntegrity(actor,result.updated_ids);await audit(actor,parsed.data.seed_schedule_id,'UPDATE','update_recurring_schedules',result.updated_ids.length);return result})
  }catch(error){return {updated_ids:[],error:{message:error instanceof SchedulingError?error.message:'Unable to update recurring visits. No changes were saved.'}}}
}
export async function managerDeleteSchedule(id:string){
  if(!scheduleIdSchema.safeParse(id).success)return {data:null,error:new Error('Invalid visit.')}
  try{return await withAgencyManagerFinancialRead(async actor=>{await requireVisit(actor,id)
    const result=ensure(await schedules.deleteSchedule(id));await audit(actor,id,'DELETE','delete_schedule');return result})
  }catch(error){return {data:null,error:asError(error)}}
}
