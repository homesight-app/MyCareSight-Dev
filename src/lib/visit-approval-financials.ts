import 'server-only'

/** @deprecated Approval and void decisions must use the current-identity transaction boundary. */
export function retiredVisitApprovalFinancialHelper(): never {
  throw new Error('Retired unsafe helper: use decideTimeBillingVisit().')
}
