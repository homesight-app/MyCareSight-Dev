import 'server-only'
import sql from '@/db'
import { withAgencyManagerFinancialRead } from '@/lib/repositories/visit-financial-reads'
import { contractIdSchema,serviceContractCreateSchema,serviceContractDetailsSchema,weeklyHoursCreateSchema } from '@/lib/schemas/patient-service-contracts'
export type PatientServiceContractRow = {
  id:string;patient_id:string;contract_name:string|null;contract_type:string;
  service_type:'non_skilled'|'skilled';billing_code_id:string|null;bill_rate:number|null;
  bill_unit_type:'hour'|'visit'|'15_min_unit';weekly_hours_limit:number|null;
  effective_date:string;end_date:string|null;status:string;note:string|null;
  created_at:string;updated_at?:string;bill_mileage?:boolean;mileage_bill_rate_per_mile?:number|null
}
export type PatientContractedHoursRow = {id:string;patient_id:string;total_hours:number;effective_date:string;
  end_date:string|null;note:string|null;created_at:string;updated_at:string}

type Result<T>={data:T|null;error:null|{message:string}}
type Actor={id:string;agencyId:string}
class ContractError extends Error{}
const fail=<T>(error:unknown):Result<T>=>({data:null,error:{message:error instanceof ContractError?error.message:'Unable to save the service contract.'}})
const mapWeekly=(r:PatientServiceContractRow):PatientContractedHoursRow=>({id:r.id,patient_id:r.patient_id,
  total_hours:Number(r.weekly_hours_limit??0),effective_date:r.effective_date,end_date:r.end_date,note:r.note,
  created_at:r.created_at,updated_at:r.updated_at??r.created_at})

async function patient(actor:Actor,id:string){
  const [row]=await sql<{id:string}[]>`SELECT id FROM public.patients WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
  if(!row)throw new ContractError('Patient not found in your agency.')
}
async function audit(actor:Actor,id:string|null,action:string,operation:string){
  await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details)
    VALUES(${actor.agencyId}::uuid,'patient_service_contracts',${id}::uuid,${action},${actor.id}::uuid,
      ${JSON.stringify({operation})}::jsonb)`
}
async function reconcile(actor:Actor,patientId:string){
  await sql`UPDATE public.patient_service_contracts SET status='scheduled',updated_at=now()
    WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid
      AND contract_type<>'weekly_hours' AND status='active' AND effective_date>current_date`
  await sql`WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY service_type
      ORDER BY effective_date DESC,created_at DESC,id DESC) place
      FROM public.patient_service_contracts WHERE agency_id=${actor.agencyId}::uuid
      AND patient_id=${patientId}::uuid AND contract_type<>'weekly_hours'
      AND status IN ('active','scheduled') AND effective_date<=current_date
      AND (end_date IS NULL OR end_date>=current_date))
    UPDATE public.patient_service_contracts c SET status=CASE WHEN r.place=1 THEN 'active' ELSE 'inactive' END,updated_at=now()
    FROM ranked r WHERE c.id=r.id AND c.status<>CASE WHEN r.place=1 THEN 'active' ELSE 'inactive' END`
  await sql`UPDATE public.patient_service_contracts SET status='inactive',updated_at=now()
    WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid
      AND contract_type<>'weekly_hours' AND status='active'
      AND NOT(effective_date<=current_date AND (end_date IS NULL OR end_date>=current_date))`
}
async function rows(actor:Actor,patientId:string,weekly:boolean){
  return sql<PatientServiceContractRow[]>`SELECT id,patient_id,contract_name,contract_type,service_type,billing_code_id,
    bill_rate,bill_unit_type,weekly_hours_limit,effective_date::text,end_date::text,status,note,created_at::text,
    updated_at::text,bill_mileage,mileage_bill_rate_per_mile FROM public.patient_service_contracts
    WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid
      AND (${weekly} = (contract_type = 'weekly_hours')) ORDER BY effective_date DESC,created_at DESC`
}

export async function readServiceContracts(patientId:string):Promise<Result<PatientServiceContractRow[]>>{
  if(!contractIdSchema.safeParse(patientId).success)return {data:null,error:{message:'Invalid patient.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{await patient(actor,patientId);await reconcile(actor,patientId);const data=await rows(actor,patientId,false)
    await audit(actor,patientId,'READ','read_service_contracts');return {data,error:null}})}catch(e){return fail(e)}
}
export async function readWeeklyHours(patientId:string):Promise<Result<PatientContractedHoursRow[]>>{
  if(!contractIdSchema.safeParse(patientId).success)return {data:null,error:{message:'Invalid patient.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{await patient(actor,patientId);const data=(await rows(actor,patientId,true)).map(mapWeekly)
    await audit(actor,patientId,'READ','read_weekly_hours');return {data,error:null}})}catch(e){return fail(e)}
}

