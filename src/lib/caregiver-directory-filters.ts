export type CaregiverDirectoryStatus = 'active' | 'inactive'

export function normalizeCaregiverDirectoryStatus(value: string | undefined): CaregiverDirectoryStatus {
  return value === 'inactive' ? 'inactive' : 'active'
}
