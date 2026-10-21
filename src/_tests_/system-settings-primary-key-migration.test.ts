/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrations/028-system-settings-primary-key.sql'),
  'utf8'
)
const verification = readFileSync(
  join(process.cwd(), 'scripts/migrations/028-verify-system-settings-primary-key.sql'),
  'utf8'
)

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.system_settings (
      key text NOT NULL,
      category text NOT NULL DEFAULT 'branding',
      value text,
      updated_by uuid,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  return db
}

describe('system settings primary-key migration 028', () => {
  test('retains one exact copy per key and permits the existing upsert', async () => {
    const db = await createDatabase()
    try {
      await db.exec(`
        INSERT INTO public.system_settings (category, key, value, updated_at)
        SELECT 'branding', 'synthetic_color_' || n, 'blue', '2026-01-01T00:00:00Z'
        FROM generate_series(1, 4) n, generate_series(1, 3) copies;
      `)
      await db.exec(migration)
      const result = await db.query<Record<string, unknown>>(verification)
      expect(result.rows[0]).toEqual({ key_ok: true, duplicate_groups: 0 })
      const rows = await db.query<{ row_count: number }>(
        'SELECT count(*)::integer AS row_count FROM public.system_settings'
      )
      expect(rows.rows).toEqual([{ row_count: 4 }])

      await db.exec(`
        INSERT INTO public.system_settings (category, key, value)
        VALUES ('branding', 'synthetic_color_1', 'green')
        ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value;
      `)
      await db.exec(migration)
      const saved = await db.query<{ row_count: number; value: string }>(
        `SELECT count(*)::integer AS row_count, max(value) AS value
         FROM public.system_settings WHERE category = 'branding' AND key = 'synthetic_color_1'`
      )
      expect(saved.rows).toEqual([{ row_count: 1, value: 'green' }])
    } finally {
      await db.close()
    }
  })

  test('rejects different copies and leaves every row in place', async () => {
    const db = await createDatabase()
    try {
      await db.exec(`
        INSERT INTO public.system_settings (category, key, value)
        VALUES ('branding', 'synthetic_color', 'blue'),
               ('branding', 'synthetic_color', 'green');
      `)
      await expect(db.exec(migration)).rejects.toThrow('different rows')
      await db.exec('ROLLBACK')
      const rows = await db.query<{ row_count: number }>(
        'SELECT count(*)::integer AS row_count FROM public.system_settings'
      )
      expect(rows.rows).toEqual([{ row_count: 2 }])
    } finally {
      await db.close()
    }
  })

  test('rejects copies with the same value but a different updater', async () => {
    const db = await createDatabase()
    try {
      await db.exec(`
        INSERT INTO public.system_settings (category, key, value, updated_by, updated_at)
        VALUES
          ('branding', 'synthetic_color', 'blue', '93000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'),
          ('branding', 'synthetic_color', 'blue', '93000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z');
      `)
      await expect(db.exec(migration)).rejects.toThrow('different rows')
      await db.exec('ROLLBACK')
      const rows = await db.query<{ row_count: number }>(
        'SELECT count(*)::integer AS row_count FROM public.system_settings'
      )
      expect(rows.rows).toEqual([{ row_count: 2 }])
    } finally {
      await db.close()
    }
  })
})
