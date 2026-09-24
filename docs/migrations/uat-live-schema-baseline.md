# Live schema baseline: UAT Supabase removal

Verified: 2026-09-20 through read-only Supabase and Neon MCP connections.
Only catalog/schema metadata was queried. No application records, passwords, tokens, or PHI were read or copied. No remote database was changed.

## Confirmed targets

| Environment | Project | Branch | Database |
| --- | --- | --- | --- |
| Supabase source | ruidwstxnkgajavxsyft | Existing source | postgres |
| Local development | steep-sky-59385366 | dev (br-bitter-dust-axfgiziy) | neondb |
| Azure UAT target | steep-sky-59385366 | uat (br-empty-mouse-axnk8fbc) | neondb |

The Neon project also has a default branch named production. It was returned by branch discovery but was **not queried**. All Neon SQL calls explicitly selected dev or uat. The user identified these branch purposes; deployed Azure configuration has not yet been independently checked.

## Catalog comparison

The inspected public-schema columns, constraint definitions, function signatures, RLS flags/policies, and non-internal trigger definitions match exactly between dev and uat. Index definitions and the inspected runtime-role flags also match. This does not establish data parity, grants parity, runtime connection identity, or application behavior.

| Public-schema metadata | Supabase | Neon dev | Neon uat |
| --- | ---: | ---: | ---: |
| Tables | 75 | 67 | 67 |
| Columns | 968 | 866 | 866 |
| Primary-key constraints | 75 | 66 | 66 |
| Foreign-key constraints | 173 | 41 | 41 |
| Unique constraints (excluding primary keys) | 24 | 0 | 0 |
| Check constraints | 50 | 0 | 0 |
| Indexes | 263 | 103 | 103 |
| Application functions (excluding extension functions) | 97 | 0 | 0 |
| Non-internal triggers | 64 | 0 | 0 |
| Tables with RLS enabled | 75 | 1 | 1 |
| RLS policies | 337 | 1 | 1 |

Supabase is PostgreSQL 17.6; both Neon branches report PostgreSQL 18.6. PostgreSQL 18 represents NOT NULL constraints in pg_constraint: Neon's 459 type-n entries must not be mistaken for migrated check constraints.

All 866 shared columns match by name, data type, underlying type, and nullability. Defaults, dropped-column positions, identity ownership, grants, and behavior are separate concerns. Existing primary keys generally have different names; a name-only diff would incorrectly report them missing.

## Missing application tables

Both Neon branches lack these seven tables, already referenced by application code:

- caregiver_pay_rates
- credential_catalog
- internal_notes
- visit_adjustment_history
- visit_approvals
- visit_financials
- visit_time_entries

The eighth source-only table, kv_store_3706f9c5, is explicitly excluded by scripts/gen-neon-schema.js and is not automatically part of the application migration.

## Confirmed functional and integrity gaps

- The source functions get_total_unread_count_for_user(uuid[], uuid) and admin_unread_message_counts_by_client(uuid, uuid[]) exist in public; neither exists in Neon. Their absence explains the earlier 42883 errors. This is not just a missing cast.
- All six message read/unread functions referenced by the current messaging query module are absent in Neon. Source messages.is_read is uuid[] (per-user read state), not boolean. Preserve that contract when replacing RPC calls.
- The total-unread query wrapper currently returns a result row object where NotificationDropdown expects a scalar count. Repair this return contract along with the missing RPC dependency.
- The legacy markConversationMessagesAsReadExceptSender query assigns boolean true to messages.is_read, which is uuid[] on both providers. Audit callers before replacing it with per-user read state.
- system_settings lacks its source composite primary key (category, key).
- Existing shared tables lack all 19 source unique constraints and all 41 source check constraints. Neon's unique indexes inspected here cover primary keys only, so alternate unique indexes do not close this gap.
- Foreign-key coverage and delete behavior differ. For example, messages.conversation_id cascades on deletion in Supabase but uses the default delete action in Neon. Some source auth.users references intentionally need user_profiles equivalents. Do not blindly replay source foreign keys.
- No application triggers were migrated. Source triggers drive membership synchronization, notifications, application progress, licensing, timestamps, visit status, and other behavior. Each must be retained in a portable implementation or replaced explicitly in server code. Multiple source triggers appear to overlap; copying every trigger without review is not an acceptable migration.
- Source message-read functions include SECURITY DEFINER and a timestamp-window notification update. Do not copy these blindly: new server operations must authorize the requesting user and exact resource.

## Authorization evidence and limits

Both Neon branches have mycaresight_app with LOGIN and without SUPERUSER/BYPASSRLS. neondb_owner has BYPASSRLS. Role existence does not prove that local or Azure DATABASE_URL uses it.

Only public.patients has RLS enabled and forced. Its one policy applies to mycaresight_app using transaction-local user role and agency context. The policy relies on trusted server context; this inspection does not certify current membership validation or all callers.

Remaining PHI tables require explicit server authorization and audited RLS policies before external use. Preserve the existing patients policy while validating its callers. Do not copy Supabase auth.uid() policies into Neon unchanged.

## Next migration batch

1. Prepare numbered, transactional scripts for missing application tables and integrity constraints, using this live source and target evidence. Include metadata preconditions, aggregate-only data-conflict checks, and verification. Never delete conflicting rows automatically.
2. Repair message count/read operations through authorized server repositories, preserving per-user state and scalar/count contracts. Replace remaining function callers in dependency order.
3. Reconcile trigger-dependent workflows and grants/RLS before broad query cutover. Do not restore demo-user or production-only provisioning functions.
4. Apply prepared scripts manually to dev first, test with synthetic accounts/data, then apply the same reviewed scripts to uat. The agent does not apply database migrations.
5. Continue the approved storage, authentication, Realtime, and SDK/configuration removal phases. Keep Supabase configuration until final UAT acceptance.

The read-only catalog check in scripts/migrations/000-schema-preflight.sql can be run in either provider's SQL editor to repeat this inspection. Select the intended branch in the Neon console before running it. It does not make changes and is not a schema repair migration.

## Outstanding acceptance evidence

- Two synthetic-account login, refresh, logout, and password-recovery tests.
- Local and Azure runtime-role identity, tenant-denial tests, and authoritative active membership checks.
- Azure storage account/container and object ownership verification.
- Function/trigger replacement tests, constraints and indexes after migration.
- Build and end-to-end verification with all Supabase settings absent.

This report is a baseline, not Supabase-removal completion or HIPAA readiness.
