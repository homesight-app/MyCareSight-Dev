'use client'

import InternalNotesPanel from './InternalNotesPanel'

interface ApplicationInternalNotesTabProps {
  applicationId: string
  agencyId: string
}

export default function ApplicationInternalNotesTab({
  applicationId,
  agencyId,
}: ApplicationInternalNotesTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Internal Notes</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Visible only to admins and experts. Use these to coordinate across the team.
        </p>
      </div>
      <InternalNotesPanel
        subjectType="application"
        subjectId={applicationId}
        agencyId={agencyId}
        canManage={true}
      />
    </div>
  )
}
