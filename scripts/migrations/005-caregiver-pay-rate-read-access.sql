-- 005: pay-rate SELECT only. Dev first, then UAT with matching code.
-- One-time after 002. Production/Supabase are outside this migration slice.
-- Scoped rates only. Agency roles require active membership; staff may read their own rates.
-- Writes and the missing append-rate function remain deferred.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE dependency text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '005 must not run against the Supabase source';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
      OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '005 requires an independent migration owner and a restricted runtime role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.caregiver_pay_rates')
      AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION '005 requires the staged pay-rate table from 002';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.caregiver_pay_rates'::regclass)
      OR has_table_privilege('mycaresight_app','public.caregiver_pay_rates',
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '005 requires untouched staging access; use verification if already applied';
  END IF;
  FOREACH dependency IN ARRAY ARRAY['user_profiles','user_agency_roles','caregiver_members']
  LOOP
    IF to_regclass(format('public.%I',dependency)) IS NULL THEN
      RAISE EXCEPTION '005 missing dependency: %',dependency;
    END IF;
    IF NOT has_table_privilege('mycaresight_app',format('public.%I',dependency),'SELECT') THEN
      RAISE EXCEPTION '005 runtime lacks SELECT on dependency: %',dependency;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('mycaresight_app','public.audit_log','INSERT') THEN
    RAISE EXCEPTION '005 requires runtime audit INSERT privilege';
  END IF;
END
$preflight$;

CREATE POLICY caregiver_pay_rates_scoped_select ON public.caregiver_pay_rates
  FOR SELECT TO mycaresight_app
  USING (EXISTS (
    SELECT 1 FROM public.caregiver_members member
    JOIN public.user_profiles actor
      ON actor.id::text = NULLIF(current_setting('app.current_user_id',true),'')
      AND actor.is_active = true
    WHERE member.id = caregiver_pay_rates.caregiver_member_id
      AND member.agency_id = caregiver_pay_rates.agency_id
      AND (
        actor.role IN ('admin','expert')
        OR (
          actor.role IN ('company_owner','care_coordinator','staff_member')
          AND EXISTS (
            SELECT 1 FROM public.user_agency_roles membership
            WHERE membership.user_id = actor.id AND membership.agency_id = member.agency_id
              AND membership.role = actor.role AND membership.status = 'active'
          )
          AND (actor.role <> 'staff_member' OR (member.user_id = actor.id AND member.status = 'active'))
        )
      )
  ));
GRANT SELECT ON TABLE public.caregiver_pay_rates TO mycaresight_app;

-- No INSERT/UPDATE/DELETE grants or policies; no other table's access is changed.
COMMIT;
