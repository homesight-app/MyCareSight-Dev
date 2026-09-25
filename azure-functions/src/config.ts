export function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required setting: ${name}`)
  return value
}

export function jobsEnabled(): boolean {
  return process.env.JOBS_ENABLED === 'true'
}

export const queueName = process.env.JOBS_QUEUE_NAME?.trim() || 'mycaresight-background-jobs'
