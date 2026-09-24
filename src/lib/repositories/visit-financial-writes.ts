import 'server-only'

import { z } from 'zod'
import sql, { withActorContext } from '@/db'
import { getSession } from '@/lib/auth'
import { resolvePayRateForVisit, type CaregiverPayRateRow } from '@/lib/caregiver-pay-rates'
import { calcAmount, round2 } from '@/lib/payroll-calculations'
import { timeBillingDecisionSchema, type TimeBillingDecisionInput } from '@/lib/schemas/time-billing'

type Manager = { id:string; role:'company_owner'|'care_coordinator'; agencyId:string }
type Visit = { id:string; agency_id:string; patient_id:string; caregiver_member_id:string|null; visit_date:string }
type TimeEntry = { id:string; actual_hours:number|null; billable_hours:number|null }
type Approval = { id:string; pay_rate:number|null; bill_rate:number|null }
type Financial = {
  id:string; visit_approval_id:string|null; contract_id:string|null; billing_code_id:string|null
  pay_rate:number; pay_unit_type:string; pay_amount:number; bill_rate:number; bill_unit_type:string; bill_amount:number
  approved_actual_hours:number|null; approved_billable_hours:number|null; service_type:string|null
}
type Contract = { id:string; billing_code_id:string|null; bill_rate:number|null; bill_unit_type:string }

export type TimeBillingDecisionResult = { ok?:true; error?:string }
class AccessError extends Error {}
const message=(error:unknown)=>error instanceof AccessError?error.message:'Unable to save the billing decision. No changes were saved.'

async function currentManager<T>(run:(actor:Manager)=>Promise<T>):Promise<T>{
  const session=await getSession()
  if(!session||!z.uuid().safeParse(session.user.id).success) throw new AccessError('You must be signed in.')
  return withActorContext(session.user.id,async()=>{
    const [row]=await sql<{id:string;role:string;agency_id:string|null}[]>`
      SELECT profile.id,profile.role,profile.agency_id FROM public.user_profiles profile
      JOIN public.user_agency_roles membership ON membership.user_id=profile.id
       AND membership.agency_id=profile.agency_id AND membership.role=profile.role AND membership.status='active'
      WHERE profile.id=${session.user.id}::uuid AND profile.is_active=true
       AND profile.role IN ('company_owner','care_coordinator') LIMIT 1`
    if(!row?.agency_id) throw new AccessError('An active agency management membership is required.')
    const actor={id:row.id,role:row.role as Manager['role'],agencyId:row.agency_id}
    await sql`SELECT set_config('app.current_user_role',${actor.role},true),set_config('app.current_agency_id',${actor.agencyId},true)`
    return run(actor)
  })
}

async function lockedVisit(actor:Manager,id:string):Promise<Visit>{
  const [visit]=await sql<Visit[]>`SELECT id,agency_id,patient_id,caregiver_member_id,visit_date::text
    FROM public.scheduled_visits WHERE id=${id}::uuid AND agency_id=${actor.agencyId}::uuid FOR UPDATE`
  if(!visit) throw new AccessError('Visit not found.')
  if(!visit.caregiver_member_id) throw new AccessError('Assign a caregiver before changing billing status.')
  return visit
}

