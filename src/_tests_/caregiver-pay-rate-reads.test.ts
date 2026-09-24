/** @jest-environment node */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSession } from '@/lib/auth'
import sql, { withUserContext } from '@/db'
import { savePayRateBatch, saveCaregiverProfile } from '@/lib/repositories/caregiver-pay-rate-writes'
import { pickCaregiverPayRateForVisit } from '@/lib/caregiver-pay-rates'
import { readCaregiverPayRates as readRates, requireCaregiverPayRates } from '@/lib/repositories/caregiver-pay-rates'

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

const read = (name: string) => readFileSync(join(process.cwd(),'scripts/migrations',name),'utf8')
const migration=read('005-caregiver-pay-rate-read-access.sql')
const id=(n: number) => '40000000-0000-4000-8000-' + n.toString().padStart(12,'0')
const OWNER=id(1), STAFF=id(2), OTHER=id(3), AGENCY=id(10), FOREIGN=id(11)
const MEMBER=id(20), PEER=id(21), OUTSIDE=id(22)
const OLD=id(30), CURRENT=id(31), PEER_RATE=id(32), FOREIGN_RATE=id(33), MISMATCH=id(34)
function login(actor=OWNER) {
  jest.mocked(getSession).mockResolvedValue({ user:{id:actor},profile:{role:'admin',agency_id:FOREIGN} } as Awaited<ReturnType<typeof getSession>>)
}
beforeAll(async () => {
  mockDb=new PGlite()
  await mockDb.exec('CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS')
},60000)
beforeEach(async () => {
  mockFailAudit=false
  mockFailAuditForTable=null
  mockBeginCount=0
  await mockDb.exec(`
    RESET ROLE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO mycaresight_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mycaresight_app;
    CREATE TABLE user_profiles(id uuid PRIMARY KEY,role text,is_active boolean);
    CREATE TABLE caregiver_members(id uuid PRIMARY KEY,agency_id uuid,user_id uuid,status text,first_name text DEFAULT 'Synthetic',last_name text DEFAULT 'Caregiver',email text,phone text,role text,job_title text,employee_id text,start_date date,updated_at timestamptz);
    CREATE TABLE user_agency_roles(user_id uuid,agency_id uuid,role text,status text);
    CREATE TABLE audit_log(id uuid DEFAULT gen_random_uuid(),agency_id uuid,table_name text,record_id uuid,action text,performed_by_user_id uuid,details jsonb);
  `)
  for(const table of ['agencies','patients','scheduled_visits','billing_codes','patient_service_contracts']) {
    await mockDb.exec(`CREATE TABLE public.${table}(id uuid PRIMARY KEY)`)
  }
  await mockDb.query('INSERT INTO agencies VALUES ($1),($2)',[AGENCY,FOREIGN])
  await mockDb.query("INSERT INTO user_profiles VALUES ($1,'company_owner',true),($2,'staff_member',true),($3,'company_owner',true)",[OWNER,STAFF,OTHER])
  await mockDb.query("INSERT INTO caregiver_members(id,agency_id,user_id,status) VALUES ($1,$4,$6,'active'),($2,$4,NULL,'active'),($3,$5,NULL,'active')",[MEMBER,PEER,OUTSIDE,AGENCY,FOREIGN,STAFF])
  await mockDb.query("INSERT INTO user_agency_roles VALUES ($1,$4,'company_owner','active'),($2,$4,'staff_member','active'),($3,$5,'company_owner','active')",[OWNER,STAFF,OTHER,AGENCY,FOREIGN])
  await mockDb.exec(read('002-stage-missing-application-tables.sql'))
  for(const [rateId,agencyId,memberId,start,end,rate] of [
    [OLD,AGENCY,MEMBER,'2026-01-01','2026-04-01',10],
    [CURRENT,AGENCY,MEMBER,'2026-04-01',null,20],
    [PEER_RATE,AGENCY,PEER,'2026-01-01',null,30],
    [FOREIGN_RATE,FOREIGN,OUTSIDE,'2026-01-01',null,40],
    [MISMATCH,FOREIGN,MEMBER,'2026-01-01',null,999],
  ]) await mockDb.query('INSERT INTO caregiver_pay_rates(id,agency_id,caregiver_member_id,effective_start,effective_end,pay_rate) VALUES ($1,$2,$3,$4,$5,$6)',[rateId,agencyId,memberId,start,end,rate])
  await mockDb.exec(migration)
  login()
})
afterAll(async () => { await mockDb?.close() })

