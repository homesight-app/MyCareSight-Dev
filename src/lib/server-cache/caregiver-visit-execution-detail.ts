import { unstable_cache } from 'next/cache'
import { withUserContext } from '@/db'
import { fetchCaregiverVisitExecutionDetail } from '@/lib/caregiver-visit-execution'
import { CACHE_TAG_CAREGIVER_VISIT_EXECUTION } from '@/lib/cache-tags'

// viewerUserId + viewerRole are cache-key params so each user gets their own cached result.
// withUserContext is called INSIDE the cache callback so that on a cache miss the RLS session
// variables are set correctly. On a cache hit the callback never runs — no SQL is executed.
const getCaregiverVisitExecutionDetailCached = unstable_cache(
  async (visitId: string, staffMemberId: string, agencyId: string | null, viewerUserId: string, viewerRole: string) => {
    return withUserContext(viewerUserId, viewerRole, agencyId, () =>
      fetchCaregiverVisitExecutionDetail(visitId, staffMemberId, agencyId)
    )
  },
  ['caregiver-visit-execution-detail'],
  { revalidate: 15, tags: [CACHE_TAG_CAREGIVER_VISIT_EXECUTION] }
)

export function getCachedCaregiverVisitExecutionDetail(
  visitId: string,
  staffMemberId: string,
  agencyId: string | null,
  viewerUserId: string,
  viewerRole: string
) {
  return getCaregiverVisitExecutionDetailCached(visitId, staffMemberId, agencyId, viewerUserId, viewerRole)
}
