/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sql from '@/db'
import { getSession } from '@/lib/auth'
import * as scheduleQueries from '@/lib/supabase/query/schedules'
import {
  managerInsertSchedule,
  managerReplaceSchedules,
  managerUpdateRecurringSchedules,
  managerUpdateSchedule,
} from '@/lib/repositories/manager-scheduling'

jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('@/lib/auth',()=>({getSession:jest.fn()}))
jest.mock('@/lib/supabase/query/schedules',()=>({
  insertSchedule:jest.fn(),insertRecurringSchedulesFromSeries:jest.fn(),updateSchedule:jest.fn(),
  updateRecurringSchedulesByScope:jest.fn(),deleteSchedule:jest.fn(),getSchedulesByPatientId:jest.fn(),
  getSchedulesByPatientIdAndDateRange:jest.fn(),getScheduledVisitsAsScheduleRowsForAgencyAndDateRange:jest.fn(),
}))

let db:PGlite
let failAudit=false
jest.mock('postgres',()=>{
  type Executor=Pick<PGlite,'query'>
  const tag=(executor:()=>Executor)=>(strings:TemplateStringsArray,...values:unknown[])=>({strings,values,
    then(resolve:(rows:unknown[])=>unknown,reject:(error:unknown)=>unknown){const params:unknown[]=[]
      const compile=(part:{strings:readonly string[];values:unknown[]}):string=>part.strings.reduce((out,chunk,index)=>{
        if(index===part.values.length)return out+chunk;const value=part.values[index]
        if(value&&typeof value==='object'&&'strings' in value&&'values' in value)return out+chunk+compile(value as typeof part)
        params.push(value);return out+chunk+'$'+params.length},'')
      const query=compile(this);if(failAudit&&query.includes('INSERT INTO public.audit_log'))return Promise.reject(new Error('audit outage')).then(resolve,reject)
      return executor().query(query,params).then(result=>result.rows).then(resolve,reject)}})
  const pool=Object.assign(tag(()=>db),{begin:async(fn:(tx:ReturnType<typeof tag>)=>Promise<unknown>)=>db.transaction(async tx=>{
    await tx.exec('SET LOCAL ROLE mycaresight_app');return fn(tag(()=>tx))})})
  return {__esModule:true,default:()=>pool}
})

const id=(n:number)=>`80000000-0000-4000-8000-${n.toString().padStart(12,'0')}`
const USER=id(1),AGENCY=id(2),FOREIGN=id(3),PATIENT=id(4),FOREIGN_PATIENT=id(5),VISIT=id(6),SERIES=id(7),CAREGIVER=id(8),CONFLICT=id(9)

beforeAll(async()=>{db=new PGlite();await db.exec('CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS')},60000)
beforeEach(async()=>{failAudit=false;jest.clearAllMocks();await db.exec(`
  RESET ROLE;DROP SCHEMA public CASCADE;CREATE SCHEMA public;GRANT USAGE ON SCHEMA public TO mycaresight_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
  CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,agency_id uuid,is_active boolean);
  CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
  CREATE TABLE patients(id uuid PRIMARY KEY,agency_id uuid);
  CREATE TABLE caregiver_members(id uuid PRIMARY KEY,agency_id uuid,status text);
  CREATE TABLE patient_service_contracts(id uuid PRIMARY KEY,agency_id uuid,patient_id uuid);
  CREATE TABLE patient_addresses(id uuid PRIMARY KEY,agency_id uuid,patient_id uuid);
  CREATE TABLE scheduled_visits(id uuid PRIMARY KEY,agency_id uuid,patient_id uuid,visit_series_id uuid,status text,
    caregiver_member_id uuid,visit_date date,scheduled_start_time time,scheduled_end_time time,scheduled_end_date date);
  CREATE TABLE caregiver_availability_slots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),caregiver_member_id uuid,
    agency_id uuid,label text,is_recurring boolean,start_time time,end_time time,repeat_frequency text,
    days_of_week integer[],repeat_start date,repeat_end date,specific_date date);
  CREATE TABLE audit_log(agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
  INSERT INTO user_profiles VALUES('${USER}','company_owner','${AGENCY}',true);
  INSERT INTO user_agency_roles VALUES('${USER}','${AGENCY}','company_owner','active');
  INSERT INTO patients VALUES('${PATIENT}','${AGENCY}'),('${FOREIGN_PATIENT}','${FOREIGN}');
  INSERT INTO scheduled_visits(id,agency_id,patient_id,visit_series_id,status,visit_date,scheduled_start_time,scheduled_end_time)
    VALUES('${VISIT}','${AGENCY}','${PATIENT}','${SERIES}','scheduled','2026-09-22','10:00','12:00');`)
  jest.mocked(getSession).mockResolvedValue({user:{id:USER},profile:{role:'admin',agency_id:FOREIGN}} as Awaited<ReturnType<typeof getSession>>)
})
afterAll(async()=>{await db?.close()})

