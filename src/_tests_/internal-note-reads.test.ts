/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSession } from '@/lib/auth'
import sql, { withUserContext } from '@/db'
import { readInternalNotesPanel, readApplicationNoteCounts, auditInternalNoteSearch, readLegacyInternalNotes } from '@/lib/repositories/internal-note-reads'
import { createInternalNote, updateInternalNote, deleteInternalNote, changeApplicationStatusWithNote } from '@/lib/repositories/internal-note-writes'

jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }))
let mockDb: PGlite
let mockFailAudit = false
let mockFailAuditForTable: string | null = null
let mockBeginCount = 0

// Keep the real AsyncLocalStorage/context helpers and SQL proxy. Substitute only
// postgres.js transport with disposable PostgreSQL, including the runtime role.
jest.mock('postgres', () => {
  type Executor = Pick<PGlite, 'query'>
  const makeTag = (executor: () => Executor) => (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment = {
      strings, values,
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = []
        const compile = (part: { strings: readonly string[]; values: unknown[] }): string =>
          part.strings.reduce((text, chunk, index) => {
            if (index === part.values.length) return text + chunk
            const value = part.values[index]
            if (value && typeof value === 'object' && 'strings' in value && 'values' in value) {
              return text + chunk + compile(value as typeof part)
            }
            params.push(value)
            return text + chunk + '$' + params.length
          }, '')
        const query = compile(fragment)
        if ((mockFailAudit || (mockFailAuditForTable && params.includes(mockFailAuditForTable))) && query.includes('INSERT INTO public.audit_log')) {
          return Promise.reject(new Error('synthetic audit outage with private parameters')).then(resolve,reject)
        }
        return executor().query(query,params).then(result => result.rows).then(resolve,reject)
      },
    }
    return fragment
  }
  const pool = Object.assign(makeTag(() => mockDb), {
    begin: async (fn: (tx: ReturnType<typeof makeTag>) => Promise<unknown>) => {
      mockBeginCount++
      return mockDb.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE mycaresight_app')
        return fn(makeTag(() => tx))
      })
    },
  })
  return { __esModule:true, default: () => pool }
})



const read=(name:string)=>readFileSync(join(process.cwd(),'scripts/migrations',name),'utf8')
const migration=read('007-internal-note-read-access.sql')
const id=(n:number)=>'70000000-0000-4000-8000-'+n.toString().padStart(12,'0')
const OWNER=id(1),STAFF=id(2),ADMIN=id(3),EXPERT=id(4),FOREIGN_OWNER=id(5),AGENCY=id(10),OTHER=id(11)
const PATIENT=id(20),CAREGIVER=id(21),VISIT=id(22),FOREIGN_PATIENT=id(23),FOREIGN_CAREGIVER=id(24)
const APP=id(30),STEP=id(31),DOC=id(32),ITEM=id(33),FOREIGN_APP=id(34),ORPHAN_STEP=id(35)
const notes={patient:id(40),caregiver:id(41),visit:id(42),application:id(43),step:id(44),document:id(45),item:id(46),
  badTag:id(47),badSubject:id(48),badApp:id(49),badPlatformTag:id(50),orphan:id(51),template:id(52),foreign:id(53)}
const panel=(subjectType:'patient'|'caregiver'|'visit'|'application'|'application_step'|'application_document'|'application_playbook_item'='patient',subjectId=PATIENT,agencyId=AGENCY)=>
  ({subjectType,subjectId,agencyId})
