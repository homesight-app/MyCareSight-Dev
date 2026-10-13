# Client caregiver skill preferences

Status: migration 022 and its application changes are prepared locally. They have not been applied to a Neon branch or deployed.

## Behavior

Agency owners and care coordinators can configure two caregiver skill sets from a client profile:

- **Required:** every skill must be present for direct-assignment and open-shift eligibility.
- **Preferred:** coverage improves caregiver ranking but never excludes a caregiver.

The editor reads every active `skill` entry in `credential_catalog`. Saved legacy values remain visible under `Other` so catalog drift cannot produce a count with an empty display. New saves accept only active canonical catalog names and prevent a skill from appearing in both sets.

## Database and access changes

Migration `022-client-caregiver-skill-preferences.sql`:

- adds `patient_skill_requirements.preferred_skill_codes` with an empty-array default;
- limits each set to 100 values and rejects null or overlapping entries;
- enables and forces RLS on `patient_skill_requirements`;
- permits reads and writes only for an active `company_owner` or `care_coordinator` membership in the row's agency;
- verifies that each requirement row references a patient in the same agency; and
- removes runtime delete access because the application uses an auditable upsert.

The application validates the shared Zod schema on the client and server, validates selected names against the active credential catalog, and writes the requirement change and identifier-only audit in one actor-context transaction.

## Application order

Use a direct migration-owner connection, not the pooled application or jobs role:

```powershell
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/022-client-caregiver-skill-preferences.sql
psql $env:DEV_NEON_OWNER_URL -X -v ON_ERROR_STOP=1 -f scripts/migrations/022-verify-client-caregiver-skill-preferences.sql
```

After Development verification and synthetic acceptance, repeat the migration and verifier for UAT. Apply and verify the same migration on `environment-base` so future branches inherit the column, constraints, policies, and grants without application rows.

Deploy the application only after the target branch passes the verifier; the new code selects `preferred_skill_codes`.

## Acceptance

Using synthetic records only:

1. Confirm all nine existing required skills display by name.
2. Open the editor as an agency owner and care coordinator, then save required and preferred skills.
3. Confirm the same skill cannot remain in both groups.
4. Confirm a caregiver missing a required skill is not eligible for advertising or assignment.
5. Confirm two otherwise equivalent eligible caregivers are ranked by preferred-skill coverage.
6. Confirm a caregiver and a manager from another agency cannot read or update the client skill row.

Application rollback can leave the additive column and restrictive policies in place. Do not remove the RLS protection during rollback. A previous application build continues using `skill_codes` and ignores the new column.
