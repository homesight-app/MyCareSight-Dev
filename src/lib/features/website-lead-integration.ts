import 'server-only'

export function websiteLeadIntegrationEnabled(): boolean {
  return process.env.WEBSITE_LEAD_INTEGRATION_ENABLED?.trim().toLowerCase() === 'true'
}
