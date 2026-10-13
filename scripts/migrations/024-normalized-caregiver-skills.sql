-- 024: Normalize the caregiver skill catalog, assignments, and client requirements.
-- Apply after 023. Existing text arrays are preserved as compatibility mirrors;
-- new matching and editing use stable credential_catalog identifiers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '024 must not run against Supabase';
  END IF;
  IF to_regclass('public.credential_catalog') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL
     OR to_regclass('public.patient_skill_requirements') IS NULL
     OR to_regclass('public.configuration_types') IS NULL
     OR to_regclass('public.configuration_values') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '024 requires the Neon credential, caregiver, client, configuration, and audit tables';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = 'public.patient_skill_requirements'::regclass
      AND constraint_record.contype = 'u'
      AND constraint_record.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.patient_skill_requirements'::regclass
           AND attname = 'patient_id' AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'Run migration 023 before migration 024';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '024 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

LOCK TABLE public.credential_catalog, public.caregiver_members,
  public.patient_skill_requirements IN SHARE ROW EXCLUSIVE MODE;

-- Migrations 004 and 022 force RLS on these existing tables. The independent
-- migration owner needs its normal table-owner access for the controlled
-- catalog update and legacy backfill. Restore FORCE before commit.
ALTER TABLE public.credential_catalog NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patient_skill_requirements NO FORCE ROW LEVEL SECURITY;

INSERT INTO public.configuration_types (
  code, name, description, supports_hierarchy, is_admin_manageable, is_active
)
SELECT 'CAREGIVER_SKILL_CATEGORY', 'Caregiver Skill Category',
  'Categories used to organize the caregiver skill catalog.', false, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.configuration_types WHERE code = 'CAREGIVER_SKILL_CATEGORY'
);

WITH category_seed(code, name, sort_order) AS (
  VALUES
    ('clinical_care', 'Clinical Care', 10),
    ('specialty_conditions', 'Specialty Conditions', 20),
    ('physical_support', 'Physical Support', 30),
    ('daily_living', 'Daily Living', 40),
    ('certifications', 'Certifications', 50),
    ('language', 'Language', 60),
    ('other', 'Other', 999)
), category_type AS (
  SELECT id FROM public.configuration_types WHERE code = 'CAREGIVER_SKILL_CATEGORY' LIMIT 1
)
INSERT INTO public.configuration_values (type_id, code, name, sort_order)
SELECT category_type.id, category_seed.code, category_seed.name, category_seed.sort_order
FROM category_seed CROSS JOIN category_type
WHERE NOT EXISTS (
  SELECT 1 FROM public.configuration_values existing
  WHERE existing.type_id = category_type.id
    AND lower(existing.code) = lower(category_seed.code)
);

ALTER TABLE public.credential_catalog
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS agency_id uuid,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

