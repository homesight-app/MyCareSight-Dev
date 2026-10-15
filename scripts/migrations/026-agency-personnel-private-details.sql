-- 026: Add tenant-scoped private personnel details for agency users.
-- Apply after 024. SSNs are encrypted by the application before storage;
-- the database never receives plaintext SSNs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '026 must not run against Supabase';
  END IF;
  IF to_regclass('public.agencies') IS NULL
     OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.agency_key_staff') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '026 requires the Neon agency, identity, membership, and audit tables';
  END IF;
  IF to_regprocedure('public.skill_actor_is_platform_admin()') IS NULL
     OR to_regprocedure('public.skill_actor_can_manage_agency(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Run migration 024 before migration 026';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '026 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

-- Existing onboarding/key-staff SSNs use the same application encryption
-- boundary. Mark legacy ciphertext so it can be rotated after deployment.
ALTER TABLE public.agency_key_staff
  ADD COLUMN IF NOT EXISTS ssn_key_id text;

UPDATE public.agency_key_staff
SET ssn_key_id = 'legacy'
WHERE ssn_encrypted IS NOT NULL AND ssn_key_id IS NULL;

DO $key_staff_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agency_key_staff'::regclass
      AND conname = 'agency_key_staff_ssn_metadata_check'
  ) THEN
    ALTER TABLE public.agency_key_staff
      ADD CONSTRAINT agency_key_staff_ssn_metadata_check CHECK (
        (ssn_encrypted IS NULL AND ssn_last4 IS NULL AND ssn_key_id IS NULL)
        OR (
          ssn_encrypted IS NOT NULL
          AND ssn_last4 ~ '^[0-9]{4}$'
          AND ssn_key_id ~ '^[a-zA-Z0-9_-]{1,128}$'
        )
      );
  END IF;
END
$key_staff_constraint$;