test('current membership and patient ownership control create and audit',async()=>{
  jest.mocked(scheduleQueries.insertSchedule).mockImplementation(async input=>{
    await sql`INSERT INTO scheduled_visits(id,agency_id,patient_id,visit_series_id,status,visit_date)
      VALUES(${id(10)}::uuid,${AGENCY}::uuid,${input.patient_id}::uuid,NULL,'scheduled','2026-09-22')`
    return {data:{id:id(10)} as never,error:null}
  })
  expect((await managerInsertSchedule({patient_id:PATIENT,date:'2026-09-22'})).error).toBeNull()
  expect((await db.query('SELECT 1 FROM audit_log')).rows).toHaveLength(1)
  expect((await managerInsertSchedule({patient_id:FOREIGN_PATIENT,date:'2026-09-22'})).error?.message).toMatch(/agency/i)
  expect(scheduleQueries.insertSchedule).toHaveBeenCalledTimes(1)
})

test('caregiver assignment rolls back when the visit overlaps an existing assignment',async()=>{
  await db.exec(`
    INSERT INTO caregiver_members VALUES('${CAREGIVER}','${AGENCY}','active');
    INSERT INTO caregiver_availability_slots(caregiver_member_id,agency_id,is_recurring,start_time,end_time,days_of_week,repeat_start)
      VALUES('${CAREGIVER}','${AGENCY}',true,'08:00','18:00',ARRAY[2],'2026-01-01');
    INSERT INTO scheduled_visits(id,agency_id,patient_id,status,caregiver_member_id,visit_date,scheduled_start_time,scheduled_end_time)
      VALUES('${CONFLICT}','${AGENCY}','${PATIENT}','scheduled','${CAREGIVER}','2026-09-22','11:00','13:00');
  `)
  jest.mocked(scheduleQueries.updateSchedule).mockImplementation(async visitId=>{
    await sql`UPDATE scheduled_visits SET caregiver_member_id=${CAREGIVER}::uuid WHERE id=${visitId}::uuid`
    return {data:{id:visitId,status:'scheduled'} as never,error:null}
  })
  const result=await managerUpdateSchedule(VISIT,{caregiver_id:CAREGIVER})
  expect(result.error?.message).toMatch(/overlapping visit/i)
  expect((await db.query<{caregiver_member_id:string|null}>('SELECT caregiver_member_id FROM scheduled_visits WHERE id=$1',[VISIT])).rows[0].caregiver_member_id).toBeNull()
})

test('a recurring item error rolls back earlier changes',async()=>{
  jest.mocked(scheduleQueries.updateRecurringSchedulesByScope).mockImplementation(async()=>{
    await sql`UPDATE scheduled_visits SET status='cancelled' WHERE id=${VISIT}::uuid`
    return {updated_ids:[VISIT],error:{message:'later item failed'}}
  })
  const result=await managerUpdateRecurringSchedules({seed_schedule_id:VISIT,scope:'all_in_series',patch:{status:'cancelled'}})
  expect(result.error?.message).toBe('later item failed')
  expect((await db.query<{status:string}>('SELECT status FROM scheduled_visits WHERE id=$1',[VISIT])).rows[0].status).toBe('scheduled')
})

test('replacement rolls back deletions when a later insert fails',async()=>{
  let calls=0
  jest.mocked(scheduleQueries.deleteSchedule).mockImplementation(async visitId=>{
    await sql`DELETE FROM scheduled_visits WHERE id=${visitId}::uuid`
    return {data:null,error:null}
  })
  jest.mocked(scheduleQueries.insertSchedule).mockImplementation(async input=>{
    calls+=1
    if(calls===2)return {data:null,error:new Error('synthetic insert failure')}
    const newId=id(30)
    await sql`INSERT INTO scheduled_visits(id,agency_id,patient_id,status,visit_date)
      VALUES(${newId}::uuid,${AGENCY}::uuid,${input.patient_id}::uuid,'scheduled',${input.date})`
    return {data:{id:newId} as never,error:null}
  })
  const result=await managerReplaceSchedules({kind:'single',replaceVisitIds:[VISIT],visits:[
    {patient_id:PATIENT,date:'2026-09-22'},
    {patient_id:PATIENT,date:'2026-09-23'},
  ]})
  expect(result.error?.message).toMatch(/synthetic insert failure/i)
  expect((await db.query('SELECT id FROM scheduled_visits WHERE id=$1',[VISIT])).rows).toHaveLength(1)
  expect((await db.query('SELECT id FROM scheduled_visits WHERE id=$1',[id(30)])).rows).toHaveLength(0)
})

