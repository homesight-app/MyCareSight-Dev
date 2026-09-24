import { fetchCaregiverVisitExecutionDetail } from '@/lib/caregiver-visit-execution'
import { withAuditedActiveCaregiverRead } from '@/lib/repositories/caregiver-visit-execution'

/** Existing import name retained; current authorization and audit run on every request. */
export function getCachedCaregiverVisitExecutionDetail(
  visitId: string,
  viewerUserId: string
) {
  return withAuditedActiveCaregiverRead(viewerUserId, 'visit_execution_detail', visitId, actor =>
    fetchCaregiverVisitExecutionDetail(visitId, actor.caregiverMemberId, actor.agencyId)
  )
}
