-- Read-only verification for 030. Run against Neon Development, then UAT.
SELECT
  to_regclass('public.visit_corrections') IS NOT NULL AS table_exists,
  EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('public.visit_corrections')
      AND relrowsecurity AND relforcerowsecurity
  ) AS forced_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'visit_corrections') AS policy_count,
  has_table_privilege('mycaresight_app', 'public.visit_corrections', 'SELECT') AS app_can_read,
  has_table_privilege('mycaresight_app', 'public.visit_corrections', 'INSERT') AS app_can_insert,
  NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'UPDATE') AS app_cannot_update,
  NOT has_table_privilege('mycaresight_app', 'public.visit_corrections', 'DELETE') AS app_cannot_delete,
  (SELECT count(*) FROM public.visit_corrections) AS correction_count;
