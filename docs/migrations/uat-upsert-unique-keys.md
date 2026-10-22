# Three Neon upsert-key repairs

Status: the operator reports migration 029 applied to Neon Development, UAT, `environment-base`, and protected production, with its verifier returning `key_ok=true`, `duplicate_groups=0` for all three keys on each branch. No live branch has been changed by the agent. The operator's earlier read-only Neon Development checks also returned zero duplicate groups for `agency_configurations(agency_id)`, `agency_lead_stages(agency_id, key)`, and `patient_lead_details(lead_id)`. Synthetic workflow acceptance on UAT has not been reported.

The user's live Supabase production index export contains all three unique indexes. The Neon Development export has no matching indexes. Existing application writes specify these exact `ON CONFLICT` targets, so they can fail until the keys are present. Migration 029 adds only the three indexes; it does not edit rows, authorization, RLS, or grants.

## Operator sequence

1. Select **Neon Development** and confirm the branch in the console. Apply `scripts/migrations/029-upsert-unique-keys.sql` with **Run**, not Explain. The transaction locks the three tables, checks for duplicates, creates the three source-equivalent indexes, and verifies their catalog definitions. If any check fails, the transaction rolls back.
2. Run `scripts/migrations/029-verify-upsert-unique-keys.sql`. Require three rows, each with `key_ok=true`, `duplicate_groups=0`. Re-run the migration and verifier to check idempotence. Test synthetic saves for agency configuration, agency lead stage creation, and patient lead details where those workflows are available.
3. Repeat branch identity, migration, verifier, and appropriate synthetic acceptance on **Neon UAT**. Apply the same reviewed migration to `environment-base` and the protected production branch independently; an existing child branch does not inherit later parent changes. Each branch's migration checks its own rows before making the index change.

Do not paste patient lead data, setting values, or credentials into issue reports. The verifier returns only table names, booleans, and counts. If a branch reports duplicate groups or an existing conflicting index definition, leave its rows untouched and reconcile under a separate reviewed change.

Rollback: a failure before commit leaves no index changes. After commit, removing an index could break the existing upsert path, so use a reviewed forward correction rather than dropping a key as a routine rollback. Before production data import, verify source and target definitions again and reconcile the remaining unique, check, and foreign-key differences separately.
