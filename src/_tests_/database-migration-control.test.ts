/** @jest-environment node */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('database migration control', () => {
  test('validates the immutable legacy inventory and managed migration checksums', () => {
    const output = execFileSync(
      process.execPath,
      [join(root, 'scripts/database-migrations/cli.mjs'), 'validate'],
      { cwd: root, encoding: 'utf8' }
    )

    expect(output).toMatch(/Migration control valid: 43 legacy files, 5 managed migration/)
  })

  test('keeps the ledger append-only and unavailable to runtime roles', () => {
    const migration = read('scripts/migrations/038-database-migration-ledger.sql')
    const verifier = read('scripts/migrations/038-verify-database-migration-ledger.sql')

    expect(migration).toContain('CREATE TABLE public.schema_migrations')
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON public.schema_migrations')
    expect(migration).toContain('REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC')
    expect(migration).toContain('applied_by text NOT NULL DEFAULT session_user')
    expect(migration).toContain('executed_as text NOT NULL DEFAULT current_user')
    expect(migration).toContain("rolname = 'mycaresight_app'")
    expect(migration).toContain("rolname = 'mycaresight_jobs'")
    expect(verifier).toContain('append_only_trigger_exists')
    expect(verifier).toContain('runtime_roles_have_no_grants')
  })

  test('registers session-revocation hardening as an immutable managed migration', () => {
    const migration = read('scripts/migrations/039-scope-membership-session-revocation.sql')
    const verifier = read('scripts/migrations/039-verify-scope-membership-session-revocation.sql')
    const rollback = read('scripts/database-rollbacks/039-rollback-scope-membership-session-revocation.sql')

    expect(migration).toContain('UPDATE OF user_id, agency_id, status')
    expect(migration).toContain('WHERE user_agency_roles.status IS DISTINCT FROM EXCLUDED.status')
    expect(migration).toContain('NEW.status IS NOT DISTINCT FROM OLD.status')
    expect(verifier).toContain('source_triggers_are_scoped')
    expect(verifier).toContain('revocation_function_skips_noop')
    expect(rollback).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.caregiver_members')
  })

  test('keeps the ownership bootstrap least-privilege and extension-safe', () => {
    const bootstrap = read('scripts/database-bootstrap/001-schema-owner-bootstrap.sql')
    const verifier = read('scripts/database-bootstrap/001-verify-schema-owner-bootstrap.sql')
    const rollback = read('scripts/database-bootstrap/001-rollback-schema-owner-bootstrap.sql')

    expect(bootstrap).toContain("session_user <> 'neondb_owner'")
    expect(bootstrap).toContain("pg_has_role('mycaresight_migrator','neon_superuser','MEMBER')")
    expect(bootstrap).toContain("d.deptype='e'")
    expect(bootstrap).toContain("linked.deptype IN ('a','i')")
    expect(bootstrap).not.toContain('ALTER DATABASE')
    expect(bootstrap).not.toContain('ALTER SCHEMA public OWNER')
    expect(verifier).toContain('no_untransferred_application_objects')
    expect(verifier).toContain('app_not_owner_member')
    expect(verifier).toContain('jobs_not_owner_member')
    expect(rollback).not.toContain('REASSIGN OWNED')
    expect(rollback).not.toContain('DROP ROLE')
    expect(rollback).toContain("linked.deptype IN ('a','i')")
    expect(rollback).toContain('OWNER TO neondb_owner')
  })

  test('creates a verified ledger that rejects mutation', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE ROLE mycaresight_app LOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE ROLE mycaresight_jobs LOGIN NOSUPERUSER NOBYPASSRLS;
        BEGIN;
        ${read('scripts/migrations/038-database-migration-ledger.sql')}
        INSERT INTO public.schema_migrations(
          migration_id, file_name, checksum_sha256, target_environment
        ) VALUES (
          '038', '038-database-migration-ledger.sql', repeat('a', 64), 'development'
        );
        COMMIT;
      `)

      const results = await db.exec(
        read('scripts/migrations/038-verify-database-migration-ledger.sql')
      )
      const row = results.flatMap((result) => result.rows)[0] as Record<string, unknown>
      expect(Object.values(row).every(Boolean)).toBe(true)
      await expect(
        db.exec("UPDATE public.schema_migrations SET execution_ms=1 WHERE migration_id='038'")
      ).rejects.toThrow(/append-only/)
    } finally {
      await db.close()
    }
  })

  test('exposes a fail-closed transactional apply command after baseline approval', () => {
    const cli = read('scripts/database-migrations/cli.mjs')
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }

    expect(cli).toContain('<validate|status|apply>')
    expect(cli).toMatch(/command === ['"]apply['"]/)
    expect(cli).toContain("current_setting('neon.branch_id', true)")
    expect(cli).toContain('pg_advisory_xact_lock')
    expect(cli).toContain('SET LOCAL ROLE')
    expect(cli).toContain('Legacy baseline must be reviewed and recorded')
    expect(cli).toContain('MIGRATION_RELEASE_SHA is required when applying migrations')
    expect(cli).toContain('validateVerifierRows')
    expect(packageJson.scripts['db:migrations:validate']).toBeDefined()
    expect(packageJson.scripts['db:migrations:status']).toBeDefined()
    expect(packageJson.scripts['db:migrations:apply']).toBeDefined()
  })

  test('keeps the ledger ownership repair owner-run and runtime-inaccessible', () => {
    const repair = read('scripts/database-bootstrap/002-ledger-owner-repair.sql')
    const verifier = read('scripts/database-bootstrap/002-verify-ledger-owner-repair.sql')

    expect(repair).toContain("session_user <> 'neondb_owner'")
    expect(repair).toContain('ALTER TABLE public.schema_migrations OWNER TO mycaresight_schema_owner')
    expect(repair).toContain(
      'ALTER FUNCTION public.prevent_schema_migration_mutation() OWNER TO mycaresight_schema_owner'
    )
    expect(repair).toContain('REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC')
    expect(verifier).toContain('ledger_owner_ok')
    expect(verifier).toContain('runtime_roles_have_no_ledger_access')
  })

  test('validates exact target configuration and verifier outcomes', async () => {
    const moduleUrl = pathToFileURL(
      join(root, 'scripts/database-migrations/migration-control.mjs')
    ).href
    const script = `
      import { readTargetConfiguration, validateVerifierRows } from ${JSON.stringify(moduleUrl)};
      const environment = {
        MIGRATION_ENVIRONMENT: 'uat',
        DATABASE_MIGRATION_URL: 'postgresql://migrator:secret@expected.example/neondb',
        MIGRATION_EXPECTED_HOST: 'expected.example',
        MIGRATION_EXPECTED_DATABASE: 'neondb',
        MIGRATION_EXPECTED_BRANCH_ID: 'br-approved-branch',
        MIGRATION_RELEASE_SHA: '${'a'.repeat(40)}'
      };
      const target = readTargetConfiguration(environment);
      if (target.expectedBranchId !== 'br-approved-branch') throw new Error('branch validation failed');
      try {
        readTargetConfiguration({ ...environment, MIGRATION_EXPECTED_BRANCH_ID: 'wrong' });
        throw new Error('invalid branch accepted');
      } catch (error) {
        if (!String(error.message).includes('Neon branch id')) throw error;
      }
      validateVerifierRows(
        [{ assertion_ok: true, pending_count: '0' }],
        { allBooleansTrue: true, zeroColumns: ['pending_count'] },
        '999'
      );
      try {
        validateVerifierRows(
          [{ assertion_ok: false, pending_count: '0' }],
          { allBooleansTrue: true, zeroColumns: ['pending_count'] },
          '999'
        );
        throw new Error('false verifier accepted');
      } catch (error) {
        if (!String(error.message).includes('assertion_ok')) throw error;
      }
      process.stdout.write('ok');
    `

    expect(
      execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: root,
        encoding: 'utf8',
      })
    ).toBe('ok')
  })

  test('gates the UAT application deployment on the same-SHA database migration', () => {
    const workflow = read('.github/workflows/main_mycaresight-uat.yml')
    const migrationStep = workflow.indexOf('Apply verified UAT database migrations')
    const deploymentStep = workflow.indexOf("name: 'Deploy to Azure Web App'")

    expect(workflow).toContain('environment: uat')
    expect(workflow).toContain('DATABASE_MIGRATION_URL: ${{ secrets.UAT_DATABASE_MIGRATION_URL }}')
    expect(workflow).toContain(
      'MIGRATION_EXPECTED_BRANCH_ID: ${{ vars.UAT_MIGRATION_EXPECTED_BRANCH_ID }}'
    )
    expect(workflow).toContain('MIGRATION_RELEASE_SHA: ${{ github.sha }}')
    expect(workflow).toContain('npm run db:migrations:apply')
    expect(migrationStep).toBeGreaterThan(-1)
    expect(deploymentStep).toBeGreaterThan(migrationStep)
  })

  test('gates the manual production-staging deployment on the same-SHA database migration', () => {
    const workflow = read('.github/workflows/manual_production-staging.yml')
    const targetVerificationStep = workflow.indexOf('Verify deployment target')
    const migrationStep = workflow.indexOf(
      'Apply verified production-staging database migrations'
    )
    const deploymentStep = workflow.indexOf('Deploy only to the staging slot')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('environment: production-staging')
    expect(workflow).toContain(
      'DATABASE_MIGRATION_URL: ${{ secrets.STAGING_DATABASE_MIGRATION_URL }}'
    )
    expect(workflow).toContain('MIGRATION_ENVIRONMENT: production-staging')
    expect(workflow).toContain(
      'MIGRATION_EXPECTED_BRANCH_ID: ${{ vars.STAGING_MIGRATION_EXPECTED_BRANCH_ID }}'
    )
    expect(workflow).toContain('MIGRATION_RELEASE_SHA: ${{ github.sha }}')
    expect(workflow).toContain('npm run db:migrations:apply')
    expect(targetVerificationStep).toBeGreaterThan(-1)
    expect(migrationStep).toBeGreaterThan(targetVerificationStep)
    expect(deploymentStep).toBeGreaterThan(migrationStep)
  })

  test('gates the protected Production deployment on the approved release SHA migration', () => {
    const workflow = read('.github/workflows/manual_production.yml')
    const stagingProofStep = workflow.indexOf('Verify the exact commit passed production staging')
    const targetVerificationStep = workflow.indexOf('Verify the production deployment target')
    const migrationStep = workflow.indexOf('Apply verified Production database migrations')
    const deploymentStep = workflow.indexOf('Deploy only to the production slot')
    const healthStep = workflow.indexOf('Verify production health')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('environment: Production')
    expect(workflow).toContain(
      'DATABASE_MIGRATION_URL: ${{ secrets.PRODUCTION_DATABASE_MIGRATION_URL }}'
    )
    expect(workflow).toContain('MIGRATION_ENVIRONMENT: production')
    expect(workflow).toContain(
      'MIGRATION_EXPECTED_BRANCH_ID: ${{ vars.PRODUCTION_MIGRATION_EXPECTED_BRANCH_ID }}'
    )
    expect(workflow).toContain('MIGRATION_RELEASE_SHA: ${{ inputs.release_sha }}')
    expect(workflow).not.toContain('MIGRATION_RELEASE_SHA: ${{ github.sha }}')
    expect(workflow).toContain('npm run db:migrations:apply')
    expect(stagingProofStep).toBeGreaterThan(-1)
    expect(targetVerificationStep).toBeGreaterThan(stagingProofStep)
    expect(migrationStep).toBeGreaterThan(targetVerificationStep)
    expect(deploymentStep).toBeGreaterThan(migrationStep)
    expect(healthStep).toBeGreaterThan(deploymentStep)
  })
})
