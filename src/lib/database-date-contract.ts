export type DatabaseTemporalValue = Date | string

type TemporalContract<T extends Record<string, unknown>> = {
  dates?: readonly (keyof T)[]
  timestamps?: readonly (keyof T)[]
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError('Database returned an invalid date')
  }
}

/** Serialize a PostgreSQL DATE without applying the server's local timezone. */
export function databaseDate(value: DatabaseTemporalValue): string {
  if (value instanceof Date) {
    assertValidDate(value)
    return value.toISOString().slice(0, 10)
  }

  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(value)
  if (!match) throw new TypeError('Database returned an invalid calendar date')
  return match[1]
}

/** Serialize a PostgreSQL timestamp as an ISO instant. Existing strings remain stable. */
export function databaseTimestamp(value: DatabaseTemporalValue): string {
  if (value instanceof Date) {
    assertValidDate(value)
    return value.toISOString()
  }
  return value
}

/**
 * Normalize driver-owned temporal values at a repository boundary. Missing and
 * null fields are preserved so this also works for partial SELECT lists.
 */
export function normalizeDatabaseRow<T extends Record<string, unknown>>(
  row: T,
  contract: TemporalContract<T>
): T {
  const normalized = { ...row }
  const output = normalized as Record<string, unknown>

  for (const field of contract.dates ?? []) {
    const value = output[String(field)]
    if (value !== null && value !== undefined) {
      output[String(field)] = databaseDate(value as DatabaseTemporalValue)
    }
  }

  for (const field of contract.timestamps ?? []) {
    const value = output[String(field)]
    if (value !== null && value !== undefined) {
      output[String(field)] = databaseTimestamp(value as DatabaseTemporalValue)
    }
  }

  return normalized
}

export function normalizeDatabaseRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  contract: TemporalContract<T>
): T[] {
  return rows.map(row => normalizeDatabaseRow(row, contract))
}
