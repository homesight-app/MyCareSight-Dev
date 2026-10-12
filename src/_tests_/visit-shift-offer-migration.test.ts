/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/020-visit-shift-offers.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/020-verify-visit-shift-offers.sql'),
  'utf8'
)

const AGENCY = '80000000-0000-4000-8000-000000000001'
const MANAGER = '80000000-0000-4000-8000-000000000002'
const CAREGIVER_USER = '80000000-0000-4000-8000-000000000003'
const CAREGIVER = '80000000-0000-4000-8000-000000000004'
const VISIT = '80000000-0000-4000-8000-000000000005'
const VISIT_TWO = '80000000-0000-4000-8000-000000000006'

describe('visit shift offer migration 020', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE mycaresight_jobs LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE agencies (id uuid PRIMARY KEY);
      CREATE TABLE user_profiles (
        id uuid PRIMARY KEY, role text NOT NULL, agency_id uuid, is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE user_agency_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        agency_id uuid NOT NULL, role text NOT NULL, status text NOT NULL
      );
      CREATE TABLE caregiver_members (
        id uuid PRIMARY KEY, user_id uuid REFERENCES user_profiles(id), agency_id uuid REFERENCES agencies(id),
        status text NOT NULL DEFAULT 'active'
      );
      CREATE TABLE scheduled_visits (
        id uuid PRIMARY KEY, agency_id uuid NOT NULL REFERENCES agencies(id),
        caregiver_member_id uuid REFERENCES caregiver_members(id), status text NOT NULL,
        visit_date date NOT NULL, scheduled_end_date date,
        scheduled_start_time time, scheduled_end_time time, service_type text NOT NULL
      );
      CREATE TABLE schedule_assignment_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid NOT NULL,
        caregiver_member_id uuid, status text NOT NULL DEFAULT 'pending', caregiver_note text,
        decline_reason text, resolved_at timestamptz, resolved_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES user_profiles(id),
        title text NOT NULL, message text, type text NOT NULL DEFAULT 'general',
        icon_type text, action_url text, is_read boolean DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agency_id uuid, table_name text NOT NULL,
        record_id uuid, action text NOT NULL, performed_by_user_id uuid, details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE FUNCTION visit_financial_manager_can_read(p_agency_id uuid) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
      INSERT INTO agencies VALUES ('${AGENCY}');
      INSERT INTO user_profiles (id, role, agency_id) VALUES
        ('${MANAGER}', 'company_owner', '${AGENCY}'),
        ('${CAREGIVER_USER}', 'staff_member', '${AGENCY}');
      INSERT INTO user_agency_roles (user_id, agency_id, role, status) VALUES
        ('${MANAGER}', '${AGENCY}', 'company_owner', 'active'),
        ('${CAREGIVER_USER}', '${AGENCY}', 'staff_member', 'active');
      INSERT INTO caregiver_members VALUES ('${CAREGIVER}', '${CAREGIVER_USER}', '${AGENCY}', 'active');
      INSERT INTO scheduled_visits VALUES
        ('${VISIT}', '${AGENCY}', NULL, 'unassigned', '2030-01-02', NULL, '09:00', '12:00', 'non_skilled'),
        ('${VISIT_TWO}', '${AGENCY}', NULL, 'unassigned', '2030-01-03', NULL, '09:00', '12:00', 'non_skilled');
      GRANT USAGE ON SCHEMA public TO mycaresight_app, mycaresight_jobs;
    `)
    await db.exec(migration)
  }, 60_000)

  afterAll(async () => db.close())

  test('creates the guarded schema and expected permissions', async () => {
    const results = await db.exec(verification)
    const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
    expect(row).toEqual(expect.objectContaining({
      offers_table_ok: true,
      recipients_table_ok: true,
      request_link_ok: true,
      close_function_ok: true,
      reset_function_ok: true,
      close_trigger_ok: true,
      reset_trigger_ok: true,
      offers_rls_ok: true,
      recipients_rls_ok: true,
      offer_policies_ok: true,
      recipient_policies_ok: true,
      app_can_read_offers: true,
      app_can_read_recipients: true,
      public_access_blocked: true,
      jobs_access_blocked: true,
      duplicate_open_offer_count: 0,
      cross_agency_recipient_count: 0,
    }))
  })

  test('closes an offer when its visit is assigned', async () => {
    const offerId = '80000000-0000-4000-8000-000000000007'
    const recipientId = '80000000-0000-4000-8000-000000000011'
    const requestId = '80000000-0000-4000-8000-000000000012'
    await db.exec(`
      INSERT INTO visit_shift_offers
        (id, agency_id, scheduled_visit_id, created_by_user_id, audience_mode, expires_at)
      VALUES ('${offerId}', '${AGENCY}', '${VISIT}', '${MANAGER}', 'selected', '2030-01-02T09:00:00Z');
      INSERT INTO visit_shift_offer_recipients
        (id, offer_id, agency_id, caregiver_member_id, user_id, status, responded_at)
      VALUES ('${recipientId}', '${offerId}', '${AGENCY}', '${CAREGIVER}', '${CAREGIVER_USER}', 'interested', now());
      INSERT INTO schedule_assignment_requests
        (id, schedule_id, caregiver_member_id, status, shift_offer_recipient_id)
      VALUES ('${requestId}', '${VISIT}', '${CAREGIVER}', 'pending', '${recipientId}');
      UPDATE scheduled_visits SET caregiver_member_id = '${CAREGIVER}' WHERE id = '${VISIT}';
    `)
    expect((await db.query<{ status: string }>(
      `SELECT status FROM visit_shift_offers WHERE id='${offerId}'`
    )).rows[0]?.status).toBe('closed')
    expect((await db.query<{ status: string }>(
      `SELECT status FROM visit_shift_offer_recipients WHERE offer_id='${offerId}'`
    )).rows[0]?.status).toBe('expired')
    expect((await db.query<{ status: string }>(
      `SELECT status FROM schedule_assignment_requests WHERE id='${requestId}'`
    )).rows[0]?.status).toBe('approved')
  })

  test('returns an interested recipient to notified when the request is withdrawn', async () => {
    const offerId = '80000000-0000-4000-8000-000000000008'
    const recipientId = '80000000-0000-4000-8000-000000000009'
    const requestId = '80000000-0000-4000-8000-000000000010'
    await db.exec(`
      INSERT INTO visit_shift_offers
        (id, agency_id, scheduled_visit_id, created_by_user_id, audience_mode, expires_at)
      VALUES ('${offerId}', '${AGENCY}', '${VISIT_TWO}', '${MANAGER}', 'selected', '2030-01-03T09:00:00Z');
      INSERT INTO visit_shift_offer_recipients
        (id, offer_id, agency_id, caregiver_member_id, user_id, status, responded_at)
      VALUES ('${recipientId}', '${offerId}', '${AGENCY}', '${CAREGIVER}', '${CAREGIVER_USER}', 'interested', now());
      INSERT INTO schedule_assignment_requests
        (id, schedule_id, caregiver_member_id, status, shift_offer_recipient_id)
      VALUES ('${requestId}', '${VISIT_TWO}', '${CAREGIVER}', 'pending', '${recipientId}');
      DELETE FROM schedule_assignment_requests WHERE id = '${requestId}';
    `)
    const row = (await db.query<{ status: string; responded_at: string | null }>(
      `SELECT status, responded_at FROM visit_shift_offer_recipients WHERE id='${recipientId}'`
    )).rows[0]
    expect(row).toEqual({ status: 'notified', responded_at: null })
  })
})