CREATE TABLE public.agency_personnel_private (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  birth_date date,
  hire_date date,
  ssn_encrypted text,
  ssn_last4 char(4),
  ssn_key_id text,
  home_address_street text,
  home_address_city text,
  home_address_state text,
  home_address_zip text,
  created_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_personnel_private_agency_user_key UNIQUE (agency_id, user_id),
  CONSTRAINT agency_personnel_private_ssn_check CHECK (
    (ssn_encrypted IS NULL AND ssn_last4 IS NULL AND ssn_key_id IS NULL)
    OR (
      ssn_encrypted IS NOT NULL
      AND ssn_last4 ~ '^[0-9]{4}$'
      AND ssn_key_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    )
  ),
  CONSTRAINT agency_personnel_private_state_check CHECK (
    home_address_state IS NULL OR home_address_state ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT agency_personnel_private_zip_check CHECK (
    home_address_zip IS NULL OR home_address_zip ~ '^[0-9]{5}(-[0-9]{4})?$'
  )
);

CREATE INDEX agency_personnel_private_user_idx
  ON public.agency_personnel_private(user_id, agency_id);

-- A care coordinator may maintain employment dates and addresses, but only an
-- agency owner or platform administrator may change DOB or SSN fields. Enforce
-- this below the application layer because every server request uses the same
-- restricted PostgreSQL role.
CREATE OR REPLACE FUNCTION public.protect_personnel_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF public.skill_actor_is_platform_admin()
     OR public.skill_actor_is_agency_owner(NEW.agency_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.birth_date IS NOT NULL
       OR NEW.ssn_encrypted IS NOT NULL
       OR NEW.ssn_last4 IS NOT NULL
       OR NEW.ssn_key_id IS NOT NULL THEN
      RAISE EXCEPTION 'Only an agency owner or platform administrator may set restricted personnel fields'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.birth_date IS DISTINCT FROM OLD.birth_date
     OR NEW.ssn_encrypted IS DISTINCT FROM OLD.ssn_encrypted
     OR NEW.ssn_last4 IS DISTINCT FROM OLD.ssn_last4
     OR NEW.ssn_key_id IS DISTINCT FROM OLD.ssn_key_id THEN
    RAISE EXCEPTION 'Only an agency owner or platform administrator may change restricted personnel fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_personnel_sensitive_fields() FROM PUBLIC;

-- Consolidate any existing credentialed key-staff private details into the
-- normalized record. Legacy ciphertext remains readable until it is replaced
-- or rotated through the application encryption service.
INSERT INTO public.agency_personnel_private (
  agency_id, user_id, birth_date, hire_date, ssn_encrypted, ssn_last4,
  ssn_key_id, home_address_street, home_address_city,
  home_address_state, home_address_zip
)
SELECT DISTINCT ON (staff.agency_id, staff.user_profile_id)
  staff.agency_id,
  staff.user_profile_id,
  staff.date_of_birth,
  staff.date_of_hire,
  staff.ssn_encrypted,
  staff.ssn_last4,
  staff.ssn_key_id,
  staff.home_address_street,
  staff.home_address_city,
  CASE
    WHEN upper(trim(staff.home_address_state)) ~ '^[A-Z]{2}$'
      THEN upper(trim(staff.home_address_state))
    ELSE NULL
  END,
  CASE
    WHEN trim(staff.home_address_zip) ~ '^[0-9]{5}(-[0-9]{4})?$'
      THEN trim(staff.home_address_zip)
    ELSE NULL
  END
FROM public.agency_key_staff staff
JOIN public.user_profiles profile
  ON profile.id = staff.user_profile_id
 AND profile.agency_id = staff.agency_id
 AND profile.role IN ('company_owner', 'care_coordinator', 'staff_member')
WHERE staff.user_profile_id IS NOT NULL
  AND staff.status = 'active'
ORDER BY staff.agency_id, staff.user_profile_id, staff.updated_at DESC, staff.id
ON CONFLICT (agency_id, user_id) DO NOTHING;

CREATE TRIGGER protect_personnel_sensitive_fields_trigger
  BEFORE INSERT OR UPDATE ON public.agency_personnel_private
  FOR EACH ROW EXECUTE FUNCTION public.protect_personnel_sensitive_fields();

ALTER TABLE public.agency_personnel_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_personnel_private FORCE ROW LEVEL SECURITY;

CREATE POLICY agency_personnel_private_manager_select
  ON public.agency_personnel_private FOR SELECT TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
  );

CREATE POLICY agency_personnel_private_manager_insert
  ON public.agency_personnel_private FOR INSERT TO mycaresight_app
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND (
      public.skill_actor_is_platform_admin()
      OR public.skill_actor_is_agency_owner(agency_id)
      OR (
        birth_date IS NULL
        AND ssn_encrypted IS NULL
        AND ssn_last4 IS NULL
        AND ssn_key_id IS NULL
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = user_id
        AND profile.agency_id = agency_personnel_private.agency_id
        AND profile.role IN ('company_owner', 'care_coordinator', 'staff_member')
    )
  );

CREATE POLICY agency_personnel_private_manager_update
  ON public.agency_personnel_private FOR UPDATE TO mycaresight_app
  USING (
    public.skill_actor_is_platform_admin()
    OR public.skill_actor_can_manage_agency(agency_id)
  )
  WITH CHECK (
    (public.skill_actor_is_platform_admin() OR public.skill_actor_can_manage_agency(agency_id))
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = user_id
        AND profile.agency_id = agency_personnel_private.agency_id
        AND profile.role IN ('company_owner', 'care_coordinator', 'staff_member')
    )
  );

REVOKE ALL ON public.agency_personnel_private FROM PUBLIC, mycaresight_app;
GRANT SELECT ON public.agency_personnel_private TO mycaresight_app;
GRANT INSERT (
  agency_id, user_id, birth_date, hire_date, ssn_encrypted, ssn_last4,
  ssn_key_id, home_address_street, home_address_city,
  home_address_state, home_address_zip, created_by_user_id
) ON public.agency_personnel_private TO mycaresight_app;
GRANT UPDATE (
  birth_date, hire_date, ssn_encrypted, ssn_last4, ssn_key_id,
  home_address_street, home_address_city, home_address_state,
  home_address_zip, updated_at
) ON public.agency_personnel_private TO mycaresight_app;

DO $jobs_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.agency_personnel_private FROM mycaresight_jobs;
  END IF;
END
$jobs_access$;

COMMENT ON TABLE public.agency_personnel_private IS
  'Restricted agency employment and personal details. SSNs are application-encrypted before storage.';
COMMENT ON COLUMN public.agency_personnel_private.ssn_encrypted IS
  'Versioned A256GCM envelope containing algorithm, key ID, nonce, tag, and ciphertext. Plaintext SSNs must never be stored in PostgreSQL.';
COMMENT ON COLUMN public.agency_personnel_private.ssn_last4 IS
  'Masked-display suffix; never sufficient to reconstruct the SSN.';

COMMIT;
