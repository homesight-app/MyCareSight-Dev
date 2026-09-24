/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')
const migration = read('002-stage-missing-application-tables.sql')
const verification = read('002-verify-missing-application-tables.sql')
const seed = read('003-seed-synthetic-credentials.sql')
const managerReads = read('009-manager-visit-financial-read-access.sql')
const caregiverExecution = read('010-caregiver-visit-execution-access.sql')
const managerWrites = read('011-manager-visit-financial-write-access.sql')
const managerWriteHardening = read('011a-manager-visit-financial-update-policy-hardening.sql')
const tables = ['credential_catalog', 'caregiver_pay_rates', 'internal_notes', 'visit_time_entries',
  'visit_adjustment_history', 'visit_approvals', 'visit_financials']
const parents = ['agencies', 'caregiver_members', 'patients', 'user_profiles', 'scheduled_visits',
  'billing_codes', 'patient_service_contracts']
const KEY = '20000000-0000-4000-8000-000000000001'
const ENTRY = '20000000-0000-4000-8000-000000000002'
const HISTORY = '20000000-0000-4000-8000-000000000003'
const TASK = '20000000-0000-4000-8000-000000000004'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE ROLE mycaresight_app LOGIN NOBYPASSRLS NOSUPERUSER')
}, 60000)

