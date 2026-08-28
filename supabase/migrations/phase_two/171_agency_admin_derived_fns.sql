-- DB functions that derive agency admin IDs from the agency_admins table
-- instead of reading the denormalized agencies.agency_admin_ids array.
-- These functions are the source of truth; the array is kept for backward
-- compatibility until all read sites are migrated and writes can be removed.

-- Returns agency_admins.id (PK) values for an agency's active admins.
CREATE OR REPLACE FUNCTION get_agency_admin_record_ids(p_agency_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(SELECT id FROM agency_admins WHERE agency_id = p_agency_id AND status = 'active'),
    '{}'::uuid[]
  );
$$;

-- Returns user_id (= user_profiles.id) values for an agency's active admins.
CREATE OR REPLACE FUNCTION get_agency_admin_profile_ids(p_agency_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT user_id FROM agency_admins
      WHERE agency_id = p_agency_id AND status = 'active' AND user_id IS NOT NULL
    ),
    '{}'::uuid[]
  );
$$;