function login(actor=OWNER) {
  jest.mocked(getSession).mockResolvedValue({user:{id:actor},profile:{role:'admin',agency_id:OTHER}} as Awaited<ReturnType<typeof getSession>>)
}
beforeAll(async()=>{
  mockDb=new PGlite()
  await mockDb.exec('CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS')
},60000)
beforeEach(async()=>{
  mockFailAudit=false
  mockFailAuditForTable=null
  mockBeginCount=0
  await mockDb.exec(`RESET ROLE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
    CREATE TABLE agencies(id uuid PRIMARY KEY);
    CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,is_active boolean,full_name text DEFAULT 'Synthetic Actor');
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE patients(id uuid PRIMARY KEY,agency_id uuid,first_name text DEFAULT 'Synthetic',last_name text DEFAULT 'Patient');
    CREATE TABLE caregiver_members(id uuid PRIMARY KEY,agency_id uuid,first_name text DEFAULT 'Synthetic',last_name text DEFAULT 'Caregiver');
    CREATE TABLE scheduled_visits(id uuid PRIMARY KEY,agency_id uuid);
    CREATE TABLE billing_codes(id uuid PRIMARY KEY);
    CREATE TABLE patient_service_contracts(id uuid PRIMARY KEY);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
    CREATE TABLE applications(id uuid PRIMARY KEY,agency_id uuid,status text DEFAULT 'in_progress',
      closed_by uuid,closed_at timestamptz,close_reason text,completed_by uuid,completed_at timestamptz,
      complete_reason text,last_updated_date date);
    CREATE TABLE application_steps(id uuid PRIMARY KEY,application_id uuid);
    CREATE TABLE application_documents(id uuid PRIMARY KEY,application_id uuid);
    CREATE TABLE application_playbook_items(id uuid PRIMARY KEY,application_id uuid);
    ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
    ALTER TABLE patients FORCE ROW LEVEL SECURITY;
    CREATE POLICY patients_agency_rls ON patients USING (
      current_setting('app.current_user_role',true) IN ('admin','expert')
      OR (current_setting('app.current_user_role',true) IN ('company_owner','care_coordinator','staff_member')
        AND agency_id=NULLIF(current_setting('app.current_agency_id',true),'')::uuid));
  `)
  await mockDb.query('INSERT INTO agencies VALUES ($1),($2)',[AGENCY,OTHER])
  for(const [actor,role] of [[OWNER,'company_owner'],[STAFF,'staff_member'],[ADMIN,'admin'],[EXPERT,'expert'],[FOREIGN_OWNER,'company_owner']])
    await mockDb.query('INSERT INTO user_profiles(id,role,is_active) VALUES ($1,$2,true)',[actor,role])
  await mockDb.query("INSERT INTO user_agency_roles VALUES ($1,$4,'company_owner','active'),($2,$4,'staff_member','active'),($3,$5,'company_owner','active')",[OWNER,STAFF,FOREIGN_OWNER,AGENCY,OTHER])
  await mockDb.query('INSERT INTO patients(id,agency_id) VALUES ($1,$3),($2,$4)',[PATIENT,FOREIGN_PATIENT,AGENCY,OTHER])
  await mockDb.query('INSERT INTO caregiver_members(id,agency_id) VALUES ($1,$3),($2,$4)',[CAREGIVER,FOREIGN_CAREGIVER,AGENCY,OTHER])
  await mockDb.query('INSERT INTO scheduled_visits VALUES ($1,$2)',[VISIT,AGENCY])
  await mockDb.query('INSERT INTO applications VALUES ($1,$3),($2,$4)',[APP,FOREIGN_APP,AGENCY,OTHER])
  await mockDb.query('INSERT INTO application_steps VALUES ($1,$2),($3,$4)',[STEP,APP,ORPHAN_STEP,id(999)])
  await mockDb.query('INSERT INTO application_documents VALUES ($1,$2)',[DOC,APP])
  await mockDb.query('INSERT INTO application_playbook_items VALUES ($1,$2)',[ITEM,APP])
  await mockDb.exec(read('002-stage-missing-application-tables.sql'))
  const rows=[
    [notes.patient,'patient',PATIENT,AGENCY,null,null],
    [notes.caregiver,'caregiver',CAREGIVER,AGENCY,PATIENT,null],
    [notes.visit,'visit',VISIT,AGENCY,PATIENT,CAREGIVER],
    [notes.application,'application',APP,AGENCY,null,null],
    [notes.step,'application_step',STEP,AGENCY,null,null],
    [notes.document,'application_document',DOC,AGENCY,null,null],
    [notes.item,'application_playbook_item',ITEM,AGENCY,null,null],
    [notes.badTag,'patient',PATIENT,AGENCY,FOREIGN_PATIENT,null],
    [notes.badSubject,'patient',FOREIGN_PATIENT,AGENCY,null,null],
    [notes.badApp,'application_step',STEP,OTHER,null,null],
    [notes.badPlatformTag,'application',APP,AGENCY,PATIENT,null],
    [notes.orphan,'application_step',ORPHAN_STEP,AGENCY,null,null],
    [notes.template,'application_document',id(999),AGENCY,null,null],
    [notes.foreign,'patient',FOREIGN_PATIENT,OTHER,null,null],
  ]
  for(const [note,type,subject,agency,patient,caregiver] of rows) await mockDb.query(
    "INSERT INTO internal_notes(id,subject_type,subject_id,agency_id,tagged_patient_id,tagged_caregiver_id,content,created_by) VALUES ($1,$2,$3,$4,$5,$6,'Synthetic confidential note',$7)",
    [note,type,subject,agency,patient,caregiver,OWNER])
  await mockDb.exec(migration)
  login()
})
afterAll(async()=>{await mockDb?.close()})

