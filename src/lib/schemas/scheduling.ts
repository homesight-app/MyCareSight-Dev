import { z } from 'zod'

const uuid = z.uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const time = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Use HH:MM').nullable().optional()
const text = z.string().trim().max(9000).nullable().optional()

export const scheduleCreateSchema = z.object({
  patient_id: uuid,
  caregiver_id: uuid.nullable().optional(),
  contract_id: uuid.nullable().optional(),
  service_type: z.enum(['non_skilled', 'skilled']).nullable().optional(),
  adl_codes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  date,
  start_time: time,
  end_time: time,
  description: text,
  type: z.string().trim().max(200).nullable().optional(),
  notes: text,
  is_recurring: z.boolean().optional(),
  repeat_frequency: z.string().trim().max(80).nullable().optional(),
  days_of_week: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  repeat_monthly_rules: z.array(z.object({ ordinal: z.number().int(), weekday: z.number().int().min(0).max(6) })).max(12).nullable().optional(),
  repeat_start: date.nullable().optional(),
  repeat_end: date.nullable().optional(),
  patient_address_id: uuid.nullable().optional(),
  mileage_miles: z.number().finite().min(0).max(10000).nullable().optional(),
  end_date: date.nullable().optional(),
}).strict()

export const recurringScheduleCreateSchema = scheduleCreateSchema.omit({ date: true }).extend({
  dates: z.array(date).min(1).max(1000),
  repeat_start: date,
  end_day_offset: z.number().int().min(0).max(7).optional(),
}).strict()

export const scheduleUpdateSchema = z.object({
  date: date.optional(), start_time: time, end_time: time, description: text,
  type: z.string().trim().max(200).nullable().optional(), caregiver_id: uuid.nullable().optional(),
  contract_id: uuid.nullable().optional(), service_type: z.enum(['non_skilled','skilled']).nullable().optional(),
  notes: text, status_reason: text,
  adl_codes: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  is_recurring: z.boolean().optional(), repeat_frequency: z.string().trim().max(80).nullable().optional(),
  days_of_week: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  repeat_monthly_rules: z.array(z.object({ ordinal:z.number().int(),weekday:z.number().int().min(0).max(6) })).max(12).nullable().optional(),
  repeat_start: date.nullable().optional(), repeat_end: date.nullable().optional(),
  status: z.enum(['scheduled','unassigned','in_progress','completed','missed','cancelled','on_hold']).nullable().optional(),
  end_date: date.nullable().optional(),
}).strict()

export const recurringScheduleUpdateSchema = z.object({
  seed_schedule_id: uuid,
  scope: z.enum(['this_visit','this_and_future','all_in_series','weekday_in_series']),
  apply_from_date: date.nullable().optional(),
  patch: scheduleUpdateSchema,
}).strict()

export const scheduleIdSchema = uuid
export const scheduleDateRangeSchema = z.object({ startDate: date, endDate: date })
  .refine(value => value.endDate >= value.startDate, { path:['endDate'], message:'End date cannot precede start date' })
