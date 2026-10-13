# Client caregiver skill preferences

Status: migrations 022 and 023 have been applied to UAT. Migration 024 and its application changes are prepared locally and must be applied before deploying the normalized searchable catalog UI.

## Behavior

Agency owners and care coordinators can configure two caregiver skill sets from a client profile:

- **Required:** every skill must be present for direct-assignment and open-shift eligibility.
- **Preferred:** coverage improves caregiver ranking but never excludes a caregiver.

The shared editor searches the active catalog from the server in pages of 25 rather than rendering the entire list. An empty search shows the first page immediately. Client requirements and caregiver profiles store stable catalog identifiers, while legacy text arrays remain synchronized during this transition. A skill cannot appear in both client sets.

Caregivers may self-report skills. Agency owners and care coordinators verify selected caregiver skills; only verified skills satisfy a hard client requirement. Self-reported skills remain visible as pending and do not make an otherwise ineligible caregiver assignable.

Platform administrators manage global skills under **Configuration → Caregiver Skills**. Migration 024 also prepares `system` and `agency` catalog scopes. A future agency-owner UI may create agency-scoped skills without polluting the global catalog; that creation workflow is intentionally not enabled in this release.

## Database and access changes

Migration `022-client-caregiver-skill-preferences.sql`:

- adds `patient_skill_requirements.preferred_skill_codes` with an empty-array default;
- limits each set to 100 values and rejects null or overlapping entries;
- enables and forces RLS on `patient_skill_requirements`;
- permits reads and writes only for an active `company_owner` or `care_coordinator` membership in the row's agency;
- verifies that each requirement row references a patient in the same agency; and
- removes runtime delete access because the application uses an auditable upsert.

Corrective migration `023-patient-skill-requirement-unique-key.sql` restores the
original one-row-per-client unique key on `patient_id`. The generated Neon baseline
had omitted this source constraint, so PostgreSQL could not execute the application's
`ON CONFLICT (patient_id)` upsert. Migration 023 fails safely if duplicate client rows
or cross-agency rows need manual reconciliation; it does not discard or merge data.

The application validates the shared Zod schema on the client and server, validates selected identifiers against the active tenant-visible credential catalog, and writes the requirement change and identifier-only audit in one actor-context transaction.

Migration `024-normalized-caregiver-skills.sql`:

- adds explicit skill categories and stable catalog scope/ownership fields;
- creates normalized caregiver assignments with `self_reported` and `verified` states;
- creates normalized client requirement items with `required` and `preferred` states;
- backfills existing text-array values without discarding unknown legacy names;
- forces RLS and applies active membership and agency scope checks; and
- keeps the legacy arrays as compatibility mirrors while remaining readers are retired.

## Application order

Use a direct migration-owner connection, not the pooled application or jobs role:

```powershell
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/022-client-caregiver-skill-preferences.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/022-verify-client-caregiver-skill-preferences.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/023-patient-skill-requirement-unique-key.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/023-verify-patient-skill-requirement-unique-key.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/024-normalized-caregiver-skills.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/024-verify-normalized-caregiver-skills.sql
```

After Development verification and synthetic acceptance, repeat migration 024 and its verifier for UAT. Apply and verify migrations 022 through 024 on `environment-base` so future branches inherit the normalized tables, constraints, policies, grants, and empty catalog structure without application rows.

Deploy the application only after the target branch passes the verifier; the new code selects `preferred_skill_codes`.

## Acceptance

Using synthetic records only:

1. Confirm all existing required skills display by name after the backfill.
2. Focus an empty skill search and confirm the first catalog page appears; then search, load more, and save required and preferred skills as an agency owner and care coordinator.
3. Confirm the same skill cannot remain in both groups.
4. Confirm a caregiver missing a required skill is not eligible for advertising or assignment.
5. Confirm two otherwise equivalent eligible caregivers are ranked by preferred-skill coverage.
6. Confirm a caregiver and a manager from another agency cannot read or update the client skill row.
7. Self-report a caregiver skill and confirm it remains pending and does not satisfy a hard requirement until a manager verifies it.
8. Add and edit a synthetic system skill from Admin Configuration and confirm it appears in both shared pickers.

Application rollback can leave the additive column and restrictive policies in place. Do not remove the RLS protection during rollback. A previous application build continues using `skill_codes` and ignores the new column.