test('manager reads direct/associated notes and tag options only in its active agency',async()=>{
  const result=await readInternalNotesPanel(panel())
  expect(result.error).toBeNull()
  expect(result.notes.map(n=>n.id)).toEqual([notes.patient])
  expect(result.associatedNotes.map(n=>n.id).sort()).toEqual([notes.caregiver,notes.visit].sort())
  expect(result.patients.map(p=>p.id)).toEqual([PATIENT])
  expect(result.caregivers.map(c=>c.id)).toEqual([CAREGIVER])
})
test('caregiver and visit panels resolve correct subject and associated notes',async()=>{
  expect((await readInternalNotesPanel(panel('caregiver',CAREGIVER))).associatedNotes.map(n=>n.id)).toEqual([notes.visit])
  expect((await readInternalNotesPanel(panel('visit',VISIT))).notes.map(n=>n.id)).toEqual([notes.visit])
})
test.each(['admin','expert'])('active platform %s reads all four application note types but not agency notes',async(role)=>{
  login(role==='admin'?ADMIN:EXPERT)
  for(const [type,subject,note] of [
    ['application',APP,notes.application],['application_step',STEP,notes.step],
    ['application_document',DOC,notes.document],['application_playbook_item',ITEM,notes.item],
  ] as const){
    const result=await readInternalNotesPanel({...panel(type,subject),applicationId:APP})
    expect(result.error).toBeNull()
    expect(result.notes.map(n=>n.id)).toEqual([note])
    expect(result.patients).toEqual([])
    expect(result.caregivers).toEqual([])
  }
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
})
test('manager cannot read platform notes or their counts, including playbook items',async()=>{
  expect((await readInternalNotesPanel(panel('application_playbook_item',ITEM))).error).toBe('Forbidden')
  expect((await readApplicationNoteCounts({subjectIds:[ITEM]})).error).toBe('Forbidden')
  await withUserContext(OWNER,'admin',AGENCY,async()=>{
    const result=await sql<{id:string}[]>`SELECT id FROM internal_notes ORDER BY id`
    expect(result.map(r=>r.id)).toEqual([notes.patient,notes.caregiver,notes.visit])
  })
})
test.each(['invited','pending','inactive'])('denies %s membership despite stale privileged session/context',async(status)=>{
  await mockDb.query('UPDATE user_agency_roles SET status=$1 WHERE user_id=$2',[status,OWNER])
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
  await withUserContext(OWNER,'admin',AGENCY,async()=>{expect(await sql`SELECT id FROM internal_notes`).toEqual([])})
})
test('cross-agency input and subject ownership cannot broaden access',async()=>{
  expect((await readInternalNotesPanel(panel('patient',FOREIGN_PATIENT,OTHER))).error).toBe('Forbidden')
  expect((await readInternalNotesPanel(panel('patient',FOREIGN_PATIENT))).error).toBe('Subject not found or not authorized')
  login(FOREIGN_OWNER)
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
})
test('staff, inactive, missing profile/membership, and unauthenticated actors fail closed',async()=>{
  login(STAFF);expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
  login(id(999));expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
  jest.mocked(getSession).mockResolvedValue(null);expect((await readInternalNotesPanel(panel())).error).toBe('Not authenticated')
  login();await mockDb.query('UPDATE user_profiles SET is_active=false WHERE id=$1',[OWNER])
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
  await mockDb.query('UPDATE user_profiles SET is_active=true WHERE id=$1',[OWNER])
  await mockDb.query('DELETE FROM user_agency_roles WHERE user_id=$1',[OWNER])
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
})
test('coordinator uses current matching role membership, not the session role',async()=>{
  await mockDb.query("UPDATE user_profiles SET role='care_coordinator' WHERE id=$1",[OWNER])
  expect((await readInternalNotesPanel(panel())).error).toBe('Forbidden')
  await mockDb.query("UPDATE user_agency_roles SET role='care_coordinator' WHERE user_id=$1",[OWNER])
  expect((await readInternalNotesPanel(panel())).notes.map(n=>n.id)).toEqual([notes.patient])
})
test('application agency/parent mismatches, orphan subjects and shared template IDs stay closed',async()=>{
  login(ADMIN)
  expect((await readInternalNotesPanel({...panel('application_step',STEP),applicationId:FOREIGN_APP})).error).toBe('Subject not found or not authorized')
  expect((await readInternalNotesPanel(panel('application_step',STEP,OTHER))).error).toBe('Subject not found or not authorized')
  expect((await readInternalNotesPanel(panel('application_step',ORPHAN_STEP))).error).toBe('Subject not found or not authorized')
  expect((await readInternalNotesPanel(panel('application_document',id(999)))).error).toBe('Subject not found or not authorized')
  await withUserContext(ADMIN,'company_owner',OTHER,async()=>{
    expect((await sql<{id:string}[]>`SELECT id FROM internal_notes ORDER BY id`).map(n=>n.id))
      .toEqual([notes.application,notes.step,notes.document,notes.item])
  })
})
test('counts aggregate without content, deduplicate input, scope to actual application and return explicit zeros',async()=>{
  login(EXPERT)
  const result=await readApplicationNoteCounts({subjectIds:[APP,STEP,DOC,ITEM,ITEM,id(999)],applicationId:APP})
  expect(result).toEqual({data:{[APP]:1,[STEP]:1,[DOC]:1,[ITEM]:1,[id(999)]:0},error:null})
  expect((await readApplicationNoteCounts({subjectIds:[STEP],applicationId:FOREIGN_APP})).data).toEqual({[STEP]:0})
  expect((await readApplicationNoteCounts({subjectIds:[ITEM,STEP],subjectType:'application_playbook_item'})).data).toEqual({[ITEM]:1,[STEP]:0})
  expect((await readApplicationNoteCounts({subjectIds:[]})).data).toEqual({})
})
test('audits reads/tag reads with identifiers only and rolls back all audits if a later audit fails',async()=>{
  await readInternalNotesPanel(panel())
  const audits=await mockDb.query<{table_name:string;details:unknown}>('SELECT table_name,details FROM audit_log')
  expect(audits.rows.map(r=>r.table_name)).toEqual(['internal_notes','patients','caregiver_members'])
  expect(JSON.stringify(audits.rows)).not.toContain('Synthetic')
  mockFailAuditForTable='caregiver_members'
  const result=await readInternalNotesPanel(panel())
  expect(result).toMatchObject({error:'Unable to load internal notes',notes:[],associatedNotes:[],patients:[],caregivers:[]})
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toHaveLength(3)
})
test('search audits enforce scope/minimum length and never store search content',async()=>{
  const base={...panel(),resultsReturned:2}
  expect(await auditInternalNoteSearch({...base,searchTerm:'ab'})).toEqual({success:true})
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toHaveLength(0)
  expect(await auditInternalNoteSearch({...base,searchTerm:'private synthetic search'})).toEqual({success:true})
  const [auditRow]=(await mockDb.query<{action:string;details:Record<string,unknown>}>('SELECT action,details FROM audit_log')).rows
  expect(auditRow.action).toBe('SEARCH')
  expect(auditRow.details).toMatchObject({subject_id:PATIENT,subject_type:'patient',results_returned:2,search_length:24})
  expect(JSON.stringify(auditRow)).not.toContain('private')
  login(STAFF);expect((await auditInternalNoteSearch({...base,searchTerm:'test'})).success).toBe(false)
})
test('legacy read exports use the same actor and policy boundary and cannot leak associated platform notes',async()=>{
  expect((await readLegacyInternalNotes('subject',PATIENT,'patient')).data?.map(n=>n.id)).toEqual([notes.patient])
  expect((await readLegacyInternalNotes('patient',PATIENT)).data?.map(n=>n.id).sort()).toEqual([notes.caregiver,notes.visit].sort())
  expect((await readLegacyInternalNotes('caregiver',CAREGIVER)).data?.map(n=>n.id)).toEqual([notes.visit])
  expect((await readLegacyInternalNotes('id',notes.application)).data).toEqual([])
  login(ADMIN)
  expect((await readLegacyInternalNotes('id',notes.application)).data?.map(n=>n.id)).toEqual([notes.application])
})
test('no context and stale context from prior requests disclose no notes; runtime writes remain denied',async()=>{
  await readInternalNotesPanel(panel())
  await mockDb.exec('SET ROLE mycaresight_app')
  try{
    expect((await mockDb.query('SELECT id FROM internal_notes')).rows).toEqual([])
    for(const query of ['UPDATE internal_notes SET content=content','DELETE FROM internal_notes','TRUNCATE internal_notes',
      "INSERT INTO internal_notes(agency_id,subject_type,subject_id,content,created_by) VALUES (NULL,'patient',NULL,'test',NULL)"])
      await expect(mockDb.exec(query)).rejects.toMatchObject({code:'42501'})
    for(const table of ['visit_time_entries','visit_approvals','visit_financials','visit_adjustment_history'])
      await expect(mockDb.exec('SELECT id FROM '+table)).rejects.toMatchObject({code:'42501'})
  }finally{await mockDb.exec('RESET ROLE')}
})
test('rejects invalid UUIDs, extra scope keys, unknown types and oversized count requests',async()=>{
  expect((await readInternalNotesPanel({...panel(),subjectId:'bad'})).error).toBe('Invalid note request')
  expect((await readInternalNotesPanel({...panel(),role:'admin'} as never)).error).toBe('Invalid note request')
  expect((await readApplicationNoteCounts({subjectIds:Array(501).fill(APP)})).error).toBe('Invalid note request')
  expect((await readLegacyInternalNotes('subject',PATIENT,'unknown' as never)).error?.message).toBe('Invalid note request')
})
test('read errors are generic and count results are not returned when auditing fails',async()=>{
  login(ADMIN);mockFailAudit=true
  expect(await readApplicationNoteCounts({subjectIds:[APP]})).toEqual({data:null,error:'Unable to load internal notes'})
  expect((await readLegacyInternalNotes('id',notes.application)).error?.message).toBe('Unable to load internal notes')
})
test('verification passes; repeat migration fails and rolls back without changing access',async()=>{
  const result=await mockDb.exec(read('007-verify-internal-note-read-access.sql'))
  expect(result[0].rows[0]).toMatchObject({read_access_pass:true,runtime_write:false})
  await expect(mockDb.exec(migration)).rejects.toThrow('007 requires untouched staging access')
  await mockDb.exec('ROLLBACK')
  expect((await readInternalNotesPanel(panel())).error).toBeNull()
})

