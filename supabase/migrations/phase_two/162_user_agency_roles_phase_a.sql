-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 162 — Phase A: user_agency_roles (purely additive)
--
-- Creates the single authoritative permission table that answers
-- "what can this user do at agency X?" without querying three domain tables.
-- Domain tables (agency_admins, care_coordinators, caregiver_members) are
-- unchanged — they continue to store profile/contact data. This table holds
-- only the permission-relevant columns.
--
-- Nothing in Phase A changes existing behaviour. All existing RLS functions
-- and application code continue to work as before.
--
-- VERIFY before running Phase B (163):
--   SELECT COUNT(*) FROM user_agency_roles;
--   -- Should match the combined unique (user_id, agency_id, role) rows from
--   -- agency_admins + care_coordinators + caregiver_members where user_id IS NOT NULL.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Add is_active and last_login_at to user_profiles ──────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Mark all existing users as active (NOT NULL DEFAULT true already does this,
-- but being explicit protects against any edge case in older Postgres versions).
UPDATE public.user_profiles SET is_active = true WHERE is_active IS NULL;


-- ── 2. Remove one-agency-per-coordinator constraint ───────────────────────

ALTER TABLE public.care_coordinators
  DROP CONSTRAINT IF EXISTS care_coordinators_user_id_key;


-- ── 3. Create user_agency_roles table ────────────────────────────────────

CREATE TABLE public.user_agency_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  agency_id  uuid        NOT NULL REFERENCES public.agencies(id)      ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('company_owner', 'care_coordinator', 'staff_member')),
  status     text        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'inactive', 'invited', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agency_id, role)
);

CREATE INDEX user_agency_roles_user_id_idx   ON public.user_agency_roles (user_id);
CREATE INDEX user_agency_roles_agency_id_idx ON public.user_agency_roles (agency_id);


-- ── 4. Backfill from existing domain tables ───────────────────────────────

-- agency_admins → company_owner
INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
SELECT
  aa.user_id,
  aa.agency_id,
  'company_owner',
  CASE
    WHEN aa.status IN ('active', 'inactive', 'invited', 'pending') THEN aa.status
    ELSE 'active'
  END
FROM public.agency_admins aa
WHERE aa.user_id IS NOT NULL
ON CONFLICT (user_id, agency_id, role) DO UPDATE
  SET status = EXCLUDED.status, updated_at = now();

-- care_coordinators → care_coordinator
INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
SELECT
  cc.user_id,
  cc.agency_id,
  'care_coordinator',
  CASE
    WHEN cc.status IN ('active', 'inactive', 'invited', 'pending') THEN cc.status
    ELSE 'active'
  END
FROM public.care_coordinators cc
WHERE cc.user_id IS NOT NULL
ON CONFLICT (user_id, agency_id, role) DO UPDATE
  SET status = EXCLUDED.status, updated_at = now();

-- caregiver_members → staff_member
INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
SELECT
  cm.user_id,
  cm.agency_id,
  'staff_member',
  CASE
    WHEN cm.status IN ('active', 'inactive', 'invited', 'pending') THEN cm.status
    ELSE 'active'
  END
FROM public.caregiver_members cm
WHERE cm.user_id IS NOT NULL
ON CONFLICT (user_id, agency_id, role) DO UPDATE
  SET status = EXCLUDED.status, updated_at = now();


-- ── 5. Trigger function to keep user_agency_roles in sync ────────────────

CREATE OR REPLACE FUNCTION public.sync_user_agency_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  IF    TG_TABLE_NAME = 'agency_admins'     THEN v_role := 'company_owner';
  ELSIF TG_TABLE_NAME = 'care_coordinators' THEN v_role := 'care_coordinator';
  ELSIF TG_TABLE_NAME = 'caregiver_members' THEN v_role := 'staff_member';
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    -- Normalise status to a valid enum value
    v_status := CASE
      WHEN NEW.status IN ('active', 'inactive', 'invited', 'pending') THEN NEW.status
      ELSE 'active'
    END;

    INSERT INTO public.user_agency_roles (user_id, agency_id, role, status)
    VALUES (NEW.user_id, NEW.agency_id, v_role, v_status)
    ON CONFLICT (user_id, agency_id, role)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER agency_admins_sync_role
  AFTER INSERT OR UPDATE ON public.agency_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

CREATE TRIGGER care_coordinators_sync_role
  AFTER INSERT OR UPDATE ON public.care_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();

CREATE TRIGGER caregiver_members_sync_role
  AFTER INSERT OR UPDATE ON public.caregiver_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_agency_role();


-- ── 6. has_agency_role() — new helper (nothing calls it yet) ─────────────
--
-- Checks user_agency_roles AND is_active in a single indexed query.
-- hs_is_agency_admin() will delegate to this in Phase B (migration 163).

CREATE OR REPLACE FUNCTION public.has_agency_role(p_agency_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.user_agency_roles
      WHERE agency_id = p_agency_id
        AND user_id   = auth.uid()
        AND role      = ANY(p_roles)
        AND status    IN ('active', 'invited', 'pending')
    );
$$;


-- ── 7. RLS on user_agency_roles ───────────────────────────────────────────

ALTER TABLE public.user_agency_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own role rows; platform staff can see all
CREATE POLICY "user_agency_roles_select"
  ON public.user_agency_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_platform_staff());

-- Only platform staff can directly modify role rows.
-- Normal writes go through the domain tables (triggers handle the sync).
CREATE POLICY "user_agency_roles_platform_staff"
  ON public.user_agency_roles
  FOR ALL
  TO authenticated
  USING (is_platform_staff())
  WITH CHECK (is_platform_staff());