DO $catalog_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credential_catalog'::regclass
      AND conname = 'credential_catalog_scope_check'
  ) THEN
    ALTER TABLE public.credential_catalog
      ADD CONSTRAINT credential_catalog_scope_check
      CHECK (scope IN ('system', 'agency'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credential_catalog'::regclass
      AND conname = 'credential_catalog_scope_agency_check'
  ) THEN
    ALTER TABLE public.credential_catalog
      ADD CONSTRAINT credential_catalog_scope_agency_check
      CHECK (
        (scope = 'system' AND agency_id IS NULL)
        OR (scope = 'agency' AND agency_id IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credential_catalog'::regclass
      AND conname = 'credential_catalog_agency_id_fkey'
  ) THEN
    ALTER TABLE public.credential_catalog
      ADD CONSTRAINT credential_catalog_agency_id_fkey
      FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credential_catalog'::regclass
      AND conname = 'credential_catalog_category_id_fkey'
  ) THEN
    ALTER TABLE public.credential_catalog
      ADD CONSTRAINT credential_catalog_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.configuration_values(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credential_catalog'::regclass
      AND conname = 'credential_catalog_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.credential_catalog
      ADD CONSTRAINT credential_catalog_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;
END
$catalog_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS credential_catalog_system_skill_name_key
  ON public.credential_catalog (lower(name))
  WHERE credential_type = 'skill' AND scope = 'system';
CREATE UNIQUE INDEX IF NOT EXISTS credential_catalog_agency_skill_name_key
  ON public.credential_catalog (agency_id, lower(name))
  WHERE credential_type = 'skill' AND scope = 'agency';
CREATE INDEX IF NOT EXISTS credential_catalog_skill_search_idx
  ON public.credential_catalog (credential_type, is_active, scope, agency_id, lower(name), id);

-- Preserve legacy caregiver and client skill strings by materializing any name
-- missing from the catalog. Category is deliberately Other instead of guessed.
WITH legacy_names AS (
  SELECT DISTINCT ON (lower(trim(name))) trim(name) AS name
  FROM (
    SELECT unnest(COALESCE(caregiver.skills, '{}'::text[])) AS name
    FROM public.caregiver_members caregiver
    UNION ALL
    SELECT unnest(requirement.skill_codes)
    FROM public.patient_skill_requirements requirement
    UNION ALL
    SELECT unnest(requirement.preferred_skill_codes)
    FROM public.patient_skill_requirements requirement
  ) values_to_preserve
  WHERE trim(name) <> ''
  ORDER BY lower(trim(name)), trim(name)
), other_category AS (
  SELECT value.id
  FROM public.configuration_values value
  JOIN public.configuration_types type ON type.id = value.type_id
  WHERE type.code = 'CAREGIVER_SKILL_CATEGORY' AND value.code = 'other'
  LIMIT 1
)
INSERT INTO public.credential_catalog (
  code, name, credential_type, is_active, display_order, scope, category_id
)
SELECT 'legacy_skill_' || md5(lower(legacy.name)), legacy.name, 'skill', true, 0,
  'system', other_category.id
FROM legacy_names legacy CROSS JOIN other_category
WHERE NOT EXISTS (
  SELECT 1 FROM public.credential_catalog catalog
  WHERE catalog.credential_type = 'skill'
    AND lower(trim(catalog.name)) = lower(legacy.name)
);

WITH other_category AS (
  SELECT value.id
  FROM public.configuration_values value
  JOIN public.configuration_types type ON type.id = value.type_id
  WHERE type.code = 'CAREGIVER_SKILL_CATEGORY' AND value.code = 'other'
  LIMIT 1
)
UPDATE public.credential_catalog catalog
SET category_id = other_category.id
FROM other_category
WHERE catalog.credential_type = 'skill' AND catalog.category_id IS NULL;

CREATE TABLE public.caregiver_skill_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  caregiver_member_id uuid NOT NULL REFERENCES public.caregiver_members(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.credential_catalog(id) ON DELETE RESTRICT,
  verification_status text NOT NULL DEFAULT 'self_reported',
  added_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  verified_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caregiver_skill_assignments_status_check
    CHECK (verification_status IN ('self_reported', 'verified')),
  CONSTRAINT caregiver_skill_assignments_verification_check
    CHECK (
      (verification_status = 'self_reported' AND verified_by_user_id IS NULL AND verified_at IS NULL)
      OR (verification_status = 'verified' AND verified_at IS NOT NULL)
    ),
  CONSTRAINT caregiver_skill_assignments_caregiver_credential_key
    UNIQUE (caregiver_member_id, credential_id)
);

CREATE TABLE public.patient_skill_requirement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES public.credential_catalog(id) ON DELETE RESTRICT,
  requirement_level text NOT NULL,
  added_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_skill_requirement_items_level_check
    CHECK (requirement_level IN ('required', 'preferred')),
  CONSTRAINT patient_skill_requirement_items_patient_credential_key
    UNIQUE (patient_id, credential_id)
);

CREATE INDEX caregiver_skill_assignments_agency_caregiver_idx
  ON public.caregiver_skill_assignments(agency_id, caregiver_member_id, verification_status, credential_id);
CREATE INDEX caregiver_skill_assignments_credential_idx
  ON public.caregiver_skill_assignments(credential_id, caregiver_member_id);
CREATE INDEX patient_skill_requirement_items_patient_level_idx
  ON public.patient_skill_requirement_items(patient_id, requirement_level, credential_id);
CREATE INDEX patient_skill_requirement_items_agency_idx
  ON public.patient_skill_requirement_items(agency_id, patient_id);

INSERT INTO public.caregiver_skill_assignments (
  agency_id, caregiver_member_id, credential_id, verification_status, verified_at
)
SELECT caregiver.agency_id, caregiver.id, catalog.id, 'verified', now()
FROM public.caregiver_members caregiver
CROSS JOIN LATERAL unnest(COALESCE(caregiver.skills, '{}'::text[])) skill_name
JOIN public.credential_catalog catalog
  ON catalog.credential_type = 'skill'
 AND lower(trim(catalog.name)) = lower(trim(skill_name))
WHERE caregiver.agency_id IS NOT NULL AND trim(skill_name) <> ''
ON CONFLICT (caregiver_member_id, credential_id) DO NOTHING;

INSERT INTO public.patient_skill_requirement_items (
  agency_id, patient_id, credential_id, requirement_level
)
SELECT requirement.agency_id, requirement.patient_id, catalog.id, source.level
FROM public.patient_skill_requirements requirement
CROSS JOIN LATERAL (
  SELECT unnest(requirement.skill_codes) AS skill_name, 'required'::text AS level
  UNION ALL
  SELECT unnest(requirement.preferred_skill_codes), 'preferred'::text
) source
JOIN public.credential_catalog catalog
  ON catalog.credential_type = 'skill'
 AND lower(trim(catalog.name)) = lower(trim(source.skill_name))
WHERE trim(source.skill_name) <> ''
ON CONFLICT (patient_id, credential_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.skill_actor_is_active()
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
      AND (
        actor.role IN ('admin', 'expert')
        OR EXISTS (
          SELECT 1 FROM public.user_agency_roles membership
          WHERE membership.user_id = actor.id
            AND membership.role = actor.role
            AND membership.status = 'active'
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.skill_actor_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true AND actor.role = 'admin'
  )
$function$;

CREATE OR REPLACE FUNCTION public.skill_actor_can_manage_agency(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    JOIN public.user_agency_roles membership
      ON membership.user_id = actor.id
     AND membership.agency_id = p_agency_id
     AND membership.role = actor.role
     AND membership.status = 'active'
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true
      AND actor.role IN ('company_owner', 'care_coordinator')
  )
$function$;

CREATE OR REPLACE FUNCTION public.skill_actor_is_agency_owner(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles actor
    JOIN public.user_agency_roles membership
      ON membership.user_id = actor.id
     AND membership.agency_id = p_agency_id
     AND membership.role = 'company_owner'
     AND membership.status = 'active'
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true AND actor.role = 'company_owner'
  )
$function$;

CREATE OR REPLACE FUNCTION public.skill_actor_is_caregiver(
  p_agency_id uuid,
  p_caregiver_member_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.caregiver_members caregiver
    JOIN public.user_profiles actor ON actor.id = caregiver.user_id
    JOIN public.user_agency_roles membership
      ON membership.user_id = actor.id
     AND membership.agency_id = caregiver.agency_id
     AND membership.role = 'staff_member'
     AND membership.status = 'active'
    WHERE actor.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND actor.is_active = true AND actor.role = 'staff_member'
      AND caregiver.id = p_caregiver_member_id
      AND caregiver.agency_id = p_agency_id
      AND caregiver.status = 'active'
  )
$function$;

REVOKE ALL ON FUNCTION public.skill_actor_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skill_actor_is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skill_actor_can_manage_agency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skill_actor_is_agency_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skill_actor_is_caregiver(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skill_actor_is_active() TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.skill_actor_is_platform_admin() TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.skill_actor_can_manage_agency(uuid) TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.skill_actor_is_agency_owner(uuid) TO mycaresight_app;
GRANT EXECUTE ON FUNCTION public.skill_actor_is_caregiver(uuid,uuid) TO mycaresight_app;

ALTER TABLE public.credential_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credential_catalog_active_reference_select ON public.credential_catalog;
DROP POLICY IF EXISTS credential_catalog_visible_select ON public.credential_catalog;
CREATE POLICY credential_catalog_visible_select
  ON public.credential_catalog FOR SELECT TO mycaresight_app
  USING (
    public.skill_actor_is_active()
    AND (
      scope = 'system'
      OR public.skill_actor_is_platform_admin()
      OR (scope = 'agency' AND EXISTS (
        SELECT 1 FROM public.user_agency_roles membership
        WHERE membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND membership.agency_id = credential_catalog.agency_id
          AND membership.status = 'active'
      ))
    )
  );
CREATE POLICY credential_catalog_admin_insert
  ON public.credential_catalog FOR INSERT TO mycaresight_app
  WITH CHECK (
    credential_type = 'skill'
    AND (
      (scope = 'system' AND agency_id IS NULL AND public.skill_actor_is_platform_admin())
      OR (scope = 'agency' AND public.skill_actor_is_agency_owner(agency_id))
    )
  );
CREATE POLICY credential_catalog_admin_update
  ON public.credential_catalog FOR UPDATE TO mycaresight_app
  USING (
    (scope = 'system' AND public.skill_actor_is_platform_admin())
    OR (scope = 'agency' AND public.skill_actor_is_agency_owner(agency_id))
  )
  WITH CHECK (
    credential_type = 'skill'
    AND (
      (scope = 'system' AND agency_id IS NULL AND public.skill_actor_is_platform_admin())
      OR (scope = 'agency' AND public.skill_actor_is_agency_owner(agency_id))
    )
  );

ALTER TABLE public.caregiver_skill_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_skill_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY caregiver_skill_assignments_select
  ON public.caregiver_skill_assignments FOR SELECT TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
    OR public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
  );
CREATE POLICY caregiver_skill_assignments_insert
  ON public.caregiver_skill_assignments FOR INSERT TO mycaresight_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      WHERE caregiver.id = caregiver_member_id AND caregiver.agency_id = caregiver_skill_assignments.agency_id
    )
    AND EXISTS (
      SELECT 1 FROM public.credential_catalog catalog
      WHERE catalog.id = credential_id AND catalog.credential_type = 'skill' AND catalog.is_active
        AND (catalog.scope = 'system' OR catalog.agency_id = caregiver_skill_assignments.agency_id)
    )
    AND (
      public.skill_actor_is_platform_admin()
      OR public.skill_actor_can_manage_agency(agency_id)
      OR (
        public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
        AND verification_status = 'self_reported'
        AND verified_by_user_id IS NULL AND verified_at IS NULL
      )
    )
  );
CREATE POLICY caregiver_skill_assignments_update
  ON public.caregiver_skill_assignments FOR UPDATE TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
    OR public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
  )
  WITH CHECK (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
    OR (
      public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
      AND verification_status = 'self_reported'
      AND verified_by_user_id IS NULL AND verified_at IS NULL
    )
  );
