export type LeadIntegrationCredentialSummary = {
  id: string
  agencyId: string
  name: string
  keyPrefix: string
  status: 'active' | 'revoked'
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}
