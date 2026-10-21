# Neon system-settings primary key repair

Status: the operator reports migration 028 was applied and its verifier returned `key_ok=true`, `duplicate_groups=0` on Neon Development, UAT, `environment-base`, and the protected production branch. This is user-reported verification, not an agent connection. The operator's earlier aggregate-only Neon Development checks found four `(category, key)` duplicate groups. Each had three complete rows with the same content, so two copies per group were redundant. The pre-migration row counts on the other branches were not provided.

The live Supabase production index export includes the composite `system_settings_pkey` on `(category, key)`. The Neon Development export has no index on `system_settings`. The existing `upsertSystemSetting` write uses `ON CONFLICT (category, key)`, so it needs that key. The corresponding read has no ordering and can otherwise choose arbitrarily among duplicate settings.

## Controlled operator sequence

1. Select the intended **Neon Development** branch and confirm its identity outside the SQL result (`current_database()` cannot identify a Neon branch). Use the aggregate-only checks already performed; require that every duplicate group has one distinct full-row version. Never share setting values, paths, or updater identifiers.
2. Apply `scripts/migrations/028-system-settings-primary-key.sql` using the SQL editor's **Run** action, not Explain. The script rejects a Supabase target or runtime-role execution, locks the table, aborts on differing copies, removes only extra complete duplicates, adds the source composite primary key, and verifies its definition in the same transaction. An error rolls back all row changes and the new key.
3. Run `scripts/migrations/028-verify-system-settings-primary-key.sql`. Require `key_ok=true` and `duplicate_groups=0`. Re-run migration 028 once to verify idempotence, then run the verifier again. Test a synthetic branding-setting save and refresh. Do not use production values or screenshots.
4. Repeat branch identity, duplicate preflight, migration, verifier, and synthetic save on Neon UAT. Assess `environment-base` and the empty protected Neon production branch independently; neither inherits later schema changes. Their data may differ, so never assume Development's four identical groups exist there.

Migration 028 never copies Supabase production settings. The production import must decide whether source settings such as branding paths should be imported, transformed, or recreated with production-specific Azure Storage references. Reconcile all other source/target integrity gaps before importing business data.

Rollback: errors during migration 028 roll back the transaction. After a successful run, the removed rows were complete duplicates; do not attempt to reconstruct them as separate settings. A later change to the key must be a reviewed forward migration after checking writers and imported data. No role, RLS, storage, or application code is changed here.
