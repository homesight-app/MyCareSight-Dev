-- Wraps the multi-step credential change in a single transaction so a
-- partial failure cannot leave a user with an inconsistent role/record state.
CREATE OR REPLACE FUNCTION change_person_credential(
  p_agency_id             uuid,
  p_user_profile_id       uuid,
  p_admin_record_id       uuid,
  p_coordinator_record_id uuid,
  p_to_credential         text,
  p_first_name            text,
  p_last_name             text,
  p_email                 text
)
RETURNS text   -- NULL on success, error message on failure
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
  v_admin_ids uuid[];
BEGIN
  v_full_name := trim(p_first_name || ' ' || p_last_name);

  IF p_to_credential = 'care_coordinator' THEN

    -- Deactivate existing admin record
    IF p_admin_record_id IS NOT NULL THEN
      UPDATE agency_admins
        SET status = 'inactive', updated_at = now()
        WHERE id = p_admin_record_id AND agency_id = p_agency_id;
    END IF;

    -- Remove this user from the agency_admin_ids array
    UPDATE agencies
      SET agency_admin_ids = array_remove(COALESCE(agency_admin_ids, '{}'::uuid[]), p_user_profile_id),
          updated_at = now()
      WHERE id = p_agency_id;

    -- Reactivate existing coordinator record or create one
    IF p_coordinator_record_id IS NOT NULL THEN
      UPDATE care_coordinators
        SET status = 'active', updated_at = now()
        WHERE id = p_coordinator_record_id AND agency_id = p_agency_id;
    ELSE
      INSERT INTO care_coordinators (user_id, agency_id, first_name, last_name, email, status)
        VALUES (p_user_profile_id, p_agency_id, p_first_name, p_last_name, p_email, 'active');
    END IF;

  ELSIF p_to_credential = 'company_owner' THEN

    -- Deactivate existing coordinator record
    IF p_coordinator_record_id IS NOT NULL THEN
      UPDATE care_coordinators
        SET status = 'inactive', updated_at = now()
        WHERE id = p_coordinator_record_id AND agency_id = p_agency_id;
    END IF;

    -- Reactivate existing admin record or create one
    IF p_admin_record_id IS NOT NULL THEN
      UPDATE agency_admins
        SET status = 'active', updated_at = now()
        WHERE id = p_admin_record_id AND agency_id = p_agency_id;
    ELSE
      INSERT INTO agency_admins (user_id, company_owner_id, contact_name, contact_email, status, agency_id)
        VALUES (p_user_profile_id, p_user_profile_id, v_full_name, p_email, 'active', p_agency_id);
    END IF;

    -- Add to agency_admin_ids if not already present
    SELECT COALESCE(agency_admin_ids, '{}'::uuid[]) INTO v_admin_ids
      FROM agencies WHERE id = p_agency_id;

    IF NOT (p_user_profile_id = ANY(v_admin_ids)) THEN
      UPDATE agencies
        SET agency_admin_ids = array_append(v_admin_ids, p_user_profile_id),
            updated_at = now()
        WHERE id = p_agency_id;
    END IF;

  ELSE
    RETURN 'Invalid credential type: ' || p_to_credential;
  END IF;

  -- Update the user's role in user_profiles
  UPDATE user_profiles
    SET role = p_to_credential, updated_at = now()
    WHERE id = p_user_profile_id;

  RETURN NULL;  -- success

EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;
