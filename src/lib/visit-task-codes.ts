const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractVisitTaskToken(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  const parts = value.split('::')
  return (parts.length > 1 ? parts[1] : parts[0]).trim()
}

export function visitTaskSlotKey(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  const parts = value.split('::')
  return parts.length > 1 ? parts[0].trim().toLowerCase() : ''
}

export function isUuidToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function decodeVisitTaskCodes(
  codes: string[] | null | undefined,
  taskNameById?: ReadonlyMap<string, string>
): string[] {
  if (!Array.isArray(codes)) return []

  return codes
    .map((code) => {
      const token = extractVisitTaskToken(code)
      if (!token) return ''
      const mapped = taskNameById?.get(token)
      return mapped?.trim() || token
    })
    .filter(Boolean)
}

