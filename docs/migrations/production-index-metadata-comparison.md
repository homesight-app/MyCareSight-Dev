# Production index metadata comparison

Assessment: 2026-10-21. Evidence: user-exported, read-only `pg_indexes` metadata from live Supabase production and Neon Development. The agent did not connect to either database or inspect application rows. The user reports that the Neon Development, UAT, and protected production branches currently have the same schema; that branch parity has not been independently verified.

## Result and limits

The Supabase export contains 263 public indexes (113 unique); the Neon Development export contains 206 (115 unique). After removing index names and schema qualification from definitions, 125 Supabase index definitions on tables represented in both exports have no exact Neon match: 28 unique and 97 nonunique. Another 16 Supabase indexes belong to tables with no index in the Neon export. These are **comparison candidates**, not 141 instructions to create indexes. Differing PostgreSQL versions, equivalent keys with different names or predicates, removed provider-specific behavior, and new Neon-only application tables all require review. In particular, Neon `feature_plans_name_key` enforces `lower(name)` while Supabase enforces `name`; Neon `scheduled_visits_series_date_unique` is partial while the source key is not.

The comparison covers index definitions only. It does not establish matching constraints, columns, defaults, foreign keys, RLS, grants, functions, triggers, data, or application behavior. Do not import production data or apply the source indexes wholesale based on these counts.

## Confirmed application write-path blockers in the Neon Development export

Each existing Neon query has an explicit `ON CONFLICT` target, but the exported Neon indexes do not include the matching source key. As with migration 027, PostgreSQL needs a suitable unique arbiter for these writes.

| Table | Required conflict target | Source index | Existing caller |
| --- | --- | --- | --- |
| `agency_configurations` | `(agency_id)` | `agency_configurations_agency_id_key` | `upsertAgencyConfiguration` in `src/lib/supabase/query/agencies.ts` |
| `agency_lead_stages` | `(agency_id, key)` | `agency_lead_stages_agency_id_key_key` | `seedDefaultAgencyLeadStages` in `src/lib/supabase/query/leads.ts` |
| `patient_lead_details` | `(lead_id)` | `patient_lead_details_lead_id_key` | `upsertPatientLeadDetails` in `src/lib/supabase/query/leads.ts` |
| `system_settings` | `(category, key)` | `system_settings_pkey` | `upsertSystemSetting` in `src/lib/supabase/query/system-settings.ts` |

`system_settings` has a source index but no index at all in the Neon export; this does not prove that the Neon table is absent. The earlier live schema baseline reported the composite primary key missing. Verify the current target table and constraints before preparing a repair.

Migration 029 covers the other three confirmed `ON CONFLICT` gaps: agency configurations, agency lead stages, and patient lead details. It adds only the source-equivalent unique indexes and aborts if the target branch has duplicate keys. The operator reports its verifier returned `key_ok=true`, `duplicate_groups=0` for all three on Neon Development, UAT, `environment-base`, and protected production. Synthetic workflow acceptance on UAT remains unreported.

The operator ran aggregate-only duplicate checks on Neon Development. `agency_configurations`, `agency_lead_stages`, and `patient_lead_details` each returned zero duplicate key groups. `system_settings` returned four duplicate `(category, key)` groups. No setting keys, values, or application rows were shared. Adding the source composite primary key to Development would fail until those four groups are reviewed and reconciled. The current `getSystemSettingsByCategory` query has no ordering and folds rows into an object by key, so duplicate settings may also produce ambiguous read behavior.

A second aggregate-only Development check showed that each of the four `system_settings` groups contains three rows, one distinct `value`, and no variation in `updated_at`. At that point, `updated_by` and complete-row equivalence remained unverified; matching values and timestamps alone would not justify row removal.

The operator then checked complete-row equivalence: all four groups have `full_row_versions=1`. Migration 028 removes only extra identical rows and restores the source composite primary key. The operator reports `key_ok=true`, `duplicate_groups=0` on Neon Development, UAT, `environment-base`, and the protected production branch. The agent did not connect to those databases, and pre-migration row counts outside Development were not provided.

## Other source uniqueness requiring disposition

The Supabase export has additional unique definitions absent or different in the Neon export for `agency_lead_stages` entry/won/lost flags; onboarding token; billing code; case ID; certification/application pair; configuration type code and configuration values; conversation/application; license requirement/state/type; licensing expert/user; primary patient address; skilled care-plan task/day; active patient service contract; playbook item/validation rule; one pending schedule assignment and unassignment per pair; task catalog code; task category name/service; and task/required credential. Some are business integrity rules, some may be replaced by a different target design. Each needs a decision supported by target metadata, aggregate duplicate checks, and the current application workflow before a migration is written.

The 97 unmatched nonunique source definitions include audit, patient, visit, application, licensing, and scheduling lookup indexes. Review these against current query patterns and likely production volume; missing nonunique indexes may slow a query but do not explain an `ON CONFLICT` failure. Avoid creating redundant indexes when a present composite or unique index covers the same lookup.

## Next controlled step

Verify the four conflict targets against the actual Neon production branch metadata, confirm affected target columns and ownership, and run aggregate-only duplicate preflights before preparing numbered, reversible-forward migrations. Test each on synthetic Development and UAT workflows, then apply the reviewed schema changes to the empty production branch before importing source data. Reconcile all remaining source uniqueness and other constraints before migration rehearsal. Source and target exports should be refreshed if any schema changes occur meanwhile.
