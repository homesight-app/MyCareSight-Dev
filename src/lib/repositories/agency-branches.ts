import 'server-only'
import { randomUUID } from 'node:crypto'
import sql, { withUserContext } from '@/db'
import { getSession } from '@/lib/auth'
import { agencyBranchesEnabled, BRANCH_OPTION_LIMIT, BRANCH_PAGE_SIZE, type AgencyBranch, type BranchRecordKind } from '@/lib/agency-branches'
import type { BranchFormData } from '@/lib/schemas/agency-branches'
import { assertAgencyCapability } from '@/lib/feature-access'

export class BranchError extends Error {}
type Actor = { id: string; agencyId: string; role: 'company_owner' | 'care_coordinator' }
type SetupActor = Omit<Actor, 'role'> & { role: Actor['role'] | 'admin' }

/** Fresh active profile AND exact active membership; no submitted tenant/role. */
export async function withBranchActor<T>(ownerOnly: boolean, run: (actor: Actor) => Promise<T>, requireFeature = true): Promise<T> {
  if (requireFeature && !agencyBranchesEnabled()) throw new BranchError('Branch setup is not enabled yet.')
  const session = await getSession()
  if (!session) throw new BranchError('Not authenticated')
  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const [profile] = await sql<{ id: string; agency_id: string; role: Actor['role'] }[]>`
      SELECT p.id, p.agency_id, p.role FROM public.user_profiles p
      WHERE p.id = ${session.user.id}::uuid AND p.is_active = true
        AND p.role IN ('company_owner', 'care_coordinator') AND p.agency_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.user_agency_roles m WHERE m.user_id = p.id
          AND m.agency_id = p.agency_id AND m.role = p.role AND m.status = 'active')
      LIMIT 1
    `
    if (!profile || (ownerOnly && profile.role !== 'company_owner')) throw new BranchError('Forbidden')
    if (session.profile?.role !== profile.role || session.profile?.agency_id !== profile.agency_id) {
      await sql`SELECT set_config('app.current_user_role', ${profile.role}, true), set_config('app.current_agency_id', ${profile.agency_id}, true)`
    }
    return run({ id: profile.id, agencyId: profile.agency_id, role: profile.role })
  })
}

/** Explicit cross-agency setup is platform-admin only, never a submitted tenant grant. */
async function withSetupActor<T>(ownerOnly: boolean, agencyId: string | undefined, run: (actor: SetupActor) => Promise<T>): Promise<T> {
  if (agencyId === undefined) return withBranchActor(ownerOnly, run)
  if (!agencyBranchesEnabled()) throw new BranchError('Branch setup is not enabled yet.')
  const session = await getSession()
  if (!session) throw new BranchError('Not authenticated')
  return withUserContext(session.user.id, session.profile?.role ?? '', session.profile?.agency_id ?? null, async () => {
    const [admin] = await sql`SELECT id FROM public.user_profiles WHERE id = ${session.user.id}::uuid AND role = 'admin' AND is_active = true LIMIT 1`
    if (!admin) throw new BranchError('Forbidden')
    await sql`SELECT set_config('app.current_user_role', 'admin', true), set_config('app.current_agency_id', ${agencyId}, true)`
    const [agency] = await sql`SELECT id FROM public.agencies WHERE id = ${agencyId}::uuid LIMIT 1`
    if (!agency) throw new BranchError('Agency not found.')
    return run({ id: session.user.id, agencyId, role: 'admin' })
  })
}

async function audit(actor: SetupActor, operation: string, recordId: string | null, table = 'agency_branches', identifiers: Record<string, unknown> = {}) {
  await sql`INSERT INTO public.audit_log(agency_id, table_name, record_id, action, performed_by_user_id, details)
    VALUES (${actor.agencyId}::uuid, ${table}, ${recordId}::uuid, ${operation.startsWith('read_') ? 'READ' : operation.startsWith('create_') ? 'CREATE' : 'UPDATE'},
      ${actor.id}::uuid, ${JSON.stringify({ operation, ...identifiers })}::jsonb)`
}

async function lockAgency(actor: SetupActor) {
  const rows = await sql`SELECT id FROM public.agencies WHERE id = ${actor.agencyId}::uuid FOR UPDATE`
  if (!rows.length) throw new BranchError('Agency not found.')
}

