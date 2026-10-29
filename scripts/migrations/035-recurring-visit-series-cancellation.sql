-- Allow agency scheduling managers to stop a recurring series after voiding its future visits.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DROP POLICY IF EXISTS visit_series_manager_update_status ON public.visit_series;
CREATE POLICY visit_series_manager_update_status
  ON public.visit_series FOR UPDATE TO mycaresight_app
  USING (public.visit_financial_manager_can_read(agency_id) AND status = 'active')
  WITH CHECK (public.visit_financial_manager_can_read(agency_id) AND status = 'cancelled');

GRANT UPDATE (status) ON public.visit_series TO mycaresight_app;

COMMIT;