test('008 permits scoped create, update and delete with atomic identifier-only audits',async()=>{
  await mockDb.exec(read('008-internal-note-write-access.sql'))
  const created=await createInternalNote({...panel(),content:' Synthetic note ',taggedCaregiverId:CAREGIVER})
  expect(created.error).toBeNull()
  const noteId=created.id!
  expect((await mockDb.query<{content:string;created_by:string}>('SELECT content,created_by FROM internal_notes WHERE id=$1',[noteId])).rows[0])
    .toEqual({content:'Synthetic note',created_by:OWNER})

  const updated=await updateInternalNote({...panel(),noteId,content:'Revised synthetic note',taggedPatientId:PATIENT})
  expect(updated).toMatchObject({error:null,oldTaggedPatientId:null,oldTaggedCaregiverId:CAREGIVER})
  expect((await mockDb.query<{content:string}>('SELECT content FROM internal_notes WHERE id=$1',[noteId])).rows[0].content).toBe('Revised synthetic note')

  expect((await deleteInternalNote({...panel(),noteId})).error).toBeNull()
  expect((await mockDb.query('SELECT id FROM internal_notes WHERE id=$1',[noteId])).rows).toHaveLength(0)
  const audits=(await mockDb.query<{action:string;details:unknown}>('SELECT action,details FROM audit_log WHERE record_id=$1 ORDER BY action',[noteId])).rows
  expect(audits.map(row=>row.action)).toEqual(['DELETE','INSERT','UPDATE'])
  expect(JSON.stringify(audits)).not.toContain('Synthetic note')
})

