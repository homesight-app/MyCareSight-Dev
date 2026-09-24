import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const money = z.number().finite().min(0).max(1_000_000).nullable()

export const serviceContractCreateSchema = z.object({
  patient_id:z.uuid(), contract_name:z.string().trim().max(200).nullable().optional(),
  contract_type:z.string().trim().min(1).max(80), service_type:z.enum(['non_skilled','skilled']),
  billing_code_id:z.uuid().nullable().optional(), bill_rate:money.optional(),
  bill_unit_type:z.enum(['hour','visit','15_min_unit']), weekly_hours_limit:z.number().finite().min(0).max(168).nullable().optional(),
  effective_date:date, end_date:date.nullable().optional(), note:z.string().trim().max(9000).nullable().optional(),
  bill_mileage:z.boolean().optional(), mileage_bill_rate_per_mile:money.optional(),
}).strict().refine(v=>!v.end_date||v.end_date>=v.effective_date,{path:['end_date'],message:'End date cannot precede effective date'})

export const serviceContractDetailsSchema=z.object({
  contract_name:z.string().trim().max(200).nullable().optional(), end_date:date.nullable().optional(),
  bill_rate:money.optional(),
  note:z.string().trim().max(9000).nullable().optional(), bill_mileage:z.boolean().optional(),
  mileage_bill_rate_per_mile:money.optional(),
}).strict()

export const weeklyHoursCreateSchema=z.object({patient_id:z.uuid(),total_hours:z.number().finite().min(0).max(168),
  effective_date:date,end_date:date.nullable().optional(),note:z.string().trim().max(9000).nullable().optional()}).strict()
  .refine(v=>!v.end_date||v.end_date>=v.effective_date,{path:['end_date'],message:'End date cannot precede effective date'})

export const contractIdSchema=z.uuid()
