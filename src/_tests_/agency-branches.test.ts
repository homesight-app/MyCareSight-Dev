/** @jest-environment node */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { getSession } from '@/lib/auth'
import { assignRecordBranches, branchOptions, changeBranchState, getRecordBranchAssignment, listBranches, readAgencyInfo, requestProgramWithBranches, saveBranch, updateAgencyInfo } from '@/lib/repositories/agency-branches'
import { getLeadStageCounts } from '@/lib/supabase/query/leads'
import { getPatientsByAgencyId, getPatientCountsByAgencyId } from '@/lib/supabase/query/patients'
import { getApplicationsWithProgramsPaginated } from '@/lib/supabase/query/playbooks'
import { convertPatientLeadToClientAction } from '@/app/actions/leads'
import { branchFormSchema } from '@/lib/schemas/agency-branches'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/supabase/query', () => ({}))
jest.mock('@/lib/storage', () => ({ STORAGE_BUCKET: {} }))
jest.mock('@/lib/storage/client', () => ({ removeFiles: jest.fn() }))
jest.mock('@/lib/feature-access', () => ({ assertAgencyCapability: jest.fn().mockResolvedValue(undefined) }))
let db: PGlite
jest.mock('@/db', () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      const params: unknown[] = []
      const compile = (part: { strings: readonly string[]; values: unknown[] }): string => part.strings.reduce((text, chunk, index) => {
        if (index === part.values.length) return text + chunk
        const value = part.values[index]
        if (value && typeof value === 'object' && 'strings' in value && 'values' in value) return text + chunk + compile(value as typeof part)
        params.push(value)
        return text + chunk + '$' + params.length
      }, '')
      return db.query(compile(this), params).then(result => result.rows).then(resolve, reject)
    },
  })
  tag.json = (value: unknown) => JSON.stringify(value)
  return { __esModule: true, default: tag, withUserContext: async (userId: string, role: string, agency: string, run: () => Promise<unknown>) => {
    await db.exec('SAVEPOINT actor_context')
    try {
      await db.query(`SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true), set_config('app.current_agency_id', $3, true)`, [userId, role, agency ?? ''])
      const result = await run()
      await db.exec('RELEASE SAVEPOINT actor_context')
      return result
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT actor_context; RELEASE SAVEPOINT actor_context')
      throw error
    }
  } }
})

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = id(1), COORDINATOR = id(2), FOREIGN = id(3), AGENCY = id(10), OTHER = id(11), LEAD = id(20), CLIENT = id(30), APP = id(40)
const form = { code: 'west', name: 'Synthetic West', timezone: 'America/Los_Angeles', street_address: '', city: '', state: '', zip_code: '', phone: '', email: '' }
let main: string

function login(userId = OWNER) { jest.mocked(getSession).mockResolvedValue({ user: { id: userId }, profile: {} } as Awaited<ReturnType<typeof getSession>>) }