test('008 rolls back note writes when their audit cannot commit',async()=>{
  await mockDb.exec(read('008-internal-note-write-access.sql'))
  mockFailAudit=true
  const created=await createInternalNote({...panel(),content:'Synthetic private content'})
  expect(created).toEqual({error:'Unable to save internal note'})
  expect((await mockDb.query("SELECT id FROM internal_notes WHERE content='Synthetic private content'")).rows).toHaveLength(0)
})

test('008 denies stale profile roles, cross-agency subjects/tags and platform tags',async()=>{
  await mockDb.exec(read('008-internal-note-write-access.sql'))
  expect((await createInternalNote({...panel('patient',FOREIGN_PATIENT),content:'Denied'})).error).toBe('Subject not found or not authorized')
  expect((await createInternalNote({...panel(),content:'Denied',taggedPatientId:FOREIGN_PATIENT})).error).toBe('Tagged record not found or not authorized')
  login(ADMIN)
  expect((await createInternalNote({...panel('application',APP),content:'Denied',taggedPatientId:PATIENT})).error).toBe('Application notes cannot tag people')
  login(STAFF)
  expect((await createInternalNote({...panel(),content:'Denied'})).error).toBe('Forbidden')
})

test('008 verification passes and immutable scope columns have no update grant',async()=>{
  await mockDb.exec(read('008-internal-note-write-access.sql'))
  const result=await mockDb.exec(read('008-verify-internal-note-write-access.sql'))
  expect(result[0].rows[0]).toMatchObject({write_access_pass:true,agency_update:false,content_update:true})
  await mockDb.exec('SET ROLE mycaresight_app')
  try{
    await mockDb.exec(`SELECT set_config('app.current_user_id','${OWNER}',false),set_config('app.current_user_role','company_owner',false),set_config('app.current_agency_id','${AGENCY}',false)`)
    await expect(mockDb.exec(`UPDATE internal_notes SET agency_id='${OTHER}' WHERE id='${notes.patient}'`)).rejects.toMatchObject({code:'42501'})
  }finally{await mockDb.exec('RESET ROLE')}
})