export type BranchSort = { key: 'name' | 'city' | 'state' | 'status' | 'code'; dir: 'asc' | 'desc' }

export async function listBranches(page: number, search: string, sort: BranchSort = { key: 'name', dir: 'asc' }, agencyId?: string) {
  return withSetupActor(false, agencyId, async actor => {
    const column = sort.key === 'city' ? sql`city` : sort.key === 'state' ? sql`state` : sort.key === 'status' ? sql`status` : sort.key === 'code' ? sql`code` : sql`name`
    const direction = sort.dir === 'desc' ? sql`DESC` : sql`ASC`
    const rows = await sql<(AgencyBranch & { total_count: number })[]>`SELECT id, agency_id, code, name, is_default, status, timezone,
      count(*) OVER()::int AS total_count,
      street_address, city, state, zip_code, phone, email FROM public.agency_branches
      WHERE agency_id = ${actor.agencyId}::uuid AND (name ILIKE ${'%' + search + '%'} OR code ILIKE ${'%' + search + '%'})
      ORDER BY ${column} ${direction} NULLS LAST, id LIMIT ${BRANCH_PAGE_SIZE + 1} OFFSET ${page * BRANCH_PAGE_SIZE}`
    await audit(actor, 'read_branches', null)
    return { rows: rows.slice(0, BRANCH_PAGE_SIZE).map(({ total_count: _totalCount, ...branch }) => branch), hasMore: rows.length > BRANCH_PAGE_SIZE, totalCount: Number(rows[0]?.total_count ?? 0) }
  })
}

async function options(actor: Actor) {
  const rows = await sql<AgencyBranch[]>`SELECT id, agency_id, code, name, is_default, status, timezone,
    street_address, city, state, zip_code, phone, email FROM public.agency_branches
    WHERE agency_id = ${actor.agencyId}::uuid ORDER BY code, id LIMIT ${BRANCH_OPTION_LIMIT + 1}`
  if (rows.length > BRANCH_OPTION_LIMIT) throw new BranchError('This agency exceeds the branch selector limit. Contact support.')
  return rows
}

export async function branchOptions() {
  return withBranchActor(false, async actor => {
    const rows = await options(actor)
    await audit(actor, 'read_branch_options', null)
    return rows.map(({ id, name, status, is_default }) => ({ id, name, status, is_default }))
  })
}

