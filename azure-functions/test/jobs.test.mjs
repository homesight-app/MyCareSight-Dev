import test from 'node:test'
import assert from 'node:assert/strict'
import { addUtcDays, utcDate, utcWeekday } from '../dist/dates.js'
import { errorCode } from '../dist/log.js'

test('UTC recurrence calculations remain stable across month and leap boundaries', () => {
  assert.equal(addUtcDays('2028-02-09', 21), '2028-03-01')
  assert.equal(addUtcDays('2026-12-20', 21), '2027-01-10')
  assert.equal(utcWeekday('2026-09-24'), 4)
  assert.equal(utcDate(new Date('2026-09-24T23:59:59Z')), '2026-09-24')
})

test('telemetry exposes allowlisted error codes and suppresses error messages', () => {
  assert.equal(errorCode({ code: '23505', message: 'sensitive row content' }), '23505')
  assert.equal(errorCode(new Error('sensitive row content')), 'UNCLASSIFIED_ERROR')
  assert.equal(errorCode({ code: 'bad code with spaces' }), 'UNCLASSIFIED_ERROR')
})
