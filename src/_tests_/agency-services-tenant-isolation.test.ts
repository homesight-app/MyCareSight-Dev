/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('agency My Services tenant isolation', () => {
  test('requires agency scope for list data, counts, searches, and pending requests', () => {
    const source = read('src/lib/supabase/query/playbooks.ts')

    expect(source).toContain('getApplicationsWithProgramsPaginated(\n  agencyId: string,')
    expect(source).toContain('WHERE a.agency_id = ${agencyId}\n            AND a.playbook_id IS NOT NULL')
    expect(source).toContain('WHERE agency_id = ${agencyId} AND playbook_id IS NOT NULL AND application_name ILIKE')
    expect(source).toContain('WHERE agency_id = ${agencyId} AND playbook_id IS NOT NULL`')
    expect(source).toContain('getRequestedProgramsForAgency(agencyId: string)')
    expect(source).toContain("WHERE a.agency_id = ${agencyId}\n        AND a.status = 'requested'")
  })

  test('uses the authenticated agency for list and direct-detail reads', () => {
    const listPage = read('src/app/pages/agency/programs/page.tsx')
    const detailPage = read('src/app/pages/agency/programs/[applicationId]/page.tsx')
    const legacyDetailPage = read('src/app/pages/agency/applications/[id]/page.tsx')
    const queries = read('src/lib/supabase/query/applications.ts')

    expect(listPage).toContain('getApplicationsWithProgramsPaginated(actor.agencyId')
    expect(listPage).toContain('getRequestedProgramsForAgency(actor.agencyId)')
    expect(detailPage).toContain('getApplicationByIdAndAgencyId(applicationId, actor.agencyId)')
    expect(detailPage.indexOf('getApplicationByIdAndAgencyId')).toBeLessThan(
      detailPage.indexOf('getApplicationPlaybookItems')
    )
    expect(queries).toContain('WHERE id = ${applicationId} AND agency_id = ${agencyId}')
    expect(legacyDetailPage).toContain('getApplicationByIdAndAgencyId(id, actor.agencyId)')
  })

  test('scopes pending-request cancellation and records an audit event atomically', () => {
    const actions = read('src/app/actions/applications.ts')
    const cancellation = actions.slice(actions.indexOf('export async function cancelProgramRequest'))

    expect(cancellation).toContain("requireAgencyCapability('homesights_services')")
    expect(cancellation).toContain('WHERE id = ${applicationId} AND agency_id = ${actor.agencyId}')
    expect(cancellation).toContain('AND agency_id = ${actor.agencyId}')
    expect(cancellation).toContain("'CANCEL_REQUEST'")
    expect(cancellation).toContain('withUserContext(actor.userId, actor.role, actor.agencyId')
  })

  test('authorizes application children through exact membership and plan capability', () => {
    const access = read('src/lib/repositories/application-access.ts')
    const playbookActions = read('src/app/actions/playbooks.ts')
    const documentActions = read('src/app/actions/application-documents.ts')
    const queryBridge = read('src/app/actions/query-bridge.ts')

    expect(access).toContain('membership.agency_id = ${application.agency_id}::uuid')
    expect(access).toContain('membership.role = ${actor.role}')
    expect(access).toContain("membership.status = 'active'")
    expect(access).toContain("plan_capability.capability_key = 'homesights_services'")
    expect(access).toContain("actor.role === 'expert' && application.assigned_expert_id === actor.id")

    expect(playbookActions).toContain('withAuthorizedApplication({ playbookItemId: applicationPlaybookItemId }')
    expect(playbookActions).toContain('withAuthorizedApplication({ documentId }')
    expect(playbookActions).toContain('withAuthorizedApplication({ playbookItemId: itemId }')
    expect(documentActions).toContain('withAuthorizedApplication(\n      { applicationId },')
    expect(documentActions).toContain('upload.agencyId !== application.agencyId')
    expect(queryBridge).toContain('withAuthorizedApplication({ applicationId: args[0] }, () => q.getApplicationDocumentsByApplicationId')
    expect(queryBridge).toContain('withAuthorizedApplication({ conversationId: args[0] }, () => q.getMessagesByConversationId')
  })

  test('keeps staff-only service items and notes out of agency responses and navigation', () => {
    const actions = read('src/app/actions/playbooks.ts')
    const detailPage = read('src/app/pages/agency/programs/[applicationId]/page.tsx')
    const modal = read('src/components/ProgramItemDetailModal.tsx')
    const applicationDetail = read('src/components/ApplicationDetailContent.tsx')

    expect(actions).toContain("items.filter(item => item.assignment === 'client' || item.assignment === 'both')")
    expect(detailPage).toContain("filter(item => item.assignment === 'client' || item.assignment === 'both')")
    expect(modal).toContain("...(isStaff ? [{ id: 'notes' as TabId, label: 'Notes' }] : [])")
    expect(applicationDetail).toContain("currentUserRole === 'expert' || currentUserRole === 'admin'")
  })
})
