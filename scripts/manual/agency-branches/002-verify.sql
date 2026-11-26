-- OPERATOR ONLY: aggregate/metadata verification, no record contents.
BEGIN READ ONLY;
SET LOCAL ROLE mycaresight_schema_owner;
SELECT current_database() AS database_name, current_user AS execution_role,
  current_setting('neon.branch_id', true) AS branch_id;

SELECT
  (SELECT count(*) FROM public.agencies a WHERE NOT EXISTS (
    SELECT 1 FROM public.agency_branches b WHERE b.agency_id = a.id AND b.is_default AND b.status = 'active')) AS agencies_without_default,
  (SELECT count(*) FROM public.leads WHERE (agency_id IS NULL) <> (branch_id IS NULL)) AS leads_without_valid_presence,
  (SELECT count(*) FROM public.applications a WHERE a.agency_id IS NOT NULL AND a.caregiver_member_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.application_branches b WHERE b.application_id = a.id AND b.agency_id = a.agency_id)) AS programs_without_branch;

-- patients FORCE RLS is not bypassed to count records. Validated NOT NULL and
-- same-agency foreign keys prove the branch invariant independently of row visibility.
SELECT
  (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.patients'::regclass AND attname = 'branch_id' AND NOT attisdropped) AS patients_branch_required,
  (SELECT count(*) = 4 AND bool_and(convalidated) FROM pg_constraint WHERE conname IN
    ('patient_branch_agency_fk', 'lead_branch_agency_fk', 'lead_branch_presence', 'application_id_agency_unique')) AS validated_record_constraints,
  (SELECT count(*) = 2 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN
    ('public.agency_branches'::regclass, 'public.application_branches'::regclass)) AS branch_rls_forced,
  (SELECT count(*) = 3 AND bool_and(i.indisvalid) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN
      ('agency_programs_listing', 'application_playbook_items_application_status_idx', 'scheduled_visits_agency_patient_idx')) AS supporting_indexes_valid,
  NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.patients'::regclass AND polname = 'branches_patient_backfill') AS backfill_policy_removed,
  NOT has_table_privilege('mycaresight_app', 'public.agency_branches', 'DELETE') AS runtime_cannot_delete_branches,
  NOT has_table_privilege('mycaresight_app', 'public.application_branches', 'UPDATE') AS runtime_cannot_rewrite_program_links,
  NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app' AND (rolsuper OR rolbypassrls))
    AND NOT pg_has_role('mycaresight_app', 'mycaresight_schema_owner', 'MEMBER') AS runtime_role_isolated,
  NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN
      ('branch_create_first', 'branch_require_default', 'branch_assign_default', 'branch_patient_history_guard', 'branch_application_default', 'branch_application_required')
      AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS trigger_functions_not_public;

-- A zero row-gap count alone cannot prove that future writes will get defaults.
WITH expected(relation, trigger_name, function_name, trigger_type, deferred) AS (VALUES
  ('agencies', 'branch_agency_created', 'branch_create_first', 5, false),
  ('agency_branches', 'branches_require_default', 'branch_require_default', 25, true),
  ('leads', 'leads_branch_default', 'branch_assign_default', 23, false),
  ('patients', 'patients_branch_default', 'branch_assign_default', 23, false),
  ('patients', 'patients_branch_history', 'branch_patient_history_guard', 19, false),
  ('applications', 'application_branch_default', 'branch_application_default', 21, false),
  ('application_branches', 'application_branch_required', 'branch_application_required', 9, true),
  ('applications', 'application_branch_required_on_application', 'branch_application_required', 21, true)
)
SELECT bool_and(EXISTS (
  SELECT 1 FROM pg_trigger t
  WHERE t.tgrelid = to_regclass('public.' || e.relation) AND t.tgname = e.trigger_name
    AND t.tgfoid = to_regprocedure('public.' || e.function_name || '()')
    AND t.tgenabled = 'O' AND NOT t.tgisinternal AND t.tgtype = e.trigger_type
    AND t.tgdeferrable = e.deferred AND t.tginitdeferred = e.deferred
    AND (e.trigger_name <> 'application_branch_default' OR EXISTS (
      SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.tgrelid AND a.attname = 'caregiver_member_id'
        AND a.attnum = ANY(t.tgattr::smallint[])
    ))
)) AS branch_triggers_valid FROM expected e;

WITH expected(relation, local_columns, referenced_relation, referenced_columns, delete_action) AS (VALUES
  ('leads', ARRAY['branch_id','agency_id'], 'agency_branches', ARRAY['id','agency_id'], 'r'),
  ('patients', ARRAY['branch_id','agency_id'], 'agency_branches', ARRAY['id','agency_id'], 'r'),
  ('application_branches', ARRAY['application_id','agency_id'], 'applications', ARRAY['id','agency_id'], 'c'),
  ('application_branches', ARRAY['branch_id','agency_id'], 'agency_branches', ARRAY['id','agency_id'], 'r')
)
SELECT bool_and(EXISTS (
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid = to_regclass('public.' || e.relation) AND c.contype = 'f' AND c.convalidated
    AND c.confrelid = to_regclass('public.' || e.referenced_relation) AND c.confdeltype::text = e.delete_action
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ordinal)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ordinal) = e.local_columns
    AND ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ordinal)
      JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ordinal) = e.referenced_columns
)) AS branch_foreign_keys_valid FROM expected e;
ROLLBACK;
