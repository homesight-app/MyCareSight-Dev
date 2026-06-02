export function patientFullName(p: { first_name: string; last_name: string }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Client'
}
