-- Rollback: Disable Row Level Security on the patients table.
-- Run this if Phase 4.5 needs to be reverted.

BEGIN;

DROP POLICY IF EXISTS patients_agency_rls ON public.patients;

ALTER TABLE public.patients NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patients DISABLE ROW LEVEL SECURITY;

COMMIT;