beforeAll(async () => {
  db = new PGlite()
  // Minimal schema-only baseline, synthetic rows; never imports private exports.
  await db.exec(`
    CREATE ROLE mycaresight_schema_owner; CREATE ROLE mycaresight_app;
    GRANT ALL ON SCHEMA public TO mycaresight_schema_owner;
    SET ROLE mycaresight_schema_owner;
    CREATE TABLE agencies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, physical_street_address text, physical_city text,
      physical_state text, physical_zip_code text, phone_number text, email text);
    ALTER TABLE agencies ADD COLUMN business_type text, ADD COLUMN tax_id text, ADD COLUMN primary_license_number text,
      ADD COLUMN website text, ADD COLUMN same_as_physical boolean, ADD COLUMN mailing_street_address text,
      ADD COLUMN mailing_city text, ADD COLUMN mailing_state text, ADD COLUMN mailing_zip_code text,
      ADD COLUMN legal_entity_name text, ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE agency_admins(user_id uuid, agency_id uuid, company_name text);
    GRANT SELECT, UPDATE ON agency_admins TO mycaresight_app;
    CREATE TABLE user_profiles(id uuid PRIMARY KEY, agency_id uuid, role text, is_active boolean);
    CREATE TABLE user_agency_roles(user_id uuid, agency_id uuid, role text, status text);
    CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid REFERENCES agencies, lead_type text, converted_at timestamptz,
      status text DEFAULT 'active', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE patients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid NOT NULL REFERENCES agencies,
      status text DEFAULT 'active', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    ALTER TABLE patients ENABLE ROW LEVEL SECURITY; ALTER TABLE patients FORCE ROW LEVEL SECURITY;
    CREATE POLICY patients_agency_rls ON patients TO mycaresight_app USING (agency_id = nullif(current_setting('app.current_agency_id',true),'')::uuid)
      WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id',true),'')::uuid);
    CREATE TABLE applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid REFERENCES agencies, caregiver_member_id uuid);
    CREATE TABLE scheduled_visits(id uuid PRIMARY KEY, agency_id uuid, patient_id uuid);
    ALTER TABLE leads ADD COLUMN stage text DEFAULT 'new', ADD COLUMN service_type text, ADD COLUMN source text,
      ADD COLUMN lead_owner_id uuid, ADD COLUMN contact_first_name text, ADD COLUMN contact_last_name text,
      ADD COLUMN company_name text, ADD COLUMN contact_email text;
    ALTER TABLE leads ADD COLUMN converted_client_id uuid;
    ALTER TABLE patients ADD COLUMN first_name text DEFAULT '', ADD COLUMN last_name text DEFAULT '', ADD COLUMN email_address text, ADD COLUMN phone_number text;
    ALTER TABLE patients ADD COLUMN street_address text, ADD COLUMN city text, ADD COLUMN state text, ADD COLUMN zip_code text,
      ADD COLUMN emergency_contact_name text, ADD COLUMN emergency_phone text;
    CREATE TABLE agency_lead_stages(agency_id uuid, key text, is_won boolean);
    CREATE TABLE patient_lead_details(lead_id uuid, poc_name text, poc_phone text, poc_relationship text, poc_email text);
    CREATE TABLE lead_documents(lead_id uuid);
    GRANT SELECT ON agency_lead_stages, patient_lead_details, lead_documents TO mycaresight_app;
    CREATE TABLE patients_representatives(id uuid, patient_id uuid, name text, relationship text, phone_number text, email_address text, display_order integer);
    ALTER TABLE applications ADD COLUMN application_name text DEFAULT 'Synthetic Program', ADD COLUMN state text DEFAULT 'CA',
      ADD COLUMN status text DEFAULT 'requested', ADD COLUMN assigned_expert_id uuid, ADD COLUMN playbook_id uuid DEFAULT gen_random_uuid(), ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE TABLE application_playbook_items(id uuid, application_id uuid, status text, requirement_type text);
    ALTER TABLE applications ADD COLUMN progress_percentage integer, ADD COLUMN started_date date,
      ADD COLUMN last_updated_date date, ADD COLUMN submitted_date date;
    CREATE TABLE playbooks(id uuid PRIMARY KEY, name text, license_requirement_id uuid, state text, is_active boolean);
    CREATE TABLE license_requirements(id uuid PRIMARY KEY, state text);
    CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(), user_id uuid, title text, type text, message text, action_url text);
    GRANT SELECT ON playbooks, license_requirements TO mycaresight_app;
    GRANT SELECT, INSERT ON notifications TO mycaresight_app;
    GRANT SELECT ON patients_representatives, application_playbook_items TO mycaresight_app;
    GRANT SELECT ON scheduled_visits TO mycaresight_app;
    CREATE TABLE audit_log(agency_id uuid, table_name text, record_id uuid, action text, performed_by_user_id uuid, details jsonb);
    ALTER TABLE audit_log ADD COLUMN patient_id uuid;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agencies, leads, patients, applications, audit_log TO mycaresight_app;
    GRANT SELECT ON user_profiles, user_agency_roles TO mycaresight_app;
    CREATE FUNCTION skill_actor_is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = nullif(current_setting('app.current_user_id',true),'')::uuid AND role='admin' AND is_active) $$;
    CREATE FUNCTION skill_actor_can_manage_agency(agency uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM user_profiles p JOIN user_agency_roles m ON m.user_id=p.id AND m.role=p.role
        WHERE p.id = nullif(current_setting('app.current_user_id',true),'')::uuid AND p.is_active AND m.agency_id=agency
          AND m.status='active' AND p.role IN ('company_owner','care_coordinator')) $$;
    CREATE FUNCTION skill_actor_is_agency_owner(agency uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT skill_actor_can_manage_agency(agency) AND EXISTS (SELECT 1 FROM user_profiles WHERE id = nullif(current_setting('app.current_user_id',true),'')::uuid AND role='company_owner') $$;
    RESET ROLE;
  `)
  await db.query(`INSERT INTO agencies(id,name,physical_city) VALUES ($1,'Synthetic Agency','Synthetic City'),($2,'Synthetic Other',NULL)`, [AGENCY, OTHER])
  await db.query(`INSERT INTO user_profiles VALUES ($1,$4,'company_owner',true),($2,$4,'care_coordinator',true),($3,$5,'company_owner',true)`, [OWNER, COORDINATOR, FOREIGN, AGENCY, OTHER])
  await db.query(`INSERT INTO user_agency_roles VALUES ($1,$4,'company_owner','active'),($2,$4,'care_coordinator','active'),($3,$5,'company_owner','active')`, [OWNER, COORDINATOR, FOREIGN, AGENCY, OTHER])
  await db.query(`INSERT INTO leads(id,agency_id,lead_type) VALUES ($1,$2,'patient'),($3,NULL,'agency')`, [LEAD, AGENCY, id(21)])
  await db.query(`INSERT INTO patients(id,agency_id) VALUES ($1,$2)`, [CLIENT, AGENCY])
  await db.query(`INSERT INTO applications(id,agency_id) VALUES ($1,$2)`, [APP, AGENCY])
  await db.query(`INSERT INTO playbooks VALUES ($1,'Synthetic Catalog',NULL,'CA',true)`, [id(50)])
  await db.query(`INSERT INTO user_profiles VALUES ($1,NULL,'admin',true)`, [id(4)])
  await db.query(`INSERT INTO agency_admins VALUES ($1,$3,'Synthetic Agency'),($2,$4,'Synthetic Other')`, [OWNER, FOREIGN, AGENCY, OTHER])
  await db.exec(readFileSync(path.join(process.cwd(), 'scripts/manual/agency-branches/001-foundation.sql'), 'utf8'))
  main = (await db.query<{ id: string }>(`SELECT id FROM agency_branches WHERE agency_id=$1 AND is_default`, [AGENCY])).rows[0].id
}, 60000)