CREATE POLICY caregiver_skill_assignments_delete
  ON public.caregiver_skill_assignments FOR DELETE TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
    OR public.skill_actor_is_caregiver(agency_id, caregiver_member_id)
  );

ALTER TABLE public.patient_skill_requirement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_skill_requirement_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patient_skill_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_skill_requirement_items_manager_select
  ON public.patient_skill_requirement_items FOR SELECT TO mycaresight_app
  USING (
    public.skill_actor_can_manage_agency(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id AND patient.agency_id = patient_skill_requirement_items.agency_id
    )
  );
CREATE POLICY patient_skill_requirement_items_manager_insert
  ON public.patient_skill_requirement_items FOR INSERT TO mycaresight_app
  WITH CHECK (
    public.skill_actor_can_manage_agency(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.patients patient
      WHERE patient.id = patient_id AND patient.agency_id = patient_skill_requirement_items.agency_id
    )
    AND EXISTS (
      SELECT 1 FROM public.credential_catalog catalog
      WHERE catalog.id = credential_id AND catalog.credential_type = 'skill' AND catalog.is_active
        AND (catalog.scope = 'system' OR catalog.agency_id = patient_skill_requirement_items.agency_id)
    )
  );
CREATE POLICY patient_skill_requirement_items_manager_update
  ON public.patient_skill_requirement_items FOR UPDATE TO mycaresight_app
  USING (public.skill_actor_can_manage_agency(agency_id))
  WITH CHECK (public.skill_actor_can_manage_agency(agency_id));
