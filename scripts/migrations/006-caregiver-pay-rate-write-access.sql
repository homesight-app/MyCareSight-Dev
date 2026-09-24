-- 006: manager-only pay-rate inserts and period closing. Dev first, then UAT.
-- Requires 002 and 005. Does not copy or rewrite existing records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '006 cannot run against Supabase'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
   OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
   RAISE EXCEPTION '006 requires an independent owner and restricted runtime role';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.caregiver_pay_rates') AND relrowsecurity AND relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy WHERE polrelid='public.caregiver_pay_rates'::regclass)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.caregiver_pay_rates'::regclass AND polname='caregiver_pay_rates_scoped_select' AND polcmd='r')
   OR NOT has_table_privilege('mycaresight_app','public.caregiver_pay_rates','SELECT')
   OR has_table_privilege('mycaresight_app','public.caregiver_pay_rates','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('mycaresight_app','public.caregiver_pay_rates','INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION '006 requires the SELECT-only state from 005; use verification if already applied';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caregiver_pay_rates WHERE pay_rate<0 OR pay_rate='NaN'::numeric
   OR (effective_end IS NOT NULL AND effective_end<effective_start)) THEN
   RAISE EXCEPTION '006 found invalid existing rate periods or amounts; review without deleting history';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caregiver_pay_rates a JOIN public.caregiver_pay_rates b
   ON a.id<b.id AND a.agency_id=b.agency_id AND a.caregiver_member_id=b.caregiver_member_id
   AND a.service_type IS NOT DISTINCT FROM b.service_type
   WHERE daterange(a.effective_start,a.effective_end,'[)') && daterange(b.effective_start,b.effective_end,'[)')) THEN
   RAISE EXCEPTION '006 found overlapping existing rate periods; reviewed reconciliation is required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caregiver_pay_rates rate JOIN public.caregiver_members member ON member.id=rate.caregiver_member_id
   WHERE member.agency_id IS DISTINCT FROM rate.agency_id) THEN
   RAISE EXCEPTION '006 found inconsistent caregiver/rate agency links';
 END IF;
END $preflight$;

ALTER TABLE public.caregiver_pay_rates
 ADD CONSTRAINT caregiver_pay_rates_valid_amount CHECK(pay_rate>=0 AND pay_rate<>'NaN'::numeric),
 ADD CONSTRAINT caregiver_pay_rates_valid_period CHECK(effective_end IS NULL OR effective_end>=effective_start);

CREATE UNIQUE INDEX caregiver_pay_rates_live_start_key
 ON public.caregiver_pay_rates(agency_id,caregiver_member_id,service_type,effective_start) NULLS NOT DISTINCT
 WHERE effective_end IS NULL OR effective_end>effective_start;

CREATE FUNCTION public.app_guard_pay_rate_timeline() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $guard$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.agency_id::text||'/'||NEW.caregiver_member_id::text||'/'||COALESCE(NEW.service_type,'*'),0));
 IF TG_OP='UPDATE' AND (NEW.agency_id IS DISTINCT FROM OLD.agency_id
   OR NEW.caregiver_member_id IS DISTINCT FROM OLD.caregiver_member_id
   OR NEW.pay_rate IS DISTINCT FROM OLD.pay_rate OR NEW.effective_start IS DISTINCT FROM OLD.effective_start
   OR NEW.unit_type IS DISTINCT FROM OLD.unit_type OR NEW.service_type IS DISTINCT FROM OLD.service_type
   OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
   RAISE EXCEPTION 'Pay-rate history is immutable; append a new rate';
 END IF;
 IF NEW.effective_end IS NOT NULL AND NEW.effective_end<NEW.effective_start THEN
   RAISE EXCEPTION 'Invalid rate period';
 END IF;
 IF EXISTS(SELECT 1 FROM public.caregiver_pay_rates rate WHERE rate.id<>NEW.id
   AND rate.agency_id=NEW.agency_id AND rate.caregiver_member_id=NEW.caregiver_member_id
   AND rate.service_type IS NOT DISTINCT FROM NEW.service_type
   AND daterange(rate.effective_start,rate.effective_end,'[)') && daterange(NEW.effective_start,NEW.effective_end,'[)')) THEN
   RAISE EXCEPTION 'Overlapping pay-rate periods are not allowed';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.app_guard_pay_rate_timeline() FROM PUBLIC,mycaresight_app;
CREATE TRIGGER caregiver_pay_rates_guard_timeline BEFORE INSERT OR UPDATE
 ON public.caregiver_pay_rates FOR EACH ROW EXECUTE FUNCTION public.app_guard_pay_rate_timeline();

CREATE POLICY caregiver_pay_rates_manager_insert ON public.caregiver_pay_rates
 FOR INSERT TO mycaresight_app WITH CHECK (EXISTS (
    SELECT 1 FROM public.caregiver_members member
    JOIN public.user_profiles actor ON actor.id::text=NULLIF(current_setting('app.current_user_id',true),'')
      AND actor.is_active=true AND actor.role IN ('company_owner','care_coordinator')
    JOIN public.user_agency_roles membership ON membership.user_id=actor.id
      AND membership.agency_id=member.agency_id AND membership.role=actor.role AND membership.status='active'
    WHERE member.id=caregiver_pay_rates.caregiver_member_id AND member.agency_id=caregiver_pay_rates.agency_id
  ));
CREATE POLICY caregiver_pay_rates_manager_close ON public.caregiver_pay_rates
 FOR UPDATE TO mycaresight_app USING (EXISTS (
    SELECT 1 FROM public.caregiver_members member
    JOIN public.user_profiles actor ON actor.id::text=NULLIF(current_setting('app.current_user_id',true),'')
      AND actor.is_active=true AND actor.role IN ('company_owner','care_coordinator')
    JOIN public.user_agency_roles membership ON membership.user_id=actor.id
      AND membership.agency_id=member.agency_id AND membership.role=actor.role AND membership.status='active'
    WHERE member.id=caregiver_pay_rates.caregiver_member_id AND member.agency_id=caregiver_pay_rates.agency_id
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.caregiver_members member
    JOIN public.user_profiles actor ON actor.id::text=NULLIF(current_setting('app.current_user_id',true),'')
      AND actor.is_active=true AND actor.role IN ('company_owner','care_coordinator')
    JOIN public.user_agency_roles membership ON membership.user_id=actor.id
      AND membership.agency_id=member.agency_id AND membership.role=actor.role AND membership.status='active'
    WHERE member.id=caregiver_pay_rates.caregiver_member_id AND member.agency_id=caregiver_pay_rates.agency_id
  ));
GRANT INSERT(agency_id,caregiver_member_id,pay_rate,effective_start,effective_end,unit_type,service_type)
 ON public.caregiver_pay_rates TO mycaresight_app;
GRANT UPDATE(effective_end,updated_at) ON public.caregiver_pay_rates TO mycaresight_app;
-- No UPDATE of historical amount/ownership, no DELETE, no other table grants.
COMMIT;