beforeEach(async () => { process.env.AGENCY_BRANCHES_ENABLED = 'true'; login(); await db.exec('BEGIN; SET LOCAL ROLE mycaresight_app;') })
afterEach(async () => { await db.exec('ROLLBACK'); delete process.env.AGENCY_BRANCHES_ENABLED })
afterAll(async () => { await db.close() })

test('backfills defaults and office metadata without assigning platform sales leads', async () => {
  const data = await listBranches(0, '')
  expect(data.rows).toHaveLength(1)
  expect(data.rows[0]).toMatchObject({ agency_id: AGENCY, is_default: true, city: 'Synthetic City', timezone: 'UTC' })
  expect((await getRecordBranchAssignment('lead', LEAD)).branchIds).toEqual([main])
  expect((await getRecordBranchAssignment('client', CLIENT)).branchIds).toEqual([main])
  expect((await getRecordBranchAssignment('application', APP)).branchIds).toEqual([main])
  expect((await db.query(`SELECT branch_id FROM leads WHERE id=$1`, [id(21)])).rows[0]).toMatchObject({ branch_id: null })
})

test('branch editing preserves legacy full state names as well as abbreviations', async () => {
  const parsed = branchFormSchema.parse({ ...form, state: 'California' })
  const branch = await saveBranch(parsed)
  expect((await listBranches(0, 'west')).rows.find(row => row.id === branch)?.state).toBe('California')
})

