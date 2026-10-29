SELECT
  has_column_privilege('mycaresight_app', 'public.visit_series', 'status', 'UPDATE') AS app_can_update_series_status,
  NOT has_column_privilege('mycaresight_app', 'public.visit_series', 'repeat_end', 'UPDATE') AS app_cannot_change_series_end,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'visit_series'
      AND policyname = 'visit_series_manager_update_status' AND cmd = 'UPDATE'
  ) AS manager_update_policy_exists,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.visit_series'::regclass) AS forced_rls;