test('manual application status and its audits/note commit atomically under the current Neon actor',async()=>{
  await mockDb.exec(read('008-internal-note-write-access.sql'))
  login(ADMIN)
  expect(await changeApplicationStatusWithNote({applicationId:APP,operation:'close',reason:'Synthetic reason'})).toEqual({error:null})
  expect((await mockDb.query<{status:string}>('SELECT status FROM applications WHERE id=$1',[APP])).rows[0].status).toBe('closed')
  const note=(await mockDb.query<{content:string}>('SELECT content FROM internal_notes WHERE subject_type=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 1',['application',APP])).rows[0]
  expect(note.content).toBe('Application manually closed. Reason: Synthetic reason')
  expect((await mockDb.query('SELECT id FROM audit_log WHERE record_id IN ($1,$2)',[APP,notes.application])).rows.length).toBeGreaterThanOrEqual(1)

  await mockDb.query("UPDATE applications SET status='in_progress' WHERE id=$1",[APP])
  await mockDb.query("DELETE FROM internal_notes WHERE subject_type='application' AND subject_id=$1 AND content LIKE 'Application manually%'",[APP])
  await mockDb.query('DELETE FROM audit_log')
  mockFailAudit=true
  expect((await changeApplicationStatusWithNote({applicationId:APP,operation:'close',reason:'Rollback reason'})).error).toBe('Unable to save internal note')
  expect((await mockDb.query<{status:string}>('SELECT status FROM applications WHERE id=$1',[APP])).rows[0].status).toBe('in_progress')
  expect((await mockDb.query("SELECT id FROM internal_notes WHERE content LIKE 'Application manually%'")).rows).toHaveLength(0)
})
