-- 025: Replace menu-item feature flags with normalized agency capabilities.
-- Apply after the current Neon baseline and before deploying the matching app.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  duplicate_plan_name_count integer;
  orphan_agency_plan_count integer;
  orphan_plan_feature_count integer;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '025 must not run against Supabase';
  END IF;
  IF to_regclass('public.feature_plans') IS NULL
     OR to_regclass('public.plan_features') IS NULL
     OR to_regclass('public.agencies') IS NULL
     OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '025 requires the Neon plan, agency, identity, and audit tables';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '025 requires an independent migration owner and restricted runtime role';
  END IF;

  SELECT count(*)::integer INTO duplicate_plan_name_count
  FROM (
    SELECT lower(trim(name))
    FROM public.feature_plans
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
  ) duplicates;
  IF duplicate_plan_name_count > 0 THEN
    RAISE EXCEPTION
      '025 found % duplicate case-insensitive feature-plan names; reconcile them before retrying',
      duplicate_plan_name_count;
  END IF;

  SELECT count(*)::integer INTO orphan_agency_plan_count
  FROM public.agencies agency
  LEFT JOIN public.feature_plans plan ON plan.id = agency.plan_id
  WHERE agency.plan_id IS NOT NULL AND plan.id IS NULL;
  IF orphan_agency_plan_count > 0 THEN
    RAISE EXCEPTION
      '025 found % agencies assigned to missing feature plans; reconcile them before retrying',
      orphan_agency_plan_count;
  END IF;

  SELECT count(*)::integer INTO orphan_plan_feature_count
  FROM public.plan_features feature
  LEFT JOIN public.feature_plans plan ON plan.id = feature.plan_id
  WHERE plan.id IS NULL;
  IF orphan_plan_feature_count > 0 THEN
    RAISE EXCEPTION
      '025 found % legacy plan features assigned to missing plans; reconcile them before retrying',
      orphan_plan_feature_count;
  END IF;
END
$preflight$;

LOCK TABLE public.feature_plans, public.plan_features, public.agencies
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.capability_catalog (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capability_catalog_key_check CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$')
);

INSERT INTO public.capability_catalog (key, label, description, sort_order)
VALUES
  ('client_management', 'Client Management', 'Manage leads, clients, and client records.', 10),
  ('care_operations', 'Care Operations', 'Scheduling, assignment, shift advertising, visit execution, pay and bill rates, time, billing, and payroll preparation.', 20),
  ('caregiver_management', 'Caregiver Management', 'Create and manage caregiver accounts and profiles.', 30),
  ('agency_compliance', 'Agency Compliance', 'Manage agency certification and compliance records.', 40),
  ('analytics_reporting', 'Analytics & Reporting', 'View operational reports and exports.', 50),
  ('homesights_services', 'HomeSights Services', 'Access HomeSights services and reusable templates.', 60);

CREATE TABLE public.plan_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.feature_plans(id) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES public.capability_catalog(key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_capabilities_plan_capability_key UNIQUE (plan_id, capability_key)
);

CREATE INDEX plan_capabilities_capability_plan_idx
  ON public.plan_capabilities(capability_key, plan_id);

-- Existing UAT plans contain synthetic configuration only. Preserve their
-- intent while consolidating related menu flags into stable capabilities.
INSERT INTO public.plan_capabilities (plan_id, capability_key)
SELECT DISTINCT feature.plan_id, mapping.capability_key
FROM public.plan_features feature
CROSS JOIN LATERAL (
  VALUES
    (CASE WHEN feature.feature_key IN ('leads', 'clients') THEN 'client_management' END),
    (CASE WHEN feature.feature_key IN ('care_visits', 'time_billing', 'clients_scheduling') THEN 'care_operations' END),
    (CASE WHEN feature.feature_key = 'caregivers' THEN 'caregiver_management' END),
    (CASE WHEN feature.feature_key = 'certifications' THEN 'agency_compliance' END),
    (CASE WHEN feature.feature_key = 'reports' THEN 'analytics_reporting' END),
    (CASE WHEN feature.feature_key IN ('licenses', 'programs', 'templates') THEN 'homesights_services' END)
) mapping(capability_key)
WHERE mapping.capability_key IS NOT NULL
ON CONFLICT (plan_id, capability_key) DO NOTHING;

