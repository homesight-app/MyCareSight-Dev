export interface LeadFinancialValue {
  stage: string
  converted_at: string | null
  price: number | string | null
  retainer_amount: number | string | null
  retainer_paid_date: string | null
}

function financialAmount(value: number | string | null): number {
  if (value === null) return 0
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) throw new TypeError('Lead financial value is invalid')
  return amount
}

export function calculateLeadFinancialSummary(leads: readonly LeadFinancialValue[]) {
  const signedLeads = leads.filter(lead => lead.stage === 'signed' || Boolean(lead.converted_at))

  return {
    totalDeals: leads.length,
    totalValue: leads.reduce((sum, lead) => sum + financialAmount(lead.price), 0),
    signedValue: signedLeads.reduce((sum, lead) => sum + financialAmount(lead.price), 0),
    retainerCollected: leads.reduce(
      (sum, lead) => sum + (lead.retainer_paid_date ? financialAmount(lead.retainer_amount) : 0),
      0
    ),
  }
}
