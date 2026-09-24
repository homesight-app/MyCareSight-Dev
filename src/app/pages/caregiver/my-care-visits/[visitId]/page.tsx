import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import CaregiverVisitExecutionContent from '@/components/CaregiverVisitExecutionContent'
import { getCachedCaregiverVisitExecutionDetail } from '@/lib/server-cache/caregiver-visit-execution-detail'

type PageProps = {
  params: Promise<{ visitId: string }>
}

export default async function CaregiverVisitExecutionPage({ params }: PageProps) {
  const { visitId } = await params
  if (!visitId || visitId === 'null') notFound()

  const session = await getSession()
  if (!session?.user.id) notFound()

  const result = await getCachedCaregiverVisitExecutionDetail(visitId, session.user.id).catch(() => null)
  if (!result?.data || result.error) notFound()

  return <CaregiverVisitExecutionContent initial={result.data} />
}