export async function createServiceContract(input:unknown):Promise<Result<PatientServiceContractRow>>{
  const parsed=serviceContractCreateSchema.safeParse(input);if(!parsed.success)return {data:null,error:{message:parsed.error.issues[0]?.message??'Invalid contract.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const d=parsed.data;await patient(actor,d.patient_id)
    await sql`SELECT id FROM public.patient_service_contracts WHERE agency_id=${actor.agencyId}::uuid
      AND patient_id=${d.patient_id}::uuid ORDER BY id FOR UPDATE`
    if(d.billing_code_id){const [code]=await sql`SELECT id FROM public.billing_codes WHERE id=${d.billing_code_id}::uuid LIMIT 1`;if(!code)throw new ContractError('Billing code not found.')}
    const [next]=await sql<{effective_date:string}[]>`SELECT effective_date::text FROM public.patient_service_contracts
      WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${d.patient_id}::uuid AND contract_type=${d.contract_type}
      AND service_type=${d.service_type} AND effective_date>${d.effective_date}::date ORDER BY effective_date LIMIT 1`
    const end=d.end_date&&next?.effective_date?(d.end_date<next.effective_date?d.end_date:next.effective_date):(d.end_date??next?.effective_date??null)
    await sql`UPDATE public.patient_service_contracts SET end_date=${d.effective_date}::date,updated_at=now()
      WHERE id=(SELECT id FROM public.patient_service_contracts WHERE agency_id=${actor.agencyId}::uuid
       AND patient_id=${d.patient_id}::uuid AND contract_type=${d.contract_type} AND service_type=${d.service_type}
       AND effective_date<${d.effective_date}::date AND (end_date IS NULL OR end_date>${d.effective_date}::date)
       ORDER BY effective_date DESC LIMIT 1)`
    const status=d.contract_type==='weekly_hours'?'active':d.effective_date>new Date().toISOString().slice(0,10)?'scheduled':'active'
    if(status==='active'&&d.contract_type!=='weekly_hours')await sql`UPDATE public.patient_service_contracts SET status='inactive',updated_at=now()
      WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${d.patient_id}::uuid AND service_type=${d.service_type}
       AND contract_type<>'weekly_hours' AND status='active'`
    const [created]=await sql<PatientServiceContractRow[]>`INSERT INTO public.patient_service_contracts
      (agency_id,patient_id,contract_name,contract_type,service_type,billing_code_id,bill_rate,bill_unit_type,
       weekly_hours_limit,effective_date,end_date,status,note,bill_mileage,mileage_bill_rate_per_mile)
      VALUES(${actor.agencyId}::uuid,${d.patient_id}::uuid,${d.contract_name??null},${d.contract_type},${d.service_type},
       ${d.billing_code_id??null}::uuid,${d.bill_rate??null},${d.bill_unit_type},${d.weekly_hours_limit??null},
       ${d.effective_date}::date,${end}::date,${status},${d.note??null},${d.bill_mileage??false},${d.mileage_bill_rate_per_mile??null}) RETURNING *`
    if(!created)throw new Error('insert failed');if(d.contract_type!=='weekly_hours')await reconcile(actor,d.patient_id)
    await audit(actor,created.id,'INSERT','create_service_contract');const [saved]=await rows(actor,d.patient_id,d.contract_type==='weekly_hours')
    return {data:saved?.id===created.id?saved:created,error:null}
  })}catch(e){return fail(e)}
}

export async function createWeeklyHours(input:unknown):Promise<Result<PatientContractedHoursRow>>{
  const p=weeklyHoursCreateSchema.safeParse(input);if(!p.success)return {data:null,error:{message:p.error.issues[0]?.message??'Invalid weekly hours.'}}
  const result=await createServiceContract({...p.data,contract_name:null,contract_type:'weekly_hours',service_type:'non_skilled',
    billing_code_id:null,bill_rate:null,bill_unit_type:'hour',weekly_hours_limit:p.data.total_hours,bill_mileage:false,mileage_bill_rate_per_mile:null})
  return result.data?{data:mapWeekly(result.data),error:null}:{data:null,error:result.error}
}

