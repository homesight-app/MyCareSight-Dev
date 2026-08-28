'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import * as q from '@/lib/supabase/query'
import type { BillingCode } from '@/lib/supabase/query/billing'

export type { BillingCode }

export async function getActiveBillingCodesAction(): Promise<{ data: BillingCode[] | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await q.getActiveBillingCodes(supabase)
  return { data, error: error?.message ?? null }
}

export interface CreateBillingData {
  clientId: string
  billingMonth: string // Format: YYYY-MM-DD (first day of month)
  userLicensesCount?: number
  userLicenseRate?: number
  applicationsCount?: number
  applicationRate?: number
  status?: 'pending' | 'paid' | 'overdue'
}

export async function createBilling(data: CreateBillingData) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated', data: null }

  const supabase = await createClient()

  try {
    // Calculate total amount
    const userLicenseTotal = (data.userLicensesCount || 0) * (data.userLicenseRate || 50.00)
    const applicationTotal = (data.applicationsCount || 0) * (data.applicationRate || 500.00)
    const totalAmount = userLicenseTotal + applicationTotal

    // Insert billing record
    const { data: billing, error } = await supabase
      .from('billing')
      .insert({
        client_id: data.clientId,
        billing_month: data.billingMonth,
        user_licenses_count: data.userLicensesCount || 0,
        user_license_rate: data.userLicenseRate || 50.00,
        applications_count: data.applicationsCount || 0,
        application_rate: data.applicationRate || 500.00,
        total_amount: totalAmount,
        status: data.status || 'pending',
      })
      .select()
      .single()

    if (error) {
      return { error: error.message, data: null }
    }

    const { data: adminRow } = await supabase
      .from('agency_admins')
      .select('agency_id')
      .eq('id', data.clientId)
      .maybeSingle()

    const { error: auditErr } = await supabase.from('audit_log').insert({
      agency_id: adminRow?.agency_id ?? null,
      table_name: 'billing',
      record_id: billing.id,
      action: 'INSERT',
      performed_by_user_id: session.user.id,
      details: {
        client_id:            data.clientId,
        billing_month:        data.billingMonth,
        total_amount:         totalAmount,
        status:               data.status || 'pending',
      },
    })
    if (auditErr) console.error('Audit log failed for billing INSERT:', auditErr.message)

    revalidatePath('/pages/admin/billing')
    return { error: null, data: billing }
  } catch (err: any) {
    return { error: err.message || 'Failed to create billing record', data: null }
  }
}
