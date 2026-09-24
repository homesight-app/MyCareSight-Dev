import { z } from 'zod'

const coordinatePair = z.object({
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
}).strict().refine(value => (value.latitude === null) === (value.longitude === null), {
  message: 'Latitude and longitude must be provided together',
})

export const caregiverClockSchema = z.object({
  visitId: z.uuid(),
  latitude: coordinatePair.shape.latitude,
  longitude: coordinatePair.shape.longitude,
}).strict().refine(value => (value.latitude === null) === (value.longitude === null), {
  message: 'Latitude and longitude must be provided together',
})

export const caregiverTaskCompletionSchema = z.object({
  visitId: z.uuid(),
  scheduledVisitTaskId: z.uuid(),
  completed: z.boolean(),
}).strict()

export const caregiverVisitNotesSchema = z.object({
  visitId: z.uuid(),
  notes: z.string().trim().max(9000, 'Visit notes are too long'),
}).strict()

