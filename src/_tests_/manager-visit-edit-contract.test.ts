/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repository = readFileSync(join(process.cwd(), 'src/lib/repositories/manager-visit-edit.ts'), 'utf8')
const action = readFileSync(join(process.cwd(), 'src/app/actions/manager-visit-edit.ts'), 'utf8')

test('manager edits preserve caregiver clock evidence and write only adjusted time fields', () => {
  expect(repository).toContain('adjusted_start_time=${actualStart}::timestamptz')
  expect(repository).toContain('adjusted_end_time=${actualEnd}::timestamptz')
  expect(repository).not.toMatch(/UPDATE public\.visit_time_entries SET[\s\S]{0,500}clock_in_time\s*=/)
  expect(repository).not.toMatch(/UPDATE public\.visit_time_entries SET[\s\S]{0,500}clock_out_time\s*=/)
})

test('manager edits lock operational records, reject approved billing, and convert using visit-location time', () => {
  expect(repository).toContain('FOR UPDATE')
  expect(repository).toContain("Void the approved Time & Billing decision before editing this visit.")
  expect(repository).toContain('AT TIME ZONE ${data.visitTimezone}')
  expect(repository).toContain("operation: 'manager_single_visit_edit'")
})

test('manager edits atomically preserve an attributable note and immutable correction evidence', () => {
  expect(repository).toContain('INSERT INTO public.visit_corrections')
  expect(repository).toContain('INSERT INTO public.visit_adjustment_history')
  expect(repository).toContain('INSERT INTO public.internal_notes')
  expect(repository).toContain('INSERT INTO public.audit_log')
  expect(repository).toContain("'internal_notes',${note.id}::uuid,'INSERT'")
  expect(repository).toContain('${data.careVerified}')
})

test('manager edits record the trigger-normalized status and reject holds with recorded time', () => {
  expect(repository).toContain('RETURNING status')
  expect(repository).toContain('const correctedStatus = updatedVisit.status')
  expect(repository).toContain("if (data.status !== 'missed')")
  expect(repository).not.toContain("!['missed', 'on_hold'].includes(data.status)")
})

test('server action validates shared schema and revalidates visit and financial surfaces', () => {
  expect(action).toContain('managerVisitEditSchema.safeParse(input)')
  expect(action).toContain("revalidatePath('/pages/agency/care-visits')")
  expect(action).toContain("revalidatePath('/pages/agency/time-billing')")
  expect(action).toContain("revalidatePath('/pages/agency/reports/payroll-billing')")
})
