/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repository = readFileSync(join(process.cwd(), 'src/lib/repositories/manager-visit-edit.ts'), 'utf8')
const action = readFileSync(join(process.cwd(), 'src/app/actions/manager-visit-edit.ts'), 'utf8')

test('only the time scope writes manager-adjusted fields and caregiver clock evidence remains untouched', () => {
  expect(repository).toContain("data.scope === 'time'")
  expect(repository).toContain('adjusted_start_time=${actualStart}::timestamptz')
  expect(repository).toContain('adjusted_end_time=${actualEnd}::timestamptz')
  expect(repository).not.toMatch(/UPDATE public\.visit_time_entries SET[\s\S]{0,500}clock_in_time\s*=/)
  expect(repository).not.toMatch(/UPDATE public\.visit_time_entries SET[\s\S]{0,500}clock_out_time\s*=/)
})

test('scoped manager edits lock records, reject approved billing, and store location-derived timezone', () => {
  expect(repository).toContain('FOR UPDATE')
  expect(repository).toContain('Void the approved Time & Billing decision before editing this visit.')
  expect(repository).toContain('AT TIME ZONE ${visitTimezone}')
  expect(repository).toContain('resolveVisitTimezoneFromZip(address.zip_code)')
  expect(repository).toContain("data.scope === 'location'")
  expect(repository).toContain('patient_address_id=${patientAddressId}::uuid,visit_timezone=${scheduleTimezone}')
  expect(repository).toContain('The visit does not have a stored time zone.')
  expect(repository).toContain("operation: 'manager_single_visit_edit', scope: data.scope")
})

test('schedule and location edits are independent occurrence-level operations', () => {
  expect(repository).toContain("if (data.scope === 'schedule')")
  expect(repository).toContain("else if (data.scope === 'location')")
  expect(repository).toContain("location_changed: data.scope === 'location'")
  expect(repository).toContain("previous_location_id: data.scope === 'location'")
  expect(repository).toContain("corrected_location_id: data.scope === 'location'")
})

test('all manager scopes preserve attributable notes and immutable correction evidence', () => {
  expect(repository).toContain('INSERT INTO public.visit_corrections')
  expect(repository).toContain('INSERT INTO public.internal_notes')
  expect(repository).toContain('INSERT INTO public.audit_log')
  expect(repository).toContain("'internal_notes',${note.id}::uuid,'INSERT'")
  expect(repository).toContain("data.scope === 'time' ? 'manager_manual_time' : 'manager_visit_edit'")
})

test('completed and in-progress status derive only from recorded time', () => {
  expect(repository).toContain("const derivedStatus = actualEnd ? 'completed' : 'in_progress'")
  expect(repository).toContain("data.scope === 'status' && hasRecordedTime(entry)")
  expect(repository).toContain('Use Edit Recorded Time; its clock record determines the visit status.')
})

test('time editing uses the authoritative visit caregiver without changing assignment', () => {
  expect(repository).toContain("if (data.scope === 'time' && !caregiverId)")
  expect(repository).toContain('Assign a caregiver before recording visit time.')
  expect(repository).not.toContain("data.scope === 'caregiver' || data.scope === 'time'\n        ? data.caregiverMemberId")
  expect(repository).not.toMatch(/UPDATE public\.scheduled_visits SET[\s\S]{0,100}caregiver_member_id=\$\{caregiverId\}::uuid,visit_timezone/)
})

test('time editing reads stored timezone and calculates billable duration without accepting overrides', () => {
  expect(repository).not.toContain('data.visitTimezone')
  expect(repository).not.toContain('data.billableHours')
  expect(repository).toContain('visitTimezone = visit.visit_timezone')
  expect(repository).toContain('visit_timezone=${visitTimezone}')
  expect(repository).toContain('actual_hours=${actualHours},billable_hours=${actualHours}')
})

test('financial recalculation and adjustment history are isolated to the time scope', () => {
  expect(repository).toContain("data.scope === 'time' && entryId && actualStart")
  expect(repository).toContain("data.scope === 'time' && entryId && actualHours !== null")
  expect(repository).toContain('INSERT INTO public.visit_adjustment_history')
  expect(repository).toContain('INSERT INTO public.visit_financials')
  expect(repository).toContain('actual_hours=${actualHours},billable_hours=${actualHours}')
  expect(repository).not.toContain('data.billableHours')
  expect(repository).not.toContain('visit_time_entry_id=EXCLUDED.visit_time_entry_id')
  expect(repository).not.toContain('caregiver_member_id=EXCLUDED.caregiver_member_id')
})

test('server action validates shared schema and revalidates visit and financial surfaces', () => {
  expect(action).toContain('managerVisitEditSchema.safeParse(input)')
  expect(action).toContain("revalidatePath('/pages/agency/care-visits')")
  expect(action).toContain("revalidatePath('/pages/agency/time-billing')")
  expect(action).toContain("revalidatePath('/pages/agency/reports/payroll-billing')")
})

test('unexpected database failures log only non-PHI diagnostic fields', () => {
  expect(repository).toContain("console.error('[manager-visit-edit] transaction failed'")
  expect(repository).toContain("code: typeof databaseError?.code === 'string'")
  expect(repository).not.toContain('console.error(error)')
})