export async function updateContractDetails(id:string,input:unknown):Promise<Result<PatientServiceContractRow>>{
  const pid=contractIdSchema.safeParse(id),p=serviceContractDetailsSchema.safeParse(input);if(!pid.success||!p.success)return {data:null,error:{message:p.success?'Invalid contract.':p.error.issues[0]?.message??'Invalid contract.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const [old]=await sql<{effective_date:string}[]>`SELECT effective_date::text FROM public.patient_service_contracts
    WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`;if(!old)throw new ContractError('Contract not found in your agency.')
    if(p.data.end_date&&p.data.end_date<old.effective_date)throw new ContractError('End date cannot precede effective date.')
    const d=p.data;const [saved]=await sql<PatientServiceContractRow[]>`UPDATE public.patient_service_contracts SET
      contract_name=CASE WHEN ${d.contract_name!==undefined} THEN ${d.contract_name??null} ELSE contract_name END,
      bill_rate=CASE WHEN ${d.bill_rate!==undefined} THEN ${d.bill_rate??null} ELSE bill_rate END,
      end_date=CASE WHEN ${d.end_date!==undefined} THEN ${d.end_date??null}::date ELSE end_date END,
      note=CASE WHEN ${d.note!==undefined} THEN ${d.note??null} ELSE note END,
      bill_mileage=CASE WHEN ${d.bill_mileage!==undefined} THEN ${d.bill_mileage??false} ELSE bill_mileage END,
      mileage_bill_rate_per_mile=CASE WHEN ${d.mileage_bill_rate_per_mile!==undefined} THEN ${d.mileage_bill_rate_per_mile??null} ELSE mileage_bill_rate_per_mile END,updated_at=now()
      WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid RETURNING *`;await audit(actor,id,'UPDATE','update_service_contract');return {data:saved,error:null}})}catch(e){return fail(e)}
}

export async function setContractStatus(id:string,status:'active'|'inactive'):Promise<Result<null>>{
  if(!contractIdSchema.safeParse(id).success||!['active','inactive'].includes(status))return {data:null,error:{message:'Invalid contract status.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const [c]=await sql<{patient_id:string;service_type:string;contract_type:string;effective_date:string}[]>`
    SELECT patient_id,service_type,contract_type,effective_date::text FROM public.patient_service_contracts WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
    if(!c)throw new ContractError('Contract not found in your agency.');const next=status==='active'&&c.contract_type!=='weekly_hours'&&c.effective_date>new Date().toISOString().slice(0,10)?'scheduled':status
    if(next==='active'&&c.contract_type!=='weekly_hours')await sql`UPDATE public.patient_service_contracts SET status='inactive',updated_at=now() WHERE agency_id=${actor.agencyId}::uuid
      AND patient_id=${c.patient_id}::uuid AND service_type=${c.service_type} AND contract_type<>'weekly_hours' AND status='active' AND id<>${id}::uuid`
    await sql`UPDATE public.patient_service_contracts SET status=${next},updated_at=now() WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid`
    if(c.contract_type!=='weekly_hours')await reconcile(actor,c.patient_id)
    await audit(actor,id,'UPDATE','set_service_contract_status');return {data:null,error:null}})}catch(e){return fail(e)}
}

export async function deleteContract(id:string,weeklyOnly=false):Promise<Result<null>>{
  if(!contractIdSchema.safeParse(id).success)return {data:null,error:{message:'Invalid contract.'}}
  try{return await withAgencyManagerFinancialRead(async actor=>{const [row]=await sql<{contract_type:string;patient_id:string}[]>`SELECT contract_type,patient_id FROM public.patient_service_contracts
    WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`;if(!row||(weeklyOnly&&row.contract_type!=='weekly_hours'))throw new ContractError('Contract not found in your agency.')
    await sql`DELETE FROM public.patient_service_contracts WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid`;
    if(row.contract_type!=='weekly_hours')await reconcile(actor,row.patient_id)
    await audit(actor,id,'DELETE','delete_service_contract');return {data:null,error:null}})}catch(e){return fail(e)}
}

export async function readActiveWeeklyHours(patientId:string,date:string):Promise<PatientContractedHoursRow|null>{
  if(!contractIdSchema.safeParse(patientId).success||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  try{return await withAgencyManagerFinancialRead(async actor=>{await patient(actor,patientId)
    const [row]=await sql<PatientServiceContractRow[]>`SELECT id,patient_id,contract_name,contract_type,service_type,billing_code_id,
      bill_rate,bill_unit_type,weekly_hours_limit,effective_date::text,end_date::text,status,note,created_at::text,
      updated_at::text,bill_mileage,mileage_bill_rate_per_mile FROM public.patient_service_contracts
      WHERE agency_id=${actor.agencyId}::uuid AND patient_id=${patientId}::uuid AND contract_type='weekly_hours'
      AND effective_date<=${date}::date AND (end_date IS NULL OR end_date>=${date}::date)
      ORDER BY effective_date DESC LIMIT 1`
    await audit(actor,row?.id??patientId,'READ','read_active_weekly_hours');return row?mapWeekly(row):null})}catch{return null}
}