CREATE POLICY patient_skill_requirement_items_manager_delete
  ON public.patient_skill_requirement_items FOR DELETE TO mycaresight_app
  USING (public.skill_actor_can_manage_agency(agency_id));

REVOKE ALL ON public.credential_catalog FROM PUBLIC, mycaresight_app;
GRANT SELECT ON public.credential_catalog TO mycaresight_app;
GRANT INSERT (
  code, name, credential_type, service_type, is_active, display_order,
  scope, agency_id, category_id, created_by_user_id
) ON public.credential_catalog TO mycaresight_app;
GRANT UPDATE (name, service_type, is_active, display_order, category_id, updated_at)
  ON public.credential_catalog TO mycaresight_app;

REVOKE ALL ON public.caregiver_skill_assignments,
  public.patient_skill_requirement_items FROM PUBLIC, mycaresight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caregiver_skill_assignments TO mycaresight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_skill_requirement_items TO mycaresight_app;

DO $jobs_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.caregiver_skill_assignments,
      public.patient_skill_requirement_items FROM mycaresight_jobs;
  END IF;
END
$jobs_access$;

COMMENT ON TABLE public.caregiver_skill_assignments IS
  'Stable caregiver-to-skill assignments; only verified rows satisfy client eligibility.';
COMMENT ON TABLE public.patient_skill_requirement_items IS
  'Stable client required/preferred caregiver skill references used for matching.';
COMMENT ON COLUMN public.credential_catalog.scope IS
  'System skills are global; agency skills are visible only within their owning agency.';

COMMIT;
