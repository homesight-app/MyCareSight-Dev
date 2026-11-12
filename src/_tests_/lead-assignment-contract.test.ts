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

  test('defaults new tasks to the owner and audits owner/task assignment changes', () => {
    expect(actions).toContain('? access.lead.lead_owner_id')
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
  })

  test('loads creator and assignee display names in one task query', () => {
    expect(query).toContain('LEFT JOIN user_profiles creator')
    expect(query).toContain('LEFT JOIN user_profiles assignee')
    expect(query).toContain('creator_full_name')
    expect(query).toContain('assignee_full_name')
  })

  test('migration adds integrity, lookup indexes, and rejects ownerless active leads', () => {
    expect(migration).toContain('leads_lead_owner_id_fkey')
    expect(migration).toContain('lead_tasks_assigned_to_fkey')
    expect(migration).toContain('lead_tasks_assigned_pending_idx')
    expect(migration).toContain('Never select an arbitrary owner')
    expect(verifier).toContain('no_active_ownerless_leads')
    expect(verifier).toContain('no_orphaned_task_assignees')
  })
})
