# UAT ADL/IADL plan save repair

Status: the operator reports migration 027 applied and verified on Neon Development and UAT (`key_ok=true`, `duplicate_groups=0` on each). A UAT plan save succeeded, and both ADL and IADL changes persisted after refresh. The UAT bug is accepted; `environment-base` schema promotion remains. No live branch was changed by the agent.

The non-skilled plan save calls `insertAdls` and `upsertPatientAdlDaySchedulesBatch`. Both use `ON CONFLICT (patient_id, legacy_task_code, day_of_week)` on `patient_care_plan_tasks`. The user reported that the live Supabase source has `uq_patient_care_plan_tasks_patient_adl_dow` on exactly those three columns. Their read-only UAT Neon index query returned only the primary key, and their duplicate-key group count returned zero. PostgreSQL cannot use `ON CONFLICT` without a matching unique key, so both ADL and IADL saves fail. The UI turns the returned non-`Error` value into the generic “Failed to save ADL plan” message.

Migration `027-patient-adl-day-unique-key.sql` restores the source index on Neon. It makes no row edits and adds no new runtime grants or policies. It rejects a Supabase target, missing table or key columns, the runtime role as migration owner, duplicate keys, and a conflicting index definition. The transaction uses a short lock timeout; if preflight fails, it rolls back without reconciling or deleting any task rows. The matching verification script reports `key_ok` and `duplicate_groups` without returning client data.

## Operator sequence

1. Select the **Neon Development** branch and confirm its branch identity. Run the read-only duplicate-group query below. Require `0`; if nonzero, stop and reconcile separately without automatic deletion.
2. Confirm the migration owner is independent of `mycaresight_app`. Apply `scripts/migrations/027-patient-adl-day-unique-key.sql` to Development, then run `scripts/migrations/027-verify-patient-adl-day-unique-key.sql`. Require `key_ok=true` and `duplicate_groups=0`.
3. Repeat the same branch check, duplicate preflight, migration, and verification on **Neon UAT**. The user already observed zero UAT duplicate groups, but repeat immediately before applying because the table can change.
4. Test with a synthetic UAT client: save an ADL day schedule, save an IADL day schedule, refresh the page, and confirm both persist. Repeat a save without adding a duplicate row. Check the browser for the generic save error and verify the affected task count without printing notes or patient details.
5. After UAT acceptance, advance the synthetic `environment-base` schema in its own controlled step. The empty protected Neon production branch will need the same reviewed key before production data import; do not apply anything there as part of this UAT repair.

Read-only duplicate preflight, returning only a count:

```sql
SELECT count(*) AS duplicate_groups
FROM (
  SELECT patient_id, legacy_task_code, day_of_week
  FROM public.patient_care_plan_tasks
  WHERE legacy_task_code IS NOT NULL
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
) duplicate_keys;
```

Rollback before dependent code or data migration: drop the added index only under a reviewed change and only after confirming no other writer depends on it. The preferred response to a failed migration is to inspect the preflight failure and leave the current rows untouched. This repair does not change production Supabase, Azure deployment, authentication, authorization, or PHI access.
