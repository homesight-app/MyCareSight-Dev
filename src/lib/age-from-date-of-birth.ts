/** Calculate age from a calendar date without interpreting a DATE as a UTC instant. */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(dateOfBirth ?? '')
  if (!match || !Number.isFinite(today.getTime())) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const validDate = new Date(0)
  validDate.setUTCFullYear(year, month - 1, day)
  if (validDate.getUTCFullYear() !== year || validDate.getUTCMonth() + 1 !== month || validDate.getUTCDate() !== day) {
    return null
  }

  const age = today.getFullYear() - year - (
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0
  )
  return age >= 0 ? age : null
}