export async function saveBranch(data: BranchFormData, agencyId?: string) {
  return withSetupActor(true, agencyId, async actor => {
    await lockAgency(actor)
    const [tz] = await sql`SELECT 1 FROM pg_timezone_names WHERE name = ${data.timezone} LIMIT 1`
    if (!tz) throw new BranchError('Choose a valid time zone.')
    let recordId: string
    if (data.id) {
      const [existing] = await sql`SELECT id FROM public.agency_branches
        WHERE id = ${data.id}::uuid AND agency_id = ${actor.agencyId}::uuid FOR UPDATE`
      if (!existing) throw new BranchError('Branch not found.')
      const rows = await sql`UPDATE public.agency_branches SET name = ${data.name}, timezone = ${data.timezone},
        street_address = ${data.street_address || null}, city = ${data.city || null}, state = ${data.state || null},
        zip_code = ${data.zip_code || null}, phone = ${data.phone || null}, email = ${data.email || null}, updated_at = now()
        WHERE id = ${data.id}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
      if (!rows.length) throw new BranchError('Branch was not saved.')
      recordId = data.id
    } else {
      const [count] = await sql`SELECT count(*)::int AS count FROM public.agency_branches WHERE agency_id = ${actor.agencyId}::uuid`
      if (Number(count.count) >= BRANCH_OPTION_LIMIT) throw new BranchError('The initial release supports up to 100 branches per agency.')
      // A display/reference code, independent of the UUID PK and default status.
      // Generated only on the server; submitted codes never affect persistence.
      const code = `br-${randomUUID().replaceAll('-', '')}`
      const [row] = await sql`INSERT INTO public.agency_branches(agency_id, code, name, timezone, street_address, city, state, zip_code, phone, email)
        VALUES (${actor.agencyId}::uuid, ${code}, ${data.name}, ${data.timezone}, ${data.street_address || null},
          ${data.city || null}, ${data.state || null}, ${data.zip_code || null}, ${data.phone || null}, ${data.email || null}) RETURNING id`
      recordId = row.id
    }
    await audit(actor, data.id ? 'update_branch' : 'create_branch', recordId)
    return recordId
  })
}

export async function changeBranchState(branchId: string, operation: 'default' | 'activate' | 'deactivate', agencyId?: string) {
  return withSetupActor(true, agencyId, async actor => {
    await lockAgency(actor)
    const [branch] = await sql`SELECT id, is_default, status FROM public.agency_branches
      WHERE id = ${branchId}::uuid AND agency_id = ${actor.agencyId}::uuid FOR UPDATE`
    if (!branch) throw new BranchError('Branch not found.')
    if (operation === 'default') {
      if (branch.status !== 'active') throw new BranchError('Activate this branch first.')
      await sql`UPDATE public.agency_branches SET is_default = false, updated_at = now() WHERE agency_id = ${actor.agencyId}::uuid AND is_default`
      const changed = await sql`UPDATE public.agency_branches SET is_default = true, updated_at = now() WHERE id = ${branchId}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
      if (changed.length !== 1) throw new BranchError('Default branch was not saved.')
    } else {
      if (operation === 'deactivate') {
        if (branch.is_default) throw new BranchError('Choose another default before deactivating this branch.')
        const [used] = await sql`SELECT
          EXISTS (SELECT 1 FROM public.leads WHERE agency_id = ${actor.agencyId}::uuid AND branch_id = ${branchId}::uuid)
          OR EXISTS (SELECT 1 FROM public.patients WHERE agency_id = ${actor.agencyId}::uuid AND branch_id = ${branchId}::uuid)
          OR EXISTS (SELECT 1 FROM public.application_branches WHERE agency_id = ${actor.agencyId}::uuid AND branch_id = ${branchId}::uuid) AS present`
        if (used.present) throw new BranchError('This branch has linked records. Transfer them before deactivating it.')
      }
      const changed = await sql`UPDATE public.agency_branches SET status = ${operation === 'activate' ? 'active' : 'inactive'}, updated_at = now()
        WHERE id = ${branchId}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
      if (changed.length !== 1) throw new BranchError('Branch status was not saved.')
    }
    await audit(actor, 'branch_' + operation, branchId)
  })
}

async function recordBranches(actor: Actor, kind: BranchRecordKind, recordId: string, lock: boolean) {
  await assertAgencyCapability(actor.agencyId, kind === 'application' ? 'homesights_services' : 'client_management')
  const lockClause = lock ? sql`FOR UPDATE` : sql``
  if (kind === 'application') {
    const rows = await sql`SELECT id FROM public.applications WHERE id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid
      AND caregiver_member_id IS NULL ${lockClause}`
    if (!rows.length) throw new BranchError('Program not found.')
    const links = await sql<{ branch_id: string }[]>`SELECT branch_id FROM public.application_branches
      WHERE application_id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid ORDER BY branch_id LIMIT ${BRANCH_OPTION_LIMIT}`
    return links.map(row => row.branch_id)
  }
  const rows = kind === 'lead'
    ? await sql<{ branch_id: string }[]>`SELECT branch_id FROM public.leads WHERE id = ${recordId}::uuid
        AND agency_id = ${actor.agencyId}::uuid AND lead_type = 'patient' ${lockClause}`
    : await sql<{ branch_id: string }[]>`SELECT branch_id FROM public.patients WHERE id = ${recordId}::uuid
        AND agency_id = ${actor.agencyId}::uuid ${lockClause}`
  if (!rows.length) throw new BranchError('Record not found.')
  return rows[0].branch_id ? [rows[0].branch_id] : []
}

export async function getRecordBranchAssignment(kind: BranchRecordKind, recordId: string) {
  return withBranchActor(false, async actor => {
    const branchIds = await recordBranches(actor, kind, recordId, false)
    const branches = await options(actor)
    await audit(actor, 'read_record_branches', recordId, kind === 'client' ? 'patients' : kind === 'lead' ? 'leads' : 'applications')
    return { branchIds, branches: branches.map(({ id, name, status }) => ({ id, name, status })), canEdit: actor.role === 'company_owner' }
  })
}

export async function assignRecordBranches(kind: BranchRecordKind, recordId: string, branchIds: string[]) {
  return withBranchActor(true, actor => assignRecordBranchesInTransaction(actor, kind, recordId, branchIds))
}

/** Reuse the same authorization, locks, transfer checks and audit in an existing form save. */
export async function saveRecordAttributesWithBranch<T>(kind: 'lead' | 'client', recordId: string, branchId: string, save: (actor: Actor) => Promise<T>) {
  return withBranchActor(true, async actor => {
    await assignRecordBranchesInTransaction(actor, kind, recordId, [branchId], true)
    return save(actor)
  })
}

async function assignRecordBranchesInTransaction(actor: Actor, kind: BranchRecordKind, recordId: string, branchIds: string[], skipUnchanged = false) {
    await lockAgency(actor)
    const previousBranchIds = await recordBranches(actor, kind, recordId, true)
    if (kind === 'lead') {
      const [lead] = await sql`SELECT converted_at FROM public.leads WHERE id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid`
      if (lead.converted_at) throw new BranchError('Change the branch on the converted client instead.')
    }
    if (skipUnchanged && previousBranchIds.length === 1 && previousBranchIds[0] === branchIds[0]) return
    const valid = await sql`SELECT id FROM public.agency_branches WHERE agency_id = ${actor.agencyId}::uuid
      AND id = ANY(${branchIds}::uuid[]) AND status = 'active' FOR SHARE`
    if (valid.length !== branchIds.length) throw new BranchError('Choose active branches belonging to this agency.')
    if (kind === 'application') {
      await sql`DELETE FROM public.application_branches WHERE application_id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid`
      await sql`INSERT INTO public.application_branches(application_id, agency_id, branch_id)
        SELECT ${recordId}::uuid, ${actor.agencyId}::uuid, branch_id FROM unnest(${branchIds}::uuid[]) AS branch_id`
    } else if (kind === 'lead') {
      const changed = await sql`UPDATE public.leads SET branch_id = ${branchIds[0]}::uuid, updated_at = now()
        WHERE id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
      if (changed.length !== 1) throw new BranchError('Lead assignment was not saved.')
    } else {
      // Phase 1 has no visit branch snapshots. Hold transfers of scheduled
      // clients until Phase 2 can preserve historical operational attribution.
      if (previousBranchIds[0] !== branchIds[0]) {
        const visits = await sql`SELECT id FROM public.scheduled_visits WHERE agency_id = ${actor.agencyId}::uuid
          AND patient_id = ${recordId}::uuid LIMIT 1`
        if (visits.length) throw new BranchError('This client has visits. Use the Phase 2 reviewed transfer workflow when available.')
      }
      const changed = await sql`UPDATE public.patients SET branch_id = ${branchIds[0]}::uuid, updated_at = now()
        WHERE id = ${recordId}::uuid AND agency_id = ${actor.agencyId}::uuid RETURNING id`
      if (changed.length !== 1) throw new BranchError('Client assignment was not saved.')
    }
    await audit(actor, 'assign_record_branches', recordId, kind === 'client' ? 'patients' : kind === 'lead' ? 'leads' : 'applications', {
      previous_branch_ids: previousBranchIds, branch_ids: branchIds,
    })
}

export async function readAgencyInfo() {
  return withBranchActor(true, async actor => {
    const [data] = await sql<import('@/lib/agency-branches').AgencyInfoRecord[]>`SELECT id, name, business_type, tax_id, primary_license_number, website,
      physical_street_address, physical_city, physical_state, physical_zip_code, same_as_physical,
      mailing_street_address, mailing_city, mailing_state, mailing_zip_code
      FROM public.agencies WHERE id = ${actor.agencyId}::uuid LIMIT 1`
    if (!data) throw new BranchError('Agency not found.')
    await audit(actor, 'read_agency_info', actor.agencyId, 'agencies')
    return data
  }, false)
}

export async function updateAgencyInfo(data: import('@/lib/schemas/profile').CompanyDetailsFormOutput) {
  return withBranchActor(true, async actor => {
      // Only fields actually edited by this form are written. Other legal,
      // onboarding, plan and branding fields are never cleared by omission.
      const rows = await sql`UPDATE public.agencies SET name = ${data.companyName.trim()}, business_type = ${data.businessType.trim()},
        tax_id = ${data.taxId.trim()}, primary_license_number = ${data.primaryLicenseNumber.trim()}, website = ${data.website || null},
        physical_street_address = ${data.physicalStreetAddress.trim()}, physical_city = ${data.physicalCity.trim()},
        physical_state = ${data.physicalState.trim()}, physical_zip_code = ${data.physicalZipCode.trim()},
        same_as_physical = ${data.sameAsPhysical}, mailing_street_address = ${data.mailingStreetAddress || null},
        mailing_city = ${data.mailingCity || null}, mailing_state = ${data.mailingState || null}, mailing_zip_code = ${data.mailingZipCode || null}, updated_at = now()
        WHERE id = ${actor.agencyId}::uuid RETURNING id`
      if (!rows.length) throw new BranchError('Agency was not saved.')

    await sql`UPDATE public.agency_admins SET company_name = ${data.companyName.trim()}
      WHERE user_id = ${actor.id}::uuid AND agency_id = ${actor.agencyId}::uuid`

    await audit(actor, 'update_agency_info', actor.agencyId, 'agencies')
  }, false)
}

/** The existing request flow calls this only for explicit agency-owner branch selection. */
export async function requestProgramWithBranches(data: import('zod').infer<typeof import('@/lib/schemas/agency-branches').programBranchRequestSchema>) {
  return withBranchActor(true, async actor => {
    await assertAgencyCapability(actor.agencyId, 'homesights_services')
    await lockAgency(actor)
    const [catalog] = await sql<{ id: string; name: string }[]>`SELECT p.id, p.name FROM public.playbooks p
      LEFT JOIN public.license_requirements requirement ON requirement.id = p.license_requirement_id
      WHERE p.id = ${data.playbook_id}::uuid AND p.is_active = true
        AND (coalesce(p.state, requirement.state) IS NULL OR coalesce(p.state, requirement.state) = ${data.state}) LIMIT 1`
    if (!catalog) throw new BranchError('This program is not available for the selected state.')
    const valid = await sql`SELECT id FROM public.agency_branches WHERE agency_id = ${actor.agencyId}::uuid
      AND id = ANY(${data.branchIds}::uuid[]) AND status = 'active' FOR SHARE`
    if (valid.length !== data.branchIds.length) throw new BranchError('Choose active branches belonging to this agency.')
    const [existing] = await sql`SELECT id, playbook_id, state, status FROM public.applications WHERE id = ${data.requestId}::uuid
      AND agency_id = ${actor.agencyId}::uuid FOR UPDATE`
    if (existing) {
      const linked = await recordBranches(actor, 'application', data.requestId, false)
      if (existing.playbook_id !== data.playbook_id || existing.state !== data.state || existing.status !== 'requested'
        || [...linked].sort().join() !== [...data.branchIds].sort().join()) throw new BranchError('This request has changed. Refresh before retrying.')
      return existing.id as string
    }
    // Derive the application title from the authorized catalog, never from the browser.
    await sql`INSERT INTO public.applications(id, agency_id, application_name, state, playbook_id, status,
      progress_percentage, started_date, last_updated_date, submitted_date)
      VALUES (${data.requestId}::uuid, ${actor.agencyId}::uuid, ${catalog.name}, ${data.state}, ${catalog.id}::uuid,
        'requested', 0, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE)`
    await sql`DELETE FROM public.application_branches WHERE application_id = ${data.requestId}::uuid AND agency_id = ${actor.agencyId}::uuid`
    await sql`INSERT INTO public.application_branches(application_id, agency_id, branch_id)
      SELECT ${data.requestId}::uuid, ${actor.agencyId}::uuid, branch_id FROM unnest(${data.branchIds}::uuid[]) AS branch_id`
    // One notification per active platform administrator, scoped to this exact
    // request transaction; never patches unrelated recent notifications.
    await sql`INSERT INTO public.notifications(user_id, title, type, message, action_url)
      SELECT id, 'New program request', 'general', 'A program request is ready for review.', '/pages/admin/programs'
      FROM public.user_profiles WHERE role = 'admin' AND is_active = true`
    await audit(actor, 'create_program_request', data.requestId, 'applications', { branch_ids: data.branchIds, playbook_id: catalog.id })
    return data.requestId
  })
}