test('new defaults affect only new records; a new agency gets its first branch automatically', async () => {
  const west = await saveBranch(form)
  await changeBranchState(west, 'default')
  expect((await getRecordBranchAssignment('client', CLIENT)).branchIds).toEqual([main])
  const created = await db.query<{ branch_id: string }>(`INSERT INTO patients(agency_id) VALUES ($1) RETURNING branch_id`, [AGENCY])
  expect(created.rows[0].branch_id).toBe(west)
  await db.query(`INSERT INTO applications(id,agency_id) VALUES ($1,$2)`, [id(41), AGENCY])
  expect((await getRecordBranchAssignment('application', id(41))).branchIds).toEqual([west])
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO agencies(id,name) VALUES ($1,'Synthetic New')`, [id(12)])
  expect((await db.query(`SELECT is_default FROM agency_branches WHERE agency_id=$1`, [id(12)])).rows).toEqual([{ is_default: true }])
})

test('shares a program across two branches without duplicating the application; writes identifier-only audit', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('application', APP, [main, west])
  expect((await getRecordBranchAssignment('application', APP)).branchIds.sort()).toEqual([main, west].sort())
  expect((await db.query(`SELECT count(*)::int AS n FROM applications WHERE id=$1`, [APP])).rows).toEqual([{ n: 1 }])
  const events = await db.query<{ details: Record<string, unknown> }>(`SELECT details FROM audit_log WHERE record_id=$1 AND details->>'operation'='assign_record_branches'`, [APP])
  expect(events.rows[0].details).toEqual({ operation: 'assign_record_branches', previous_branch_ids: [main], branch_ids: [main, west] })
})

test('client transfers are agency-scoped and do not change lead or application branch assignments', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('client', CLIENT, [west])
  expect((await getRecordBranchAssignment('client', CLIENT)).branchIds).toEqual([west])
  expect((await getRecordBranchAssignment('lead', LEAD)).branchIds).toEqual([main])
  expect((await getRecordBranchAssignment('application', APP)).branchIds).toEqual([main])
  await expect(changeBranchState(west, 'deactivate')).rejects.toThrow('linked records')
})

test('the actual lead conversion action preserves a non-default branch instead of assigning the current default', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('lead', LEAD, [west])
  jest.mocked(getSession).mockResolvedValue({ user: { id: OWNER }, profile: { role: 'company_owner', agency_id: AGENCY } } as Awaited<ReturnType<typeof getSession>>)
  const result = await convertPatientLeadToClientAction({ leadId: LEAD, firstName: 'Synthetic', lastName: 'Intake' })
  expect(result.success).toBe(true)
  expect(result.patient?.branch_id).toBe(west)
  expect((await db.query('SELECT converted_client_id, status FROM leads WHERE id=$1', [LEAD])).rows[0]).toMatchObject({ converted_client_id: result.patient?.id, status: 'archived' })
})

test('coordinators retain agency-wide reads but cannot manage branches or assignments', async () => {
  login(COORDINATOR)
  expect((await getRecordBranchAssignment('client', CLIENT)).canEdit).toBe(false)
  await expect(saveBranch(form)).rejects.toThrow('Forbidden')
  await expect(assignRecordBranches('lead', LEAD, [main])).rejects.toThrow('Forbidden')
})

test.each(['pending', 'invited', 'inactive'])('rejects a %s membership even with a previously valid session', async status => {
  await db.exec('RESET ROLE')
  await db.query(`UPDATE user_agency_roles SET status=$1 WHERE user_id=$2`, [status, OWNER])
  await db.exec('SET LOCAL ROLE mycaresight_app')
  await expect(branchOptions()).rejects.toThrow('Forbidden')
})

test('rejects foreign records and forged branch IDs', async () => {
  login(FOREIGN)
  await expect(getRecordBranchAssignment('client', CLIENT)).rejects.toThrow('not found')
  await expect(assignRecordBranches('lead', LEAD, [main])).rejects.toThrow('not found')
  await expect(changeBranchState(main, 'default')).rejects.toThrow('not found')
  login()
  await expect(assignRecordBranches('lead', LEAD, [id(999)])).rejects.toThrow('active branches')
})

test('RLS hides foreign branch records and denies coordinator updates independently of UI', async () => {
  await db.query(`SELECT set_config('app.current_user_id',$1,true)`, [COORDINATOR])
  const foreignRows = await db.query(`SELECT id FROM agency_branches WHERE agency_id=$1`, [OTHER])
  expect(foreignRows.rows).toEqual([])
  expect((await db.query(`UPDATE agency_branches SET name='Forbidden' WHERE id=$1 RETURNING id`, [main])).rows).toEqual([])
  await expect(db.query(`INSERT INTO agency_branches(agency_id,code,name) VALUES ($1,'forged','Forbidden')`, [AGENCY])).rejects.toMatchObject({ code: '42501' })
})

test('rejects deactivating the default and preserves stable codes', async () => {
  await expect(changeBranchState(main, 'deactivate')).rejects.toThrow('another default')
  await expect(saveBranch({ ...form, id: main })).rejects.toThrow('codes cannot be changed')
})

test('holds transfers for clients with visits until historical attribution is implemented', async () => {
  const west = await saveBranch(form)
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO scheduled_visits VALUES ($1,$2,$3)', [id(80), AGENCY, CLIENT])
  await db.exec('SET LOCAL ROLE mycaresight_app')
  await expect(assignRecordBranches('client', CLIENT, [west])).rejects.toThrow('client has visits')
  expect((await getRecordBranchAssignment('client', CLIENT)).branchIds).toEqual([main])
})

test('does not access the database when the branch feature is disabled', async () => {
  delete process.env.AGENCY_BRANCHES_ENABLED
  jest.mocked(getSession).mockClear()
  await expect(branchOptions()).rejects.toThrow('not enabled')
  expect(getSession).not.toHaveBeenCalled()
})

test('branch list is bounded and paged on the server with deterministic order', async () => {
  for (let i = 0; i < 27; i++) await saveBranch({ ...form, code: `office-${String(i).padStart(2, '0')}` })
  const first = await listBranches(0, '')
  const second = await listBranches(1, '')
  expect(first.rows).toHaveLength(25)
  expect(first.hasMore).toBe(true)
  expect(second.rows).toHaveLength(3)
  expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(28)
  expect((await listBranches(0, 'office-26')).rows).toHaveLength(1)
})

test('lead stage aggregates, client page and counts use the same selected branch', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('lead', LEAD, [west])
  await assignRecordBranches('client', CLIENT, [west])
  expect(await getLeadStageCounts({ leadType: 'patient', agencyId: AGENCY, branchId: west })).toEqual({ all: 1, active: 1, archived: 0, new: 1 })
  expect(await getLeadStageCounts({ leadType: 'patient', agencyId: AGENCY, branchId: main })).toEqual({ all: 0, active: 0, archived: 0 })
  expect((await getPatientsByAgencyId(AGENCY, { branchId: west, pageSize: 1 })).data?.map(row => row.id)).toEqual([CLIENT])
  expect((await getPatientsByAgencyId(AGENCY, { branchId: main, pageSize: 1 })).data).toEqual([])
  expect(await getPatientCountsByAgencyId(AGENCY, west)).toEqual({ total: 1, active: 1 })
  expect(await getPatientCountsByAgencyId(AGENCY, main)).toEqual({ total: 0, active: 0 })
})

test('program branch filtering uses existence so shared links cannot multiply rows, counts or progress', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('application', APP, [main, west])
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO application_playbook_items VALUES ($1,$3,'approved','required'),($2,$3,'not_applicable','optional')`, [id(101), id(102), APP])
  await db.exec('SET LOCAL ROLE mycaresight_app')
  const all = await getApplicationsWithProgramsPaginated(AGENCY, { pageSize: 10 })
  const filtered = await getApplicationsWithProgramsPaginated(AGENCY, { pageSize: 10, branchId: west, search: 'Synthetic' })
  expect(all.error).toBeNull()
  expect(filtered.error).toBeNull()
  expect(all.count).toBe(1)
  expect(filtered.count).toBe(1)
  expect(filtered.data.map(row => row.id)).toEqual([APP])
  expect(filtered.data[0].progress_summary).toMatchObject({ approved: 1, notApplicable: 1, itemCount: 2 })
  expect(filtered.data[0].application_playbook_items).toEqual([])
})

