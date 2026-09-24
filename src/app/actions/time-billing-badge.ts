'use server'
import { readPendingTimeBillingCount } from '@/lib/repositories/visit-financial-reads'
export async function getTimeBillingPendingBadgeCountAction(){return readPendingTimeBillingCount()}