DROP TABLE public.plan_features;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agencies'::regclass
      AND conname = 'agencies_plan_id_fkey'
  ) THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT agencies_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES public.feature_plans(id) ON DELETE RESTRICT;
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS feature_plans_name_key
  ON public.feature_plans(lower(name));

CREATE OR REPLACE FUNCTION public.plan_actor_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true
  )
$function$;

CREATE OR REPLACE FUNCTION public.plan_actor_is_platform_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true
      AND actor.role IN ('admin', 'expert')
  )
$function$;

CREATE OR REPLACE FUNCTION public.plan_actor_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true
      AND actor.role = 'admin'
  )
$function$;

REVOKE ALL ON FUNCTION public.plan_actor_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_actor_is_platform_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.plan_actor_is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_actor_is_active() TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.plan_actor_is_platform_staff() TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.plan_actor_is_platform_admin() TO mycaresight_app;

ALTER TABLE public.capability_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capability_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feature_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plan_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_capabilities FORCE ROW LEVEL SECURITY;

CREATE POLICY capability_catalog_active_select
  ON public.capability_catalog FOR SELECT TO mycaresight_app
  USING (public.plan_actor_is_active());

CREATE POLICY feature_plans_platform_select
  ON public.feature_plans FOR SELECT TO mycaresight_app
  USING (public.plan_actor_is_platform_staff());
CREATE POLICY feature_plans_admin_insert
  ON public.feature_plans FOR INSERT TO mycaresight_app
  WITH CHECK (public.plan_actor_is_platform_admin());
CREATE POLICY feature_plans_admin_update
  ON public.feature_plans FOR UPDATE TO mycaresight_app
  USING (public.plan_actor_is_platform_admin())
  WITH CHECK (public.plan_actor_is_platform_admin());
CREATE POLICY feature_plans_admin_delete
  ON public.feature_plans FOR DELETE TO mycaresight_app
  USING (public.plan_actor_is_platform_admin());

CREATE POLICY plan_capabilities_select
  ON public.plan_capabilities FOR SELECT TO mycaresight_app
  USING (
    public.plan_actor_is_platform_staff()
    OR EXISTS (
      SELECT 1
      FROM public.agencies agency
      JOIN public.user_profiles actor
        ON actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
       AND actor.is_active = true
      JOIN public.user_agency_roles membership
        ON membership.agency_id = agency.id
       AND membership.user_id = actor.id
       AND membership.role = actor.role
       AND membership.status = 'active'
      WHERE agency.plan_id = plan_capabilities.plan_id
    )
  );
CREATE POLICY plan_capabilities_admin_insert
  ON public.plan_capabilities FOR INSERT TO mycaresight_app
  WITH CHECK (public.plan_actor_is_platform_admin());
CREATE POLICY plan_capabilities_admin_delete
  ON public.plan_capabilities FOR DELETE TO mycaresight_app
  USING (public.plan_actor_is_platform_admin());

REVOKE ALL ON public.capability_catalog, public.feature_plans,
  public.plan_capabilities FROM PUBLIC, mycaresight_app;
GRANT SELECT ON public.capability_catalog TO mycaresight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_plans TO mycaresight_app;
GRANT SELECT, INSERT, DELETE ON public.plan_capabilities TO mycaresight_app;

DO $jobs_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.capability_catalog, public.feature_plans,
      public.plan_capabilities FROM mycaresight_jobs;
  END IF;
END
$jobs_access$;

INSERT INTO public.audit_log (
  agency_id, table_name, record_id, action, performed_by_user_id, details
)
SELECT NULL, 'feature_plans', plan.id, 'MIGRATE_CAPABILITIES', NULL,
  jsonb_build_object(
    'source', 'migration_025',
    'capability_count', count(plan_capability.id)
  )
FROM public.feature_plans plan
LEFT JOIN public.plan_capabilities plan_capability ON plan_capability.plan_id = plan.id
GROUP BY plan.id;

COMMIT;