test('a database constraint rejects an agency-owned lead assigned to a foreign branch', async () => {
  await db.exec('RESET ROLE')
  const foreign = (await db.query<{ id: string }>('SELECT id FROM agency_branches WHERE agency_id=$1', [OTHER])).rows[0].id
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER])
  await expect(db.query('UPDATE leads SET branch_id=$1 WHERE id=$2', [foreign, LEAD])).rejects.toMatchObject({ code: '23514' })
})

test('deferred invariants reject removing an agency default or all program branches', async () => {
  await db.query(`SELECT set_config('app.current_user_id',$1,true)`, [OWNER])
  await db.query('UPDATE agency_branches SET is_default=false WHERE id=$1', [main])
  await expect(db.exec('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({ code: '23514' })
})

test('program enrollment records selected branches atomically and replays without duplicate applications or notifications', async () => {
  const west = await saveBranch(form)
  const request = { requestId: id(60), playbook_id: id(50), state: 'CA', branchIds: [west] }
  expect(await requestProgramWithBranches(request)).toBe(request.requestId)
  expect(await requestProgramWithBranches(request)).toBe(request.requestId)
  expect((await getRecordBranchAssignment('application', request.requestId)).branchIds).toEqual([west])
  expect((await db.query(`SELECT count(*)::int AS n FROM applications WHERE id=$1`, [request.requestId])).rows).toEqual([{ n: 1 }])
  expect((await db.query(`SELECT count(*)::int AS n FROM notifications`)).rows).toEqual([{ n: 1 }])
  // Unrelated metadata updates that repeat agency_id cannot add the default back.
  await db.query('UPDATE applications SET agency_id=$1 WHERE id=$2', [AGENCY, request.requestId])
  expect((await getRecordBranchAssignment('application', request.requestId)).branchIds).toEqual([west])
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
})

test('an invalid enrollment branch or catalog state cannot leave an application behind', async () => {
  await expect(requestProgramWithBranches({ requestId: id(60), playbook_id: id(50), state: 'CA', branchIds: [id(999)] })).rejects.toThrow('active branches')
  await expect(requestProgramWithBranches({ requestId: id(60), playbook_id: id(50), state: 'FL', branchIds: [main] })).rejects.toThrow('not available')
  expect((await db.query('SELECT id FROM applications WHERE id=$1', [id(60)])).rows).toEqual([])
})

test('an audit failure rolls back the branch write', async () => {
  await db.exec('RESET ROLE; REVOKE INSERT ON audit_log FROM mycaresight_app; SET LOCAL ROLE mycaresight_app')
  await expect(saveBranch(form)).rejects.toMatchObject({ code: '42501' })
  expect((await db.query('SELECT id FROM agency_branches WHERE code=$1', [form.code])).rows).toEqual([])
})

test('the standalone operator verifier reports valid metadata and zero aggregate gaps', async () => {
  await db.exec('ROLLBACK')
  const results = await db.exec(readFileSync(path.join(process.cwd(), 'scripts/manual/agency-branches/002-verify.sql'), 'utf8'))
  const rows = results.flatMap(result => result.rows)
  expect(rows.some(row => row.agencies_without_default === 0 && row.programs_without_branch === 0)).toBe(true)
  expect(rows.some(row => row.patients_branch_required === true && row.branch_rls_forced === true && row.validated_record_constraints === true)).toBe(true)
  expect(rows.some(row => row.branch_triggers_valid === true)).toBe(true)
  expect(rows.some(row => row.branch_foreign_keys_valid === true)).toBe(true)
})

test('a program cannot commit without a branch even if its default trigger was disabled', async () => {
  await db.exec('RESET ROLE; ALTER TABLE applications DISABLE TRIGGER application_branch_default; SET LOCAL ROLE mycaresight_app')
  await db.query('INSERT INTO applications(id,agency_id) VALUES ($1,$2)', [id(71), AGENCY])
  await expect(db.exec('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({ code: '23514' })
})

test('an application becoming agency-owned gets a default, without changing explicit existing branch links', async () => {
  await db.query('INSERT INTO applications(id,agency_id,caregiver_member_id) VALUES ($1,$2,$3)', [id(71), AGENCY, id(72)])
  await db.query('UPDATE applications SET caregiver_member_id=NULL WHERE id=$1', [id(71)])
  expect((await getRecordBranchAssignment('application', id(71))).branchIds).toEqual([main])
  const west = await saveBranch(form)
  await assignRecordBranches('application', APP, [west])
  await db.query('UPDATE applications SET caregiver_member_id=$1 WHERE id=$2', [id(72), APP])
  await db.query('UPDATE applications SET caregiver_member_id=NULL WHERE id=$1', [APP])
  expect((await getRecordBranchAssignment('application', APP)).branchIds).toEqual([west])
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
})

function verifierWithinTestTransaction() {
  return readFileSync(path.join(process.cwd(), 'scripts/manual/agency-branches/002-verify.sql'), 'utf8')
    .replace(/^BEGIN READ ONLY;\s*$/m, '').replace(/^ROLLBACK;\s*$/m, '')
}

test('the verifier detects disabled branch triggers before any missing-row gap exists', async () => {
  await db.exec('RESET ROLE; ALTER TABLE applications DISABLE TRIGGER application_branch_default')
  const results = await db.exec(verifierWithinTestTransaction())
  expect(results.flatMap(result => result.rows).some(row => row.branch_triggers_valid === false)).toBe(true)
})

test.each(['missing', 'weakened'])('the verifier detects a %s program same-agency foreign key', async mode => {
  await db.exec('RESET ROLE; ALTER TABLE application_branches DROP CONSTRAINT application_branches_branch_id_agency_id_fkey')
  if (mode === 'weakened') await db.exec(`ALTER TABLE application_branches ADD CONSTRAINT application_branches_branch_id_agency_id_fkey
    FOREIGN KEY (branch_id) REFERENCES agency_branches(id) ON DELETE RESTRICT`)
  const results = await db.exec(verifierWithinTestTransaction())
  expect(results.flatMap(result => result.rows).some(row => row.branch_foreign_keys_valid === false)).toBe(true)
})

test('deleting every link from a surviving agency program is rejected at commit', async () => {
  await branchOptions()
  await db.query('DELETE FROM application_branches WHERE application_id=$1', [APP])
  await expect(db.exec('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({ code: '23514' })
})

test('deleting a program still cascades its links, including a program created in the same transaction', async () => {
  await branchOptions()
  await db.query('INSERT INTO applications(id,agency_id) VALUES ($1,$2)', [id(71), AGENCY])
  await db.query('DELETE FROM applications WHERE id=ANY($1::uuid[])', [[APP, id(71)]])
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  expect((await db.query('SELECT application_id FROM application_branches')).rows).toEqual([])
})

test.each(['inactive-profile', 'mismatched-role'])('fresh authorization rejects %s even with a valid session', async mode => {
  await db.exec('RESET ROLE')
  if (mode === 'inactive-profile') await db.query('UPDATE user_profiles SET is_active=false WHERE id=$1', [OWNER])
  else await db.query("UPDATE user_agency_roles SET role='care_coordinator' WHERE user_id=$1", [OWNER])
  await db.exec('SET LOCAL ROLE mycaresight_app')
  await expect(readAgencyInfo()).rejects.toThrow('Forbidden')
  await expect(saveBranch(form)).rejects.toThrow('Forbidden')
})

test('Agency Info writes only its displayed fields, keeps branch addresses independent and preserves other owners', async () => {
  await db.exec('RESET ROLE')
  await db.query("UPDATE agencies SET legal_entity_name='Synthetic Legal Entity' WHERE id=$1", [AGENCY])
  await db.exec('SET LOCAL ROLE mycaresight_app')
  await updateAgencyInfo({ companyName: 'Synthetic Renamed', businessType: 'Synthetic Type', taxId: 'SYNTHETIC-EIN',
    primaryLicenseNumber: 'SYNTHETIC-LICENSE', physicalStreetAddress: 'Synthetic Address', physicalCity: 'Synthetic New City',
    physicalState: 'California', physicalZipCode: '00000', sameAsPhysical: true })
  expect((await readAgencyInfo()).name).toBe('Synthetic Renamed')
  expect((await db.query('SELECT legal_entity_name FROM agencies WHERE id=$1', [AGENCY])).rows[0]).toEqual({ legal_entity_name: 'Synthetic Legal Entity' })
  expect((await listBranches(0, '')).rows[0].city).toBe('Synthetic City')
  expect((await db.query('SELECT company_name FROM agency_admins WHERE user_id=$1', [FOREIGN])).rows[0]).toEqual({ company_name: 'Synthetic Other' })
})

test('the moved Agency Info workflow remains usable before the branch foundation is installed', async () => {
  delete process.env.AGENCY_BRANCHES_ENABLED
  await db.exec('RESET ROLE; DROP TABLE agency_branches CASCADE; DROP TABLE application_branches CASCADE; SET LOCAL ROLE mycaresight_app')
  expect((await readAgencyInfo()).name).toBe('Synthetic Agency')
})

function upgradeWithinTestTransaction() {
  return readFileSync(path.join(process.cwd(), 'scripts/manual/agency-branches/003-program-link-hardening.sql'), 'utf8')
    .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
}

test('the operator upgrade can refresh an earlier foundation repeatedly without replacing explicit program links', async () => {
  const west = await saveBranch(form)
  await assignRecordBranches('application', APP, [west])
  await db.exec(`SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    RESET ROLE; DROP TRIGGER application_branch_required_on_application ON applications;
    ALTER TABLE applications DISABLE TRIGGER application_branch_default`)
  await db.exec(upgradeWithinTestTransaction())
  await db.exec(upgradeWithinTestTransaction())
  await db.exec('SET LOCAL ROLE mycaresight_app')
  expect((await getRecordBranchAssignment('application', APP)).branchIds).toEqual([west])
  await db.query('INSERT INTO applications(id,agency_id,caregiver_member_id) VALUES ($1,$2,$3)', [id(71), AGENCY, id(72)])
  await db.query('UPDATE applications SET caregiver_member_id=NULL WHERE id=$1', [id(71)])
  expect((await getRecordBranchAssignment('application', id(71))).branchIds).toEqual([main])
  await db.exec('SET CONSTRAINTS ALL IMMEDIATE')
  const rows = (await db.exec(verifierWithinTestTransaction())).flatMap(result => result.rows)
  expect(rows.some(row => row.branch_triggers_valid === true)).toBe(true)
})

test('the upgrade stops for pre-existing unlinked programs instead of guessing their branches', async () => {
  await db.exec(`RESET ROLE; DROP TRIGGER application_branch_required_on_application ON applications;
    ALTER TABLE applications DISABLE TRIGGER application_branch_default`)
  await db.query('INSERT INTO applications(id,agency_id) VALUES ($1,$2)', [id(71), AGENCY])
  await expect(db.exec(upgradeWithinTestTransaction())).rejects.toMatchObject({ code: '23514' })
})
