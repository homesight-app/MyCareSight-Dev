-- Trigger to keep user_profiles.agency_id in sync whenever agency_id changes
-- on any of the three role tables. This covers:
--   • New user creation (INSERT)
--   • Reassignment to a different agency (UPDATE OF agency_id)
-- The IS DISTINCT FROM guard is a no-op when the value hasn't changed.

CREATE OR REPLACE FUNCTION public.sync_user_profile_agency_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET agency_id = NEW.agency_id
  WHERE id = NEW.user_id
    AND (agency_id IS DISTINCT FROM NEW.agency_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agency_admins_sync_profile_agency
  AFTER INSERT OR UPDATE OF agency_id ON public.agency_admins
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_agency_id();

CREATE TRIGGER trg_care_coordinators_sync_profile_agency
  AFTER INSERT OR UPDATE OF agency_id ON public.care_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_agency_id();

CREATE TRIGGER trg_caregiver_members_sync_profile_agency
  AFTER INSERT OR UPDATE OF agency_id ON public.caregiver_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profile_agency_id();
