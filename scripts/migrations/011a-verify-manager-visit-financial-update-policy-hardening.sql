-- Read-only verification for 011a. Expect two rows with policy_hardening_pass=true.
SELECT tablename,policyname,
  cmd='UPDATE' AS update_policy,
  roles=ARRAY['mycaresight_app']::name[] AS runtime_only,
  position('visit_time_entries' in coalesce(qual,''))>0 AS old_row_linked,
  position('visit_time_entries' in coalesce(with_check,''))>0 AS new_row_linked,
  CASE WHEN tablename='visit_financials'
    THEN position('visit_approvals' in coalesce(qual,''))>0
      AND position('visit_approvals' in coalesce(with_check,''))>0
    ELSE true END AS approval_linked,
  cmd='UPDATE' AND roles=ARRAY['mycaresight_app']::name[]
    AND position('visit_time_entries' in coalesce(qual,''))>0
    AND position('visit_time_entries' in coalesce(with_check,''))>0
    AND CASE WHEN tablename='visit_financials'
      THEN position('visit_approvals' in coalesce(qual,''))>0
        AND position('visit_approvals' in coalesce(with_check,''))>0
      ELSE true END AS policy_hardening_pass
FROM pg_policies
WHERE schemaname='public' AND (tablename,policyname) IN (
  ('visit_approvals','visit_approvals_manager_update'),
  ('visit_financials','visit_financials_manager_update'))
ORDER BY tablename;
