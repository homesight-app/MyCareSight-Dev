/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('lead ownership and collaborative task assignment contract', () => {
  const actions = read('src/app/actions/leads.ts')
  const detail = read('src/components/LeadDetailContent.tsx')
  const list = read('src/components/LeadsContent.tsx')
  const query = read('src/lib/supabase/query/leads.ts')
  const migration = read('scripts/migrations/045-lead-ownership-and-task-assignment.sql')
  const verifier = read('scripts/migrations/045-verify-lead-ownership-and-task-assignment.sql')

  test('uses role- and tenant-scoped collaborator eligibility on the server', () => {
    expect(actions).toContain("profile.role IN ('admin', 'expert')")
    expect(actions).toContain("profile.role IN ('company_owner', 'care_coordinator')")
    expect(actions).toContain("membership.status = 'active'")
    expect(actions).toContain('Select an active eligible lead owner')
    expect(actions).toContain('Select an active eligible task assignee')
  })

  test('defaults new tasks to the creator and audits owner/task assignment changes', () => {
    expect(actions).toContain('? access.session.user.id')
    expect(detail).toContain('useState(currentUserId)')
    expect(actions).toContain("'ASSIGN_OWNER'")
    expect(actions).toContain("'ASSIGN'")
    expect(actions).toContain('previous_assigned_to_user_id')
    expect(actions).not.toContain('contact_first_name: access.lead')
  })

  test('shows ownership and task collaboration controls in both lead experiences', () => {
    expect(detail).toContain('context.canAssign')
    expect(detail).toContain('updateLeadTaskAssignee')
    expect(detail).toContain("Assigned to {task.assignee?.full_name || 'Unassigned'}")
    expect(list).toContain('context.canAssign')
    expect(list).toContain('All Owners')
    expect(list).toContain('Filter leads by owner')
    expect(query).toContain("opts.owner === 'unassigned'")
    expect(query).toContain('getLeadOwnerOptions')
  })

  test('does not misrepresent an existing unavailable owner as unassigned', () => {
    expect(detail).toContain('const assignedLeadOwner = Array.isArray(lead.lead_owner)')
    expect(detail).toContain('const leadOwnerOptions = assignedLeadOwner && !assignedOwnerIsEligible')
    expect(detail).toContain("' (currently assigned)'")
  })

  test('loads creator and assignee display names in one task query', () => {
    expect(query).toContain('LEFT JOIN user_profiles creator')
    expect(query).toContain('LEFT JOIN user_profiles assignee')
    expect(query).toContain('creator_full_name')
    expect(query).toContain('assignee_full_name')
  })

  test('migration adds referential integrity and lookup indexes while keeping ownership optional', () => {
    expect(migration).toContain('leads_lead_owner_id_fkey')
    expect(migration).toContain('lead_tasks_assigned_to_fkey')
    expect(migration).toContain('lead_tasks_assigned_pending_idx')
    expect(migration).toContain('creator.id = lead.created_by')
    expect(migration).toContain('SET assigned_to = lead.lead_owner_id')
    expect(verifier).toContain('lead_owner_is_optional')
    expect(verifier).toContain('all_assignable_tasks_have_default_assignees')
    expect(verifier).toContain('no_orphaned_task_assignees')
  })
})
