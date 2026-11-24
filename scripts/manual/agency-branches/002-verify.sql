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
ROLLBACK;