async function lockedTimeEntry(visit:Visit):Promise<TimeEntry>{
  const [existing]=await sql<TimeEntry[]>`SELECT id,actual_hours,billable_hours FROM public.visit_time_entries
    WHERE scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
  if(existing) return existing
  const [created]=await sql<TimeEntry[]>`INSERT INTO public.visit_time_entries
    (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,entry_status)
    VALUES(${visit.agency_id}::uuid,${visit.id}::uuid,${visit.patient_id}::uuid,
      ${visit.caregiver_member_id}::uuid,'submitted') RETURNING id,actual_hours,billable_hours`
  if(!created) throw new Error('Time entry insert returned no row')
  return created
}

async function payRate(visit:Visit,serviceType:string){
  const rows=await sql<CaregiverPayRateRow[]>`SELECT caregiver_member_id,pay_rate,unit_type,service_type,
    effective_start::text,effective_end::text FROM public.caregiver_pay_rates
    WHERE agency_id=${visit.agency_id}::uuid AND caregiver_member_id=${visit.caregiver_member_id}::uuid
      AND effective_start<=${visit.visit_date}::date AND (effective_end IS NULL OR effective_end>${visit.visit_date}::date)`
  return resolvePayRateForVisit(visit.caregiver_member_id!,serviceType,visit.visit_date,rows)
}

async function billContract(visit:Visit,serviceType:string):Promise<Contract|null>{
  const [row]=await sql<Contract[]>`SELECT id,billing_code_id,bill_rate,bill_unit_type
    FROM public.patient_service_contracts
    WHERE agency_id=${visit.agency_id}::uuid AND patient_id=${visit.patient_id}::uuid
      AND service_type=${serviceType} AND contract_type<>'weekly_hours' AND status<>'inactive'
      AND effective_date<=${visit.visit_date}::date AND (end_date IS NULL OR end_date>=${visit.visit_date}::date)
    ORDER BY effective_date DESC,created_at DESC,updated_at DESC,id DESC LIMIT 1`
  return row??null
}

async function audit(actor:Manager,visit:Visit,entryId:string,approvalId:string,financialId:string,
  decision:string,hoursChanged:boolean,notePresent:boolean){
  const details=JSON.stringify({operation:'time_billing_decision',decision,scheduled_visit_id:visit.id,
    visit_time_entry_id:entryId,hours_changed:hoursChanged,note_present:notePresent})
  await sql`INSERT INTO public.audit_log(agency_id,table_name,record_id,action,performed_by_user_id,details) VALUES
    (${actor.agencyId}::uuid,'visit_time_entries',${entryId}::uuid,'UPDATE',${actor.id}::uuid,${details}::jsonb),
    (${actor.agencyId}::uuid,'visit_approvals',${approvalId}::uuid,'UPDATE',${actor.id}::uuid,${details}::jsonb),
    (${actor.agencyId}::uuid,'visit_financials',${financialId}::uuid,'UPDATE',${actor.id}::uuid,${details}::jsonb)`
}

export async function decideTimeBillingVisit(input:TimeBillingDecisionInput):Promise<TimeBillingDecisionResult>{
  const parsed=timeBillingDecisionSchema.safeParse(input)
  if(!parsed.success) return {error:parsed.error.issues[0]?.message??'Invalid billing decision.'}
  const data=parsed.data
  try{
    await currentManager(async actor=>{
      const visit=await lockedVisit(actor,data.scheduledVisitId)
      const entry=await lockedTimeEntry(visit)
      const [approval]=await sql<Approval[]>`SELECT id,pay_rate,bill_rate FROM public.visit_approvals
        WHERE visit_time_entry_id=${entry.id}::uuid FOR UPDATE`
      const [financial]=await sql<Financial[]>`SELECT id,visit_approval_id,contract_id,billing_code_id,pay_rate,
        pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount,approved_actual_hours,
        approved_billable_hours,service_type FROM public.visit_financials
        WHERE scheduled_visit_id=${visit.id}::uuid FOR UPDATE`
      const previousActual=financial?.approved_actual_hours??entry.actual_hours
      const previousBillable=financial?.approved_billable_hours??entry.billable_hours
      const hoursChanged=(previousActual!==null&&round2(Number(previousActual))!==data.actualHours)
        ||(previousBillable!==null&&round2(Number(previousBillable))!==data.billableHours)
      if(data.decision==='approved'&&hoursChanged&&!data.note) throw new AccessError('Add a note when changing hours.')
      let approvalId:string
      let financialId:string

      if(data.decision==='approved'){
        const [pay,contract]=await Promise.all([payRate(visit,data.serviceType),billContract(visit,data.serviceType)])
        const frozenPay=approval?.pay_rate??Number(pay?.rate??0)
        const frozenBill=approval?.bill_rate??Number(contract?.bill_rate??0)
        const payUnit=financial?.pay_unit_type??pay?.unit_type??'hour'
        const billUnit=financial?.bill_unit_type??contract?.bill_unit_type??'hour'
        const payAmount=round2(calcAmount(data.actualHours,Number(frozenPay),payUnit))
        const billAmount=round2(calcAmount(data.billableHours,Number(frozenBill),billUnit))
        const [history]=await sql<{id:string}[]>`INSERT INTO public.visit_adjustment_history
          (agency_id,visit_time_entry_id,changed_by_user_id,reason,previous_actual_hours,current_actual_hours,
           previous_billable_hours,current_billable_hours,note)
          VALUES(${visit.agency_id}::uuid,${entry.id}::uuid,${actor.id}::uuid,
            ${financial?'coordinator_time_billing_update':'coordinator_time_billing_initial'},${previousActual},${data.actualHours},
            ${previousBillable},${data.billableHours},${data.note||null}) RETURNING id`
        const [savedApproval]=await sql<{id:string}[]>`INSERT INTO public.visit_approvals
          (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,approved_by_user_id,
           approval_status,approved_actual_hours,approved_billable_hours,approval_comment,pay_rate,bill_rate,approved_at)
          VALUES(${visit.agency_id}::uuid,${visit.id}::uuid,${entry.id}::uuid,${visit.patient_id}::uuid,
            ${visit.caregiver_member_id}::uuid,${actor.id}::uuid,'approved',${data.actualHours},${data.billableHours},
            ${data.note||null},${frozenPay},${frozenBill},now())
          ON CONFLICT(visit_time_entry_id) DO UPDATE SET approved_by_user_id=EXCLUDED.approved_by_user_id,
            approval_status='approved',approved_actual_hours=EXCLUDED.approved_actual_hours,
            approved_billable_hours=EXCLUDED.approved_billable_hours,approval_comment=EXCLUDED.approval_comment,
            pay_rate=coalesce(public.visit_approvals.pay_rate,EXCLUDED.pay_rate),
            bill_rate=coalesce(public.visit_approvals.bill_rate,EXCLUDED.bill_rate),approved_at=now(),updated_at=now()
          RETURNING id`
        if(!history||!savedApproval) throw new Error('Approval records were not created')
        approvalId=savedApproval.id
        const [savedFinancial]=await sql<{id:string}[]>`INSERT INTO public.visit_financials
          (agency_id,scheduled_visit_id,visit_time_entry_id,visit_approval_id,patient_id,caregiver_member_id,
           contract_id,billing_code_id,pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount,
           approved_actual_hours,approved_billable_hours,calculation_basis,service_type,status,coordinator_note)
          VALUES(${visit.agency_id}::uuid,${visit.id}::uuid,${entry.id}::uuid,${savedApproval.id}::uuid,
            ${visit.patient_id}::uuid,${visit.caregiver_member_id}::uuid,${contract?.id??null}::uuid,
            ${contract?.billing_code_id??null}::uuid,${frozenPay},${payUnit},${payAmount},${frozenBill},${billUnit},
            ${billAmount},${data.actualHours},${data.billableHours},
            ${JSON.stringify({source:'coordinator_approval',adjustment_history_id:history.id})}::jsonb,
            ${data.serviceType},'approved',${data.note||null})
          ON CONFLICT(scheduled_visit_id) DO UPDATE SET visit_approval_id=EXCLUDED.visit_approval_id,
            contract_id=EXCLUDED.contract_id,billing_code_id=EXCLUDED.billing_code_id,pay_rate=EXCLUDED.pay_rate,
            pay_unit_type=EXCLUDED.pay_unit_type,pay_amount=EXCLUDED.pay_amount,bill_rate=EXCLUDED.bill_rate,
            bill_unit_type=EXCLUDED.bill_unit_type,bill_amount=EXCLUDED.bill_amount,
            approved_actual_hours=EXCLUDED.approved_actual_hours,approved_billable_hours=EXCLUDED.approved_billable_hours,
            calculation_basis=EXCLUDED.calculation_basis,service_type=EXCLUDED.service_type,status='approved',
            coordinator_note=EXCLUDED.coordinator_note,updated_at=now() RETURNING id`
        if(!savedFinancial) throw new Error('Financial record was not created')
        financialId=savedFinancial.id
        await sql`UPDATE public.visit_time_entries SET actual_hours=${data.actualHours},billable_hours=${data.billableHours},
          entry_status='approved',adjustment_comment=${data.note||null},updated_at=now() WHERE id=${entry.id}::uuid`
      }else{
        const previousPay=Number(financial?.pay_rate??approval?.pay_rate??0)
        const previousBill=Number(financial?.bill_rate??approval?.bill_rate??0)
        const [history]=await sql<{id:string}[]>`INSERT INTO public.visit_adjustment_history
          (agency_id,visit_time_entry_id,changed_by_user_id,reason,previous_actual_hours,current_actual_hours,
           previous_billable_hours,current_billable_hours,note)
          VALUES(${visit.agency_id}::uuid,${entry.id}::uuid,${actor.id}::uuid,'coordinator_void_billing',
            ${previousActual},NULL,${previousBillable},NULL,${data.note||null}) RETURNING id`
        const [savedApproval]=await sql<{id:string}[]>`INSERT INTO public.visit_approvals
          (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,approved_by_user_id,
           approval_status,approved_actual_hours,approved_billable_hours,approval_comment,pay_rate,bill_rate,approved_at)
          VALUES(${visit.agency_id}::uuid,${visit.id}::uuid,${entry.id}::uuid,${visit.patient_id}::uuid,
            ${visit.caregiver_member_id}::uuid,${actor.id}::uuid,'rejected',${previousActual},${previousBillable},
            ${data.note?`Voided: ${data.note}`:'Voided for billing.'},${previousPay},${previousBill},now())
          ON CONFLICT(visit_time_entry_id) DO UPDATE SET approved_by_user_id=EXCLUDED.approved_by_user_id,
            approval_status='rejected',approval_comment=EXCLUDED.approval_comment,approved_at=now(),updated_at=now()
          RETURNING id`
        if(!history||!savedApproval) throw new Error('Void records were not created')
        approvalId=savedApproval.id
        const [savedFinancial]=await sql<{id:string}[]>`INSERT INTO public.visit_financials
          (agency_id,scheduled_visit_id,visit_time_entry_id,visit_approval_id,patient_id,caregiver_member_id,
           contract_id,billing_code_id,pay_rate,pay_unit_type,pay_amount,bill_rate,bill_unit_type,bill_amount,
           approved_actual_hours,approved_billable_hours,calculation_basis,service_type,status,coordinator_note)
          VALUES(${visit.agency_id}::uuid,${visit.id}::uuid,${entry.id}::uuid,${savedApproval.id}::uuid,
            ${visit.patient_id}::uuid,${visit.caregiver_member_id}::uuid,${financial?.contract_id??null}::uuid,
            ${financial?.billing_code_id??null}::uuid,${previousPay},${financial?.pay_unit_type??'hour'},
            ${financial?.pay_amount??0},${previousBill},${financial?.bill_unit_type??'hour'},${financial?.bill_amount??0},
            ${previousActual},${previousBillable},${JSON.stringify({source:'coordinator_void',adjustment_history_id:history.id})}::jsonb,
            ${financial?.service_type??data.serviceType},'voided',${data.note||null})
          ON CONFLICT(scheduled_visit_id) DO UPDATE SET visit_approval_id=EXCLUDED.visit_approval_id,status='voided',
            coordinator_note=EXCLUDED.coordinator_note,calculation_basis=EXCLUDED.calculation_basis,updated_at=now()
          RETURNING id`
        if(!savedFinancial) throw new Error('Financial record was not created')
        financialId=savedFinancial.id
        await sql`UPDATE public.visit_time_entries SET entry_status='pending_review',updated_at=now() WHERE id=${entry.id}::uuid`
      }
      await audit(actor,visit,entry.id,approvalId,financialId,data.decision,hoursChanged,Boolean(data.note))
    })
    return {ok:true}
  }catch(error){return {error:message(error)}}
}