test('audit failure rolls back a schedule update',async()=>{
  jest.mocked(scheduleQueries.updateSchedule).mockImplementation(async visitId=>{
    await sql`UPDATE scheduled_visits SET status='missed' WHERE id=${visitId}::uuid`
    return {data:{id:visitId,status:'missed'} as never,error:null}
  })
  failAudit=true
  expect((await managerUpdateSchedule(VISIT,{status:'missed'})).error).not.toBeNull()
  expect((await db.query<{status:string}>('SELECT status FROM scheduled_visits WHERE id=$1',[VISIT])).rows[0].status).toBe('scheduled')
})

test('014 installs forced RLS, scoped grants, exact policy counts, and indexes',async()=>{
  await db.exec(`ALTER TABLE caregiver_members ADD COLUMN user_id uuid;
  DROP TABLE scheduled_visits;CREATE TABLE visit_series(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,patient_id uuid,primary_caregiver_member_id uuid,
    contract_id uuid,service_type text,series_name text,repeat_frequency text,days_of_week smallint[],repeat_start date,
    repeat_end date,repeat_monthly_rules jsonb,notes text,status text,legacy_schedule_id uuid,created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),end_day_offset smallint DEFAULT 0);
  CREATE TABLE scheduled_visits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,visit_series_id uuid,
    patient_id uuid,caregiver_member_id uuid,contract_id uuid,service_type text,visit_date date,scheduled_start_time time,
    scheduled_end_time time,description text,notes text,visit_type text,status text,created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),is_recurring boolean,mileage_miles numeric,patient_address_id uuid,
    scheduled_end_date date,status_reason text);
  CREATE TABLE scheduled_visit_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),agency_id uuid,scheduled_visit_id uuid,
    task_id uuid,legacy_task_code text,sort_order integer,notes text,created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),completed_at timestamptz);
  CREATE FUNCTION visit_financial_manager_can_read(target uuid) RETURNS boolean LANGUAGE sql STABLE AS
    'SELECT target::text=current_setting(''app.current_agency_id'',true) AND current_setting(''app.current_user_role'',true) IN (''company_owner'',''care_coordinator'')';
  CREATE FUNCTION caregiver_can_execute_visit(target_agency uuid,target_caregiver uuid) RETURNS boolean LANGUAGE sql STABLE AS
    'SELECT target_agency::text=current_setting(''app.current_agency_id'',true) AND target_caregiver::text=current_setting(''app.current_caregiver_id'',true)';
  GRANT SELECT,INSERT,UPDATE,DELETE ON scheduled_visits,visit_series TO mycaresight_app;
  GRANT SELECT,INSERT,DELETE ON scheduled_visit_tasks TO mycaresight_app;
  GRANT UPDATE(completed_at,updated_at) ON scheduled_visit_tasks TO mycaresight_app;`)
  await db.exec(readFileSync(join(process.cwd(),'scripts/migrations/014-scheduling-lifecycle-access.sql'),'utf8'))
  const rows=(await db.query<{table_name:string;forced:boolean;policies:number}>(`SELECT c.relname table_name,
    c.relrowsecurity AND c.relforcerowsecurity forced,(SELECT count(*)::integer FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=c.relname) policies FROM pg_class c
    WHERE c.relname IN ('scheduled_visits','scheduled_visit_tasks','visit_series') ORDER BY c.relname`)).rows
  expect(rows).toEqual([
    {table_name:'scheduled_visit_tasks',forced:true,policies:5},
    {table_name:'scheduled_visits',forced:true,policies:5},
    {table_name:'visit_series',forced:true,policies:3},
  ])
  expect((await db.query<{allowed:boolean}>("SELECT has_column_privilege('mycaresight_app','public.scheduled_visits','agency_id','UPDATE') allowed")).rows[0].allowed).toBe(false)
  const staff=id(20),own=id(21),open=id(22),other=id(23),otherCaregiver=id(24)
  await db.query("INSERT INTO user_profiles VALUES($1,'staff_member',$2,true)",[staff,AGENCY])
  await db.query("INSERT INTO user_agency_roles VALUES($1,$2,'staff_member','active')",[staff,AGENCY])
  await db.query("INSERT INTO caregiver_members(id,agency_id,user_id,status) VALUES($1,$3,$2,'active'),($4,$3,NULL,'active')",
    [own,staff,AGENCY,otherCaregiver])
  await db.query("INSERT INTO scheduled_visits(id,agency_id,patient_id,caregiver_member_id,status) VALUES($1,$4,$5,$6,'scheduled'),($2,$4,$5,NULL,'scheduled'),($3,$4,$5,$7,'scheduled')",
    [own,open,other,AGENCY,PATIENT,own,otherCaregiver])
  const visible=await db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE mycaresight_app;
    SELECT set_config('app.current_user_id','${staff}',true),set_config('app.current_user_role','staff_member',true),
      set_config('app.current_agency_id','${AGENCY}',true),set_config('app.current_caregiver_id','${own}',true);`)
    return (await tx.query<{id:string}>('SELECT id FROM scheduled_visits ORDER BY id')).rows.map(row=>row.id)})
  expect(visible).toEqual([own,open])
})
