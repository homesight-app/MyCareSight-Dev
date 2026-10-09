export function normalizeUsZipForLookup(zip: unknown): string | null {
  if (zip === null || zip === undefined) return null
  const value = String(zip).trim()
  if (!value) return null
  const digits = value.replace(/\D/g, '').slice(0, 5)
  return digits.length === 5 ? digits : null
}

