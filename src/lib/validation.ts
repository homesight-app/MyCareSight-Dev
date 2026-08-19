import * as z from 'zod'
import type { ZodError } from 'zod'

export function zodErrorToFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.')
    if (!out[key]) out[key] = []
    out[key].push(issue.message)
  }
  return out
}

/**
 * Accepts common US phone formats:
 * (555) 123-4567 | 555-123-4567 | 555.123.4567 | 5551234567 | +1 555 123 4567
 */
export const US_PHONE_REGEX = /^\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}$/

export const PHONE_ERROR = 'Enter a valid US phone number, e.g. (555) 123-4567'
export const EMAIL_ERROR = 'Enter a valid email address'

export function isValidUSPhone(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false
  return US_PHONE_REGEX.test(value.trim())
}

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// ─── Reusable Zod field schemas ───────────────────────────────────────────────
// Import and spread these into your form schema instead of re-writing the refine.

/** Optional US phone — blank is allowed; non-blank must match US format. */
export const phoneZodField = z
  .string()
  .optional()
  .refine(val => !val || US_PHONE_REGEX.test(val.trim()), PHONE_ERROR)

/** Required email address. */
export const emailZodField = z.string().email(EMAIL_ERROR)

/** Optional email — blank is allowed; non-blank must be a valid address. */
export const optionalEmailZodField = z
  .string()
  .optional()
  .refine(val => !val || isValidEmail(val), EMAIL_ERROR)

// ─── Phone formatter ──────────────────────────────────────────────────────────

/**
 * Formats a string of digits (or partially formatted input) into (XXX) XXX-XXXX as the user types.
 * Strips all non-digit chars first, caps at 10 digits.
 */
export function formatUSPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
