/** @jest-environment node */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (name: string) => readFileSync(join(process.cwd(), 'scripts/migrations', name), 'utf8')

describe('lead ownership and task assignment migration 045', () => {
  const migration = read('045-lead-ownership-and-task-assignment.sql')
  const verifier = read('045-verify-lead-ownership-and-task-assignment.sql')

  async function createBase(db: PGlite) {
    await db.exec(`
      CREATE TABLE user_profiles(
        id uuid PRIMARY KEY,
        full_name text,
        role text NOT NULL,
        agency_id uuid,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE user_agency_roles(
        user_id uuid NOT NULL REFERENCES user_profiles(id),
        agency_id uuid NOT NULL,
        role text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE leads(
        id uuid PRIMARY KEY,
        lead_type text NOT NULL,
        agency_id uuid,
        created_by uuid,
        lead_owner_id uuid,
        status text NOT NULL DEFAULT 'active',
        converted_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE lead_tasks(
        id uuid PRIMARY KEY,
        lead_id uuid NOT NULL REFERENCES leads(id),
        created_by uuid NOT NULL,
        assigned_to uuid,
        title text NOT NULL,
        due_date date,
        completed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
  }

  test('backfills recorded creators and installs verified integrity controls', async () => {
    const db = new PGlite()
    try {
      await createBase(db)
      await db.exec(`
        INSERT INTO user_profiles(id, role, is_active) VALUES
          ('10000000-0000-4000-8000-000000000001', 'staff_member', false),
          ('20000000-0000-4000-8000-000000000002', 'care_coordinator', true);
        UPDATE user_profiles SET agency_id='30000000-0000-4000-8000-000000000003'
          WHERE id='20000000-0000-4000-8000-000000000002';
        INSERT INTO user_agency_roles VALUES
          ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'care_coordinator', 'active');
        INSERT INTO leads(id, lead_type, agency_id, created_by) VALUES
          ('40000000-0000-4000-8000-000000000004', 'agency', NULL, '10000000-0000-4000-8000-000000000001'),
          ('50000000-0000-4000-8000-000000000005', 'patient', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002');
        INSERT INTO lead_tasks(id, lead_id, created_by, assigned_to, title) VALUES
          ('60000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000005',
           '20000000-0000-4000-8000-000000000002', NULL, 'Synthetic task'),
          ('70000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000005',
           '80000000-0000-4000-8000-000000000008', NULL, 'Legacy task without creator profile');
        BEGIN;
        ${migration}
        COMMIT;
      `)

      const results = await db.exec(verifier)
      const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
      expect(Object.values(row).every(Boolean)).toBe(true)
      const owners = await db.query<{ lead_owner_id: string }>('SELECT lead_owner_id FROM leads ORDER BY id')
      expect(owners.rows.map(item => item.lead_owner_id)).toEqual([
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
      ])
      const assignees = await db.query<{ assigned_to: string }>('SELECT assigned_to FROM lead_tasks ORDER BY id')
      expect(assignees.rows.map(item => item.assigned_to)).toEqual([
        '20000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000002',
      ])
      await db.exec(`
        INSERT INTO leads(id, lead_type, status)
        VALUES ('a0000000-0000-4000-8000-00000000000a', 'agency', 'active')
      `)
      const unassigned = await db.query<{ lead_owner_id: string | null }>(`
        SELECT lead_owner_id FROM leads WHERE id='a0000000-0000-4000-8000-00000000000a'
      `)
      expect(unassigned.rows[0]?.lead_owner_id).toBeNull()
    } finally {
      await db.close()
    }
  })

  test('preserves an unassigned lead when the recorded creator profile is missing', async () => {
    const db = new PGlite()
    try {
      await createBase(db)
      await db.exec(`
        INSERT INTO leads(id, lead_type, created_by)
        VALUES ('90000000-0000-4000-8000-000000000009', 'agency', '80000000-0000-4000-8000-000000000008');
        BEGIN;
        ${migration}
        COMMIT;
      `)
      const results = await db.exec(verifier)
      const row = results.flatMap(result => result.rows)[0] as Record<string, unknown>
      expect(Object.values(row).every(Boolean)).toBe(true)
      const lead = await db.query<{ lead_owner_id: string | null }>(`
        SELECT lead_owner_id FROM leads WHERE id='90000000-0000-4000-8000-000000000009'
      `)
      expect(lead.rows[0]?.lead_owner_id).toBeNull()
    } finally {
      await db.close()
    }
  })
})
