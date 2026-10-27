/** @jest-environment node */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { readPatientDocuments } from '@/lib/patient-document-metadata'

const migration = readFileSync(join(process.cwd(), 'scripts/migrations/033-patient-document-jsonb-arrays.sql'), 'utf8')
const verifier = readFileSync(join(process.cwd(), 'scripts/migrations/033-verify-patient-document-jsonb-arrays.sql'), 'utf8')
const id = (n: number) => `33000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const syntheticDocument = { id: 'synthetic-1', name: 'synthetic.pdf', path: 'synthetic-1/file.pdf', uploaded_at: '2026-01-01T00:00:00Z' }

test('reads array and encoded-array metadata without dropping existing documents', () => {
  const documents = [syntheticDocument]
  expect(readPatientDocuments(documents)).toEqual(documents)
  expect(readPatientDocuments(JSON.stringify(documents))).toEqual(documents)
  expect(readPatientDocuments(null)).toEqual([])
  expect(() => readPatientDocuments({ document: syntheticDocument })).toThrow('valid document list')
  expect(() => readPatientDocuments([{ path: syntheticDocument.path }])).toThrow('valid document list')
})

test('migration converts encoded arrays and leaves proper arrays unchanged', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE TABLE public.patients (id uuid PRIMARY KEY, documents jsonb)')
    await db.query('INSERT INTO public.patients VALUES ($1, $2::jsonb), ($3, $4::jsonb)', [
      id(1), JSON.stringify(JSON.stringify([syntheticDocument])),
      id(2), JSON.stringify([syntheticDocument]),
    ])
    await db.exec(migration)
    const results = await db.query<{ id: string; documents: unknown }>('SELECT id, documents FROM public.patients ORDER BY id')
    expect(results.rows.map((row) => row.documents)).toEqual([[syntheticDocument], [syntheticDocument]])
    expect((await db.query(verifier)).rows[0]).toEqual({ non_array_rows: 0, array_rows: 2, null_rows: 0 })
    await db.exec(migration)
    expect((await db.query(verifier)).rows[0]).toEqual({ non_array_rows: 0, array_rows: 2, null_rows: 0 })
  } finally {
    await db.close()
  }
})

test('migration rejects an invalid encoded value without modifying any row', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE TABLE public.patients (id uuid PRIMARY KEY, documents jsonb)')
    await db.query('INSERT INTO public.patients VALUES ($1, $2::jsonb), ($3, $4::jsonb)', [
      id(1), JSON.stringify(JSON.stringify([syntheticDocument])),
      id(2), JSON.stringify('not an array'),
    ])
    await expect(db.exec(migration)).rejects.toThrow()
    await db.exec('ROLLBACK')
    expect((await db.query<{ shape: string }>('SELECT jsonb_typeof(documents) AS shape FROM public.patients ORDER BY id')).rows)
      .toEqual([{ shape: 'string' }, { shape: 'string' }])
  } finally {
    await db.close()
  }
})