beforeEach(async () => {
  // All destructive statements in this file target this disposable in-memory DB.
  await db.exec(`
    RESET ROLE;
    ALTER ROLE mycaresight_app NOBYPASSRLS NOSUPERUSER;
    DROP SCHEMA public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
  `)
  for (const table of parents) {
    await db.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY)`)
    await db.query(`INSERT INTO public.${table}(id) VALUES ($1)`, [KEY])
  }
})

afterAll(async () => { await db?.close() })

async function expectMigrationFailure(pattern: string | RegExp) {
  await expect(db.exec(migration)).rejects.toThrow(pattern)
  await db.exec('ROLLBACK')
}

async function expectNoStagedTables() {
  const result = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1 AND table_name=ANY($2::text[])',
    ['public', tables])
  expect(result.rows[0].count).toBe(0)
}

test('creates all seven empty tables with 100 columns, complete constraints, indexes and closed access', async () => {
  await db.exec(migration)
  const results = await db.exec(verification)
  const rows = results.flatMap(result => result.rows) as { stage_pass: boolean; actual_columns: number }[]
  expect(rows).toHaveLength(7)
  expect(rows.every(row => row.stage_pass)).toBe(true)
  expect(rows.reduce((total, row) => total + Number(row.actual_columns), 0)).toBe(100)
  for (const table of tables) {
    expect((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count).toBe(0)
  }
  const precision = await db.query<{ numeric_precision: number; numeric_scale: number }>(
    "SELECT numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='caregiver_pay_rates' AND column_name='pay_rate'")
  expect(precision.rows[0]).toMatchObject({ numeric_precision: 10, numeric_scale: 2 })
})

test('revokes inherited default runtime grants on every new table', async () => {
  await db.exec(migration)
  await db.exec('SET ROLE mycaresight_app')
  try {
    for (const table of tables) {
      await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toMatchObject({ code: '42501' })
    }
  } finally { await db.exec('RESET ROLE') }
})

test('RLS still denies rows and writes if a broad table grant is accidentally restored', async () => {
  await db.exec(migration)
  await db.exec(seed)
  await db.exec('GRANT SELECT, INSERT ON public.credential_catalog TO mycaresight_app; SET ROLE mycaresight_app')
  try {
    expect((await db.query('SELECT * FROM public.credential_catalog')).rows).toEqual([])
    await expect(db.query(`INSERT INTO public.credential_catalog(code,name,credential_type) VALUES ('TEST_DENIED','Synthetic denied record','skill')`))
      .rejects.toMatchObject({ code: '42501' })
  } finally { await db.exec('RESET ROLE') }
})

test('enforces credential check and uniqueness constraints', async () => {
  await db.exec(migration)
  await expect(db.query(`INSERT INTO public.credential_catalog(code,name,credential_type) VALUES ('TEST_INVALID','Synthetic','invalid')`))
    .rejects.toMatchObject({ code: '23514' })
  await db.exec(seed)
  await expect(db.query(`INSERT INTO public.credential_catalog(code,name,credential_type) VALUES ('TEST_SKILL','Synthetic duplicate','skill')`))
    .rejects.toMatchObject({ code: '23505' })
})

test('preserves required note attribution by restricting author deletion', async () => {
  await db.exec(migration)
  await db.query(`INSERT INTO public.internal_notes(agency_id,subject_type,subject_id,content,created_by)
    VALUES ($1,'patient',$1,'Synthetic note for integrity test',$1)`, [KEY])
  await expect(db.query('DELETE FROM public.user_profiles WHERE id=$1', [KEY])).rejects.toMatchObject({ code: '23001' })
  expect((await db.query('SELECT id FROM public.internal_notes')).rows).toHaveLength(1)
})

test('protects adjustment history from parent deletion cascades', async () => {
  await db.exec(migration)
  await db.query(`INSERT INTO public.visit_time_entries(id,agency_id,scheduled_visit_id,patient_id,caregiver_member_id)
    VALUES ($1,$2,$2,$2,$2)`, [ENTRY, KEY])
  await db.query(`INSERT INTO public.visit_adjustment_history(id,agency_id,visit_time_entry_id,changed_by_user_id)
    VALUES ($1,$2,$3,$2)`, [HISTORY, KEY, ENTRY])
  await expect(db.query('DELETE FROM public.visit_time_entries WHERE id=$1', [ENTRY])).rejects.toMatchObject({ code: '23001' })
  await expect(db.query('DELETE FROM public.agencies WHERE id=$1', [KEY])).rejects.toMatchObject({ code: '23001' })
  expect((await db.query('SELECT id FROM public.visit_adjustment_history')).rows).toHaveLength(1)
})

test('rejects missing parent keys before creating any target objects', async () => {
  await db.exec('DROP TABLE public.billing_codes')
  await expectMigrationFailure('parent table billing_codes')
  await expectNoStagedTables()
})

test('rejects a BYPASSRLS runtime role', async () => {
  await db.exec('ALTER ROLE mycaresight_app BYPASSRLS')
  await expectMigrationFailure('non-BYPASSRLS')
  await expectNoStagedTables()
})

test('rejects the Supabase source marker', async () => {
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid)')
  await expectMigrationFailure('not the Supabase source')
  await expectNoStagedTables()
})

test('rolls back every created table when a later index creation fails', async () => {
  await db.exec('CREATE TABLE public.idx_internal_notes_subject(id integer)')
  await expectMigrationFailure(/already exists/)
  await expectNoStagedTables()
  expect((await db.query("SELECT to_regprocedure('public.app_migration_set_updated_at()') AS helper")).rows)
    .toEqual([{ helper: null }])
})

test('refuses repeat schema execution without touching existing rows', async () => {
  await db.exec(migration)
  await db.exec(seed)
  await expectMigrationFailure('target already exists')
  expect((await db.query('SELECT id FROM public.credential_catalog')).rows).toHaveLength(4)
})

test('synthetic seed is repeatable and rolls back instead of overwriting changed references', async () => {
  await db.exec(migration)
  await db.exec(seed)
  await db.exec(seed)
  expect((await db.query('SELECT id FROM public.credential_catalog')).rows).toHaveLength(4)
  await db.exec(`DELETE FROM public.credential_catalog WHERE code='TEST_LICENSE';
    UPDATE public.credential_catalog SET name='Synthetic user edit' WHERE code='TEST_SKILL'`)
  await expect(db.exec(seed)).rejects.toThrow('conflicts with a reserved synthetic fixture')
  await db.exec('ROLLBACK')
  expect((await db.query('SELECT id FROM public.credential_catalog')).rows).toHaveLength(3)
  expect((await db.query("SELECT name FROM public.credential_catalog WHERE code='TEST_SKILL'")).rows)
    .toEqual([{ name: 'Synthetic user edit' }])
})

test('portable timestamp trigger refreshes updated_at on update', async () => {
  await db.exec(migration)
  await db.query(`INSERT INTO public.credential_catalog(code,name,credential_type,updated_at)
    VALUES ('TEST_TIMESTAMP','Synthetic timestamp record','skill','2000-01-01T00:00:00Z')`)
  await db.exec("UPDATE public.credential_catalog SET name='Synthetic updated record' WHERE code='TEST_TIMESTAMP'")
  const result = await db.query<{ refreshed: boolean }>(
    "SELECT updated_at > '2001-01-01'::timestamptz AS refreshed FROM public.credential_catalog WHERE code='TEST_TIMESTAMP'")
  expect(result.rows[0].refreshed).toBe(true)
})

test('009 gives only active matching managers linked visit-financial reads',async()=>{
  await db.exec(`ALTER TABLE user_profiles ADD COLUMN role text;ALTER TABLE user_profiles ADD COLUMN is_active boolean;
    ALTER TABLE scheduled_visits ADD COLUMN agency_id uuid;ALTER TABLE scheduled_visits ADD COLUMN patient_id uuid;
    ALTER TABLE scheduled_visits ADD COLUMN caregiver_member_id uuid;
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
    UPDATE user_profiles SET role='company_owner',is_active=true;
    UPDATE scheduled_visits SET agency_id='${KEY}',patient_id='${KEY}',caregiver_member_id='${KEY}';`)
  await db.exec(migration)
  await db.query(`INSERT INTO user_agency_roles VALUES ($1,$1,'company_owner','active')`,[KEY])
  await db.query(`INSERT INTO visit_time_entries(id,agency_id,scheduled_visit_id,patient_id,caregiver_member_id)
    VALUES ($1,$2,$2,$2,$2)`,[ENTRY,KEY])
  await db.query(`INSERT INTO visit_adjustment_history(id,agency_id,visit_time_entry_id,changed_by_user_id)
    VALUES ($1,$2,$3,$2)`,[HISTORY,KEY,ENTRY])
  await db.exec(managerReads)
  await db.exec(`SET ROLE mycaresight_app;SELECT set_config('app.current_user_id','${KEY}',false)`)
  try{
    expect((await db.query('SELECT id FROM visit_time_entries')).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM visit_adjustment_history')).rows).toHaveLength(1)
    await expect(db.exec(`UPDATE visit_time_entries SET entry_status='approved'`)).rejects.toMatchObject({code:'42501'})
    await db.exec('RESET ROLE')
    await db.exec(`UPDATE user_agency_roles SET status='invited';SET ROLE mycaresight_app;SELECT set_config('app.current_user_id','${KEY}',false)`)
    expect((await db.query('SELECT id FROM visit_time_entries')).rows).toEqual([])
  }finally{await db.exec('RESET ROLE')}
})

test('009 verification reports exact SELECT-only policies',async()=>{
  await db.exec(`ALTER TABLE user_profiles ADD COLUMN role text;ALTER TABLE user_profiles ADD COLUMN is_active boolean;
    ALTER TABLE scheduled_visits ADD COLUMN agency_id uuid;ALTER TABLE scheduled_visits ADD COLUMN patient_id uuid;
    ALTER TABLE scheduled_visits ADD COLUMN caregiver_member_id uuid;
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);`)
  await db.exec(migration);await db.exec(managerReads)
  const rows=(await db.exec(read('009-verify-manager-visit-financial-read-access.sql'))).flatMap(r=>r.rows) as {read_access_pass:boolean}[]
  expect(rows).toHaveLength(4);expect(rows.every(r=>r.read_access_pass)).toBe(true)
})

async function prepareCaregiverExecution() {
  await db.exec(`
    ALTER TABLE user_profiles ADD COLUMN role text;
    ALTER TABLE user_profiles ADD COLUMN is_active boolean;
    ALTER TABLE user_profiles ADD COLUMN agency_id uuid;
    ALTER TABLE caregiver_members ADD COLUMN user_id uuid;
    ALTER TABLE caregiver_members ADD COLUMN agency_id uuid;
    ALTER TABLE caregiver_members ADD COLUMN status text;
    ALTER TABLE scheduled_visits ADD COLUMN agency_id uuid;
    ALTER TABLE scheduled_visits ADD COLUMN patient_id uuid;
    ALTER TABLE scheduled_visits ADD COLUMN caregiver_member_id uuid;
    ALTER TABLE scheduled_visits ADD COLUMN service_type text;
    ALTER TABLE scheduled_visits ADD COLUMN status text;
    ALTER TABLE scheduled_visits ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE scheduled_visit_tasks(id uuid PRIMARY KEY,agency_id uuid,scheduled_visit_id uuid,
      notes text,completed_at timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,
      action text,performed_by_user_id uuid,details jsonb);
    UPDATE user_profiles SET role='staff_member',is_active=true,agency_id='${KEY}';
    UPDATE caregiver_members SET user_id='${KEY}',agency_id='${KEY}',status='active';
    UPDATE scheduled_visits SET agency_id='${KEY}',patient_id='${KEY}',caregiver_member_id='${KEY}',
      service_type='non_skilled',status='scheduled';
    INSERT INTO user_agency_roles VALUES ('${KEY}','${KEY}','staff_member','active');
    INSERT INTO scheduled_visit_tasks(id,agency_id,scheduled_visit_id,notes)
      VALUES ('${TASK}','${KEY}','${KEY}','Synthetic task');
  `)
  await db.exec(migration)
  await db.exec(managerReads)
  await db.exec(caregiverExecution)
}

test('010 permits assigned caregiver execution and derives a pending financial row',async()=>{
  await prepareCaregiverExecution()
  await db.exec(`SET ROLE mycaresight_app;
    SELECT set_config('app.current_user_id','${KEY}',false),
      set_config('app.current_user_role','staff_member',false),set_config('app.current_agency_id','${KEY}',false)`)
  try {
    await db.exec(`INSERT INTO visit_time_entries
      (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,clock_in_time,entry_status)
      VALUES ('${KEY}','${KEY}','${KEY}','${KEY}',now(),'pending_review')`)
    expect((await db.query('SELECT id FROM visit_time_entries')).rows).toHaveLength(1)
    await db.exec(`UPDATE visit_time_entries SET clock_out_time=now(),actual_hours=1,billable_hours=1,updated_at=now()`)
    await db.exec(`UPDATE scheduled_visit_tasks SET completed_at=now(),updated_at=now() WHERE id='${TASK}'`)
    await expect(db.exec(`UPDATE scheduled_visit_tasks SET notes='Denied' WHERE id='${TASK}'`))
      .rejects.toMatchObject({code:'42501'})
  } finally { await db.exec('RESET ROLE') }
  expect((await db.query('SELECT status,approved_actual_hours::text hours FROM visit_financials')).rows)
    .toEqual([{status:'pending',hours:'1.00'}])
})

test('010 denies inactive caregivers and verifies exact grants and trigger',async()=>{
  await prepareCaregiverExecution()
  const rows=(await db.exec(read('010-verify-caregiver-visit-execution-access.sql'))).flatMap(r=>r.rows) as {access_pass:boolean}[]
  expect(rows).toHaveLength(1);expect(rows[0].access_pass).toBe(true)
  await db.exec(`UPDATE caregiver_members SET status='inactive';SET ROLE mycaresight_app;
    SELECT set_config('app.current_user_id','${KEY}',false)`)
  try {
    expect((await db.query('SELECT id FROM visit_time_entries')).rows).toEqual([])
    await expect(db.exec(`INSERT INTO visit_time_entries
      (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,clock_in_time,entry_status)
      VALUES ('${KEY}','${KEY}','${KEY}','${KEY}',now(),'pending_review')`)).rejects.toMatchObject({code:'42501'})
  } finally { await db.exec('RESET ROLE') }
})

async function prepareManagerWrites(){
  await prepareCaregiverExecution()
  await db.exec(`UPDATE user_profiles SET role='company_owner';
    UPDATE user_agency_roles SET role='company_owner',status='active';
    UPDATE caregiver_members SET status='active';`)
  await db.exec(managerWrites)
  await db.exec(managerWriteHardening)
}

test('011 permits linked manager approval writes while keeping history immutable',async()=>{
  await prepareManagerWrites()
  await db.exec(`SET ROLE mycaresight_app;
    SELECT set_config('app.current_user_id','${KEY}',false),set_config('app.current_user_role','company_owner',false),
      set_config('app.current_agency_id','${KEY}',false)`)
  try{
    const inserted=await db.query<{id:string}>(`INSERT INTO visit_time_entries
      (agency_id,scheduled_visit_id,patient_id,caregiver_member_id,entry_status)
      VALUES($1,$1,$1,$1,'submitted') RETURNING id`,[KEY])
    const entryId=inserted.rows[0]!.id
    await db.exec(`INSERT INTO visit_adjustment_history(agency_id,visit_time_entry_id,changed_by_user_id,reason,current_actual_hours)
      VALUES('${KEY}','${entryId}','${KEY}','synthetic_approval',1)`)
    const insertedApproval=await db.query<{id:string}>(`INSERT INTO visit_approvals
        (agency_id,scheduled_visit_id,visit_time_entry_id,patient_id,caregiver_member_id,
        approved_by_user_id,approval_status,approved_actual_hours,approved_billable_hours)
      VALUES($1,$1,$2,$1,$1,$1,'approved',1,1) RETURNING id`,[KEY,entryId])
    const approvalId=insertedApproval.rows[0]!.id
    await db.exec(`INSERT INTO visit_financials(agency_id,scheduled_visit_id,visit_time_entry_id,visit_approval_id,patient_id,
        caregiver_member_id,status,approved_actual_hours,approved_billable_hours)
      VALUES('${KEY}','${KEY}','${entryId}','${approvalId}','${KEY}','${KEY}','approved',1,1);
      UPDATE visit_time_entries SET actual_hours=1,billable_hours=1,entry_status='approved',updated_at=now()
        WHERE id='${entryId}';
      UPDATE visit_approvals SET approval_comment='Synthetic decision',updated_at=now() WHERE id='${approvalId}';
      UPDATE visit_financials SET coordinator_note='Synthetic decision',updated_at=now() WHERE scheduled_visit_id='${KEY}';`)
    await expect(db.exec(`DELETE FROM visit_adjustment_history`)).rejects.toMatchObject({code:'42501'})
  }finally{await db.exec('RESET ROLE')}
  expect((await db.query('SELECT status FROM visit_financials')).rows).toEqual([{status:'approved'}])
  expect((await db.query('SELECT approval_status FROM visit_approvals')).rows).toEqual([{approval_status:'approved'}])
  expect((await db.query('SELECT count(*)::int count FROM visit_adjustment_history')).rows).toEqual([{count:1}])
})

test('011 verification passes and inactive membership denies manager writes',async()=>{
  await prepareManagerWrites()
  const rows=(await db.exec(read('011-verify-manager-visit-financial-write-access.sql'))).flatMap(r=>r.rows) as {write_access_pass:boolean}[]
  expect(rows).toHaveLength(4);expect(rows.every(row=>row.write_access_pass)).toBe(true)
  await db.exec(`UPDATE user_agency_roles SET status='invited';SET ROLE mycaresight_app;
    SELECT set_config('app.current_user_id','${KEY}',false),set_config('app.current_user_role','company_owner',false),
      set_config('app.current_agency_id','${KEY}',false)`)
  try{
    await expect(db.exec(`INSERT INTO visit_time_entries(agency_id,scheduled_visit_id,patient_id,caregiver_member_id,entry_status)
      VALUES('${KEY}','${KEY}','${KEY}','${KEY}','submitted')`)).rejects.toMatchObject({code:'42501'})
  }finally{await db.exec('RESET ROLE')}
})

test('011a verifies linked old-row predicates on manager updates',async()=>{
  await prepareManagerWrites()
  const rows=(await db.exec(read('011a-verify-manager-visit-financial-update-policy-hardening.sql')))
    .flatMap(r=>r.rows) as {policy_hardening_pass:boolean}[]
  expect(rows).toHaveLength(2);expect(rows.every(row=>row.policy_hardening_pass)).toBe(true)
})