test('manager reads only its agency, excludes mismatched caregiver links, and normalizes amounts/dates',async () => {
  const result=await readRates({agencyId:AGENCY})
  expect(result.error).toBeNull()
  expect(result.data?.map(r=>r.id).sort()).toEqual([OLD,CURRENT,PEER_RATE].sort())
  expect(result.data?.find(r=>r.id===CURRENT)).toMatchObject({pay_rate:20,effective_start:'2026-04-01',effective_end:null})
})
test.each(['admin','expert'])('active platform %s history access retains the existing profile scope',async role => {
  await mockDb.query('UPDATE user_profiles SET role=$1 WHERE id=$2',[role,OWNER])
  expect((await readRates({caregiverIds:[OUTSIDE]})).data?.map(r=>r.id)).toEqual([FOREIGN_RATE])
})
test('coordinator with active matching membership reads agency rates',async () => {
  await mockDb.query("UPDATE user_profiles SET role='care_coordinator' WHERE id=$1",[OWNER])
  await mockDb.query("UPDATE user_agency_roles SET role='care_coordinator' WHERE user_id=$1",[OWNER])
  expect((await readRates({agencyId:AGENCY})).data).toHaveLength(3)
})
test.each(['invited','pending','inactive'])('denies %s membership in repository and policy',async status => {
  await mockDb.query('UPDATE user_agency_roles SET status=$1 WHERE user_id=$2',[status,OWNER])
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Forbidden')
  await withUserContext(OWNER,'admin',AGENCY,async () => {
    expect(await sql`SELECT id FROM public.caregiver_pay_rates`).toEqual([])
  })
})
test('staff can read self only, with active membership and active caregiver status',async () => {
  login(STAFF)
  expect((await readRates({caregiverIds:[MEMBER]})).data).toHaveLength(2)
  expect((await readRates({caregiverIds:[PEER]})).error).toBe('Forbidden')
  expect((await readRates({agencyId:AGENCY})).error).toBe('Forbidden')
  await withUserContext(STAFF,'admin',AGENCY,async () => {
    const rows=await sql<{id:string}[]>`SELECT id FROM public.caregiver_pay_rates`
    expect(rows.map(r=>r.id).sort()).toEqual([OLD,CURRENT].sort())
  })
  await mockDb.query("UPDATE caregiver_members SET status='invited' WHERE id=$1",[MEMBER])
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Forbidden')
})
test('forged agency and mixed authorized/foreign IDs fail without partial payroll',async () => {
  expect((await readRates({agencyId:FOREIGN})).error).toBe('Forbidden')
  expect((await readRates({caregiverIds:[MEMBER,OUTSIDE]})).error).toBe('Forbidden')
  expect((await readRates({agencyId:AGENCY,caregiverIds:[OUTSIDE]})).error).toBe('Forbidden')
  await expect(requireCaregiverPayRates({caregiverIds:[OUTSIDE]})).rejects.toThrow('Forbidden')
})
test('missing session, inactive user, missing membership, and unknown roles deny access',async () => {
  jest.mocked(getSession).mockResolvedValue(null)
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Not authenticated')
  login()
  await mockDb.query('UPDATE user_profiles SET is_active=false WHERE id=$1',[OWNER])
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Forbidden')
  await mockDb.query("UPDATE user_profiles SET is_active=true,role='unexpected' WHERE id=$1",[OWNER])
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Forbidden')
  await mockDb.query("UPDATE user_profiles SET role='company_owner' WHERE id=$1",[OWNER])
  await mockDb.query('DELETE FROM user_agency_roles WHERE user_id=$1',[OWNER])
  expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Forbidden')
})
test('effective dates are half-open; open-only and explicit empty selections preserve their meaning',async () => {
  expect((await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-03-31'})).data?.map(r=>r.id)).toEqual([OLD])
  expect((await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-04-01'})).data?.map(r=>r.id)).toEqual([CURRENT])
  expect((await readRates({caregiverIds:[MEMBER],openOnly:true})).data?.map(r=>r.id)).toEqual([CURRENT])
  expect((await readRates({caregiverIds:[]})).data).toEqual([])
  expect((await readRates({caregiverIds:[MEMBER,MEMBER]})).data).toHaveLength(2)
})
test('rejects malformed IDs/dates, oversized selections, and unscoped requests',async () => {
  for(const input of [{},{caregiverIds:['bad']},{caregiverIds:Array(5001).fill(MEMBER)},{caregiverIds:[MEMBER],effectiveOn:'2026-02-30'}]) {
    expect((await readRates(input)).error).toBe('Invalid pay-rate request')
  }
})
test('rate read audit contains only identifiers and a failed audit fails the read',async () => {
  await readRates({caregiverIds:[MEMBER]})
  const audits=await mockDb.query<{details:unknown}>('SELECT details FROM audit_log')
  expect(audits.rows).toEqual([{details:{operation:'read_pay_rates',resource_ids:[CURRENT,OLD]}}])
  mockFailAudit=true
  expect(await readRates({caregiverIds:[MEMBER]})).toEqual({data:null,error:'Unable to load pay rates'})
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toHaveLength(1)
})
test('reuses a matching parent transaction without changing its context or taking another connection',async () => {
  await withUserContext(OWNER,'company_owner',AGENCY,async () => {
    expect((await readRates({caregiverIds:[MEMBER]})).data).toHaveLength(2)
    expect(mockBeginCount).toBe(1)
    const [context]=await sql<{role:string}[]>`SELECT current_setting('app.current_user_role') AS role`
    expect(context.role).toBe('company_owner')
  })
})
test('a mismatched parent actor fails closed; rolling back the parent also rolls back read audit',async () => {
  await withUserContext(OTHER,'company_owner',FOREIGN,async () => {
    expect((await readRates({caregiverIds:[MEMBER]})).error).toBe('Unable to load pay rates')
  })
  await expect(withUserContext(OWNER,'company_owner',AGENCY,async () => {
    await requireCaregiverPayRates({caregiverIds:[MEMBER]})
    throw new Error('synthetic parent rollback')
  })).rejects.toThrow('synthetic parent rollback')
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toEqual([])
})
test('no context denies direct reads after success, and runtime writes remain denied',async () => {
  await readRates({caregiverIds:[MEMBER]})
  await mockDb.exec('SET ROLE mycaresight_app')
  try {
    expect((await mockDb.query('SELECT id FROM caregiver_pay_rates')).rows).toEqual([])
    for(const statement of ["UPDATE caregiver_pay_rates SET pay_rate=1","DELETE FROM caregiver_pay_rates","TRUNCATE caregiver_pay_rates"]) {
      await expect(mockDb.exec(statement)).rejects.toMatchObject({code:'42501'})
    }
    for(const table of ['internal_notes','visit_time_entries','visit_approvals','visit_financials','visit_adjustment_history']) {
      await expect(mockDb.exec(`SELECT id FROM ${table}`)).rejects.toMatchObject({code:'42501'})
    }
  } finally { await mockDb.exec('RESET ROLE') }
})
test('verification passes and repeat application fails without changing access',async () => {
  const result=await mockDb.exec(read('005-verify-caregiver-pay-rate-read-access.sql'))
  expect(result[0].rows[0]).toMatchObject({access_pass:true,runtime_write:false})
  await expect(mockDb.exec(migration)).rejects.toThrow('005 requires untouched staging access')
  await mockDb.exec('ROLLBACK')
  expect((await readRates({caregiverIds:[MEMBER]})).data).toHaveLength(2)
})

async function enableWrites() {
  // The deliberately inconsistent read-test fixture is not valid for write cutover.
  await mockDb.query('DELETE FROM caregiver_pay_rates WHERE id=$1',[MISMATCH])
  await mockDb.exec(read('006-caregiver-pay-rate-write-access.sql'))
}
const change = (payRate: number | string, effectiveDate='2026-05-01', caregiverMemberId=MEMBER) =>
  ({caregiverMemberId,payRate,effectiveDate,serviceType:null,unitType:'hour'})
const edit = {first_name:'Synthetic updated',last_name:'Caregiver',email:'synthetic@example.invalid',
  phone:'',role:'Test role',status:'active',employee_id:'',start_date:'',pay_rate_hourly:'25',pay_rate_effective_date:'2026-05-01'}

test('006 grants only manager inserts/period closing and verifies its access state',async () => {
  await enableWrites()
  const results=await mockDb.exec(read('006-verify-caregiver-pay-rate-write-access.sql'))
  expect(results[0].rows[0]).toMatchObject({write_access_pass:true,overwrite_amount:false})
  await withUserContext(OWNER,'company_owner',AGENCY,async () => {
    await expect(sql`UPDATE caregiver_pay_rates SET pay_rate=1`).rejects.toMatchObject({code:'42501'})
  })
})

test('append closes the previous period, creates the new rate, and audits identifiers only',async () => {
  await enableWrites()
  expect(await savePayRateBatch({rates:[change('25.50')]})).toMatchObject({success:true})
  const result=await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-05-01'})
  expect(result.data?.[0].pay_rate).toBe(25.5)
  const previous=await mockDb.query<{effective_end:string}>('SELECT effective_end::text FROM caregiver_pay_rates WHERE id=$1',[CURRENT])
  expect(previous.rows[0].effective_end).toBe('2026-05-01')
  const audits=await mockDb.query<{details:unknown}>("SELECT details FROM audit_log WHERE action='INSERT'")
  expect(JSON.stringify(audits.rows)).not.toContain('25.5')
  expect(JSON.stringify(audits.rows)).toContain('append_pay_rate')
})

test('backdated insertion respects the next start and service bands remain independent',async () => {
  await enableWrites()
  expect((await savePayRateBatch({rates:[change(15,'2026-02-01')]})).success).toBe(true)
  expect((await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-03-01'})).data?.[0].pay_rate).toBe(15)
  expect((await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-04-01'})).data?.[0].pay_rate).toBe(20)
  expect((await savePayRateBatch({rates:[{...change(50),serviceType:'skilled',unitType:'visit'}]})).success).toBe(true)
  const rates=(await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-05-01'})).data!
  expect(rates).toHaveLength(2)
  expect(rates.find(r=>r.service_type==='skilled')).toMatchObject({pay_rate:50,unit_type:'visit'})
})

test('same-day correction preserves the old amount in a zero-duration history row and retries do not duplicate',async () => {
  await enableWrites()
  expect((await savePayRateBatch({rates:[change(25,'2026-04-01')]})).success).toBe(true)
  expect((await savePayRateBatch({rates:[change(25,'2026-04-01')]})).success).toBe(true)
  const rates=(await readRates({caregiverIds:[MEMBER]})).data!
  expect(rates).toHaveLength(3)
  expect(rates.find(r=>r.id===CURRENT)).toMatchObject({pay_rate:20,effective_start:'2026-04-01',effective_end:'2026-04-01'})
  expect(pickCaregiverPayRateForVisit(MEMBER,'non_skilled','2026-04-01',rates)?.pay_rate).toBe(25)
  expect(pickCaregiverPayRateForVisit(MEMBER,'non_skilled','2026-03-31',rates)?.pay_rate).toBe(10)
})

test.each(['invited','pending','inactive'])('write denies %s membership without changing rows',async status => {
  await enableWrites()
  await mockDb.query('UPDATE user_agency_roles SET status=$1 WHERE user_id=$2',[status,OWNER])
  expect((await savePayRateBatch({rates:[change(25)]})).success).toBe(false)
  const result=await mockDb.query<{count:number}>('SELECT count(*)::int AS count FROM caregiver_pay_rates')
  expect(result.rows[0].count).toBe(4)
})

test('staff, platform-only users, inactive users, and cross-agency managers cannot change rates',async () => {
  await enableWrites()
  login(STAFF)
  expect((await savePayRateBatch({rates:[change(25)]})).success).toBe(false)
  login(OWNER)
  expect((await savePayRateBatch({rates:[change(25,'2026-05-01',OUTSIDE)]})).success).toBe(false)
  await mockDb.query("UPDATE user_profiles SET role='admin' WHERE id=$1",[OWNER])
  expect((await savePayRateBatch({rates:[change(25)]})).success).toBe(false)
  await mockDb.query("UPDATE user_profiles SET role='company_owner',is_active=false WHERE id=$1",[OWNER])
  expect((await savePayRateBatch({rates:[change(25)]})).success).toBe(false)
})

test('invalid money, dates, service types and duplicate bands produce field errors',async () => {
  await enableWrites()
  for(const rate of [change(''),change(-1),change(1.001),change(100000000),change(2,'2026-02-30'),{...change(1),serviceType:'unexpected'}]) {
    const result=await savePayRateBatch({rates:[rate]})
    expect(result.success).toBe(false)
    expect(result.fieldErrors).toBeDefined()
  }
  expect((await savePayRateBatch({rates:[change(25),change(26)]})).fieldErrors?.['rates.1.payRate']).toEqual(['Submit one change per caregiver and service type'])
})

test('a later denied batch item rolls back earlier rate changes and audit',async () => {
  await enableWrites()
  expect((await savePayRateBatch({rates:[change(25),change(45,'2026-05-01',OUTSIDE)]})).success).toBe(false)
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toEqual([])
  expect((await readRates({caregiverIds:[MEMBER],openOnly:true})).data?.map(r=>r.id)).toEqual([CURRENT])
})

test('an audit outage rolls back period closing and insertion',async () => {
  await enableWrites()
  mockFailAudit=true
  expect((await savePayRateBatch({rates:[change(25)]})).success).toBe(false)
  mockFailAudit=false
  expect((await readRates({caregiverIds:[MEMBER],openOnly:true})).data?.map(r=>r.id)).toEqual([CURRENT])
})

test('caregiver form profile/rate save is atomic and unchanged rate does not create needless history',async () => {
  await enableWrites()
  expect((await saveCaregiverProfile(MEMBER,edit)).success).toBe(true)
  expect((await mockDb.query<{first_name:string}>('SELECT first_name FROM caregiver_members WHERE id=$1',[MEMBER])).rows[0].first_name).toBe('Synthetic updated')
  const count=(await readRates({caregiverIds:[MEMBER]})).data!.length
  expect((await saveCaregiverProfile(MEMBER,{...edit,pay_rate_effective_date:'2026-06-01'})).success).toBe(true)
  expect((await readRates({caregiverIds:[MEMBER]})).data).toHaveLength(count)
  mockFailAuditForTable='caregiver_members'
  expect((await saveCaregiverProfile(MEMBER,{...edit,first_name:'Must roll back',pay_rate_hourly:'30'})).success).toBe(false)
  mockFailAuditForTable=null
  expect((await mockDb.query<{first_name:string}>('SELECT first_name FROM caregiver_members WHERE id=$1',[MEMBER])).rows[0].first_name).toBe('Synthetic updated')
  expect((await readRates({caregiverIds:[MEMBER],effectiveOn:'2026-05-01'})).data?.[0].pay_rate).toBe(25)
})

test('database guard rejects overlap and direct historical amount overwrite',async () => {
  await enableWrites()
  await expect(mockDb.query("INSERT INTO caregiver_pay_rates(agency_id,caregiver_member_id,pay_rate,effective_start) VALUES ($1,$2,99,'2026-03-01')",[AGENCY,MEMBER]))
    .rejects.toThrow('Overlapping pay-rate periods')
  await expect(mockDb.query('UPDATE caregiver_pay_rates SET pay_rate=99 WHERE id=$1',[CURRENT]))
    .rejects.toThrow('Pay-rate history is immutable')
  await withUserContext(STAFF,'admin',AGENCY,async () => {
    await expect(sql`INSERT INTO caregiver_pay_rates(agency_id,caregiver_member_id,pay_rate,effective_start)
      VALUES (${AGENCY}::uuid,${MEMBER}::uuid,99,'2026-06-01')`).rejects.toThrow()
  })
})

test('migration refuses mismatched existing agency data and safely rejects repeats',async () => {
  await expect(mockDb.exec(read('006-caregiver-pay-rate-write-access.sql'))).rejects.toThrow('inconsistent caregiver/rate agency links')
  await mockDb.exec('ROLLBACK')
  await enableWrites()
  await expect(mockDb.exec(read('006-caregiver-pay-rate-write-access.sql'))).rejects.toThrow('006 requires the SELECT-only state')
  await mockDb.exec('ROLLBACK')
})


test('shared caregiver form validation returns inline field errors before any database write',async () => {
  await enableWrites()
  const result=await saveCaregiverProfile(MEMBER,{...edit,email:'invalid',phone:'123',pay_rate_hourly:'1.234'})
  expect(result.success).toBe(false)
  expect(result.fieldErrors?.email).toBeDefined()
  expect(result.fieldErrors?.phone).toBeDefined()
  expect(result.fieldErrors?.pay_rate_hourly).toBeDefined()
  expect((await mockDb.query('SELECT id FROM audit_log')).rows).toEqual([])
})
