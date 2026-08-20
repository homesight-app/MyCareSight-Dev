-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 163 — Phase B: Update RLS functions to use user_agency_roles
--
-- PREREQUISITE: Migration 162 must be applied and verified first.
-- Before running this, confirm:
--   SELECT COUNT(*) FROM user_agency_roles;
-- matches the expected count from the three source tables.
--
-- Changes two SECURITY DEFINER functions whose bodies are called by the
-- majority of existing RLS policies. Because they are SECURITY DEFINER
-- functions, updating their bodies is transparent — no policies need to
-- be rewritten.
--
-- Behaviour changes after this migration:
--   1. hs_is_agency_admin() reads user_agency_roles instead of agency_admins
--      directly — functionally identical after the backfill, faster via index.
--   2. is_platform_staff() now also requires is_active = true — any admin/
--      expert user with is_active = false is denied at the RLS layer.
--      Since no users are currently deactivated, there is no immediate impact.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. hs_is_agency_admin() — delegate to has_agency_role() ──────────────

CREATE OR REPLACE FUNCTION public.hs_is_agency_admin(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_agency_role(p_agency_id, ARRAY['company_owner']);
$$;


-- ── 2. is_platform_staff() — now also enforces is_active ─────────────────

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id        = auth.uid()
      AND role      IN ('admin', 'expert')
      AND is_active = true
  );
$$;
