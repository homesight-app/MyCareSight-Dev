-- Migration 111: Agency key staff table
-- Regulatory records for agency officers (President, VP, Secretary, Treasurer/CFO,
-- Administrator, Alternate Administrator). Follows the same pattern as caregiver_members
-- and care_coordinators — role-specific extra data alongside the core user_profiles table.
-- Officers without a login: user_profile_id = NULL.
-- Officers with a login: user_profile_id links to their user_profiles row.

CREATE TABLE public.agency_key_staff (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Officer role (regulatory title, not a system access role)
  -- Values: 'president' | 'vice_president' | 'secretary' | 'treasurer_cfo' |
  --         'administrator' | 'alternate_administrator'
  officer_role        text NOT NULL,

  -- Basic contact info (collected on public onboarding form)
  full_legal_name     text,
  telephone           text,
  email               text,

  -- Admin-only fields — never exposed on public onboarding form
  date_of_birth       date,
  ssn_encrypted       text,            -- pgp_sym_encrypt(ssn, current_setting('app.ssn_key'))
  ssn_last4           char(4),         -- last 4 digits stored plain for display reference
  home_address_street text,
  home_address_city   text,
  home_address_state  text,
  home_address_zip    text,
  date_of_hire        date,
  is_licensed         boolean,         -- FL: licensed physician, RN, or nursing home administrator
  license_type        text,            -- 'physician' | 'rn' | 'nursing_home_admin' | 'other'

  -- Optional link to a system login — populated when the officer is created as a user
  user_profile_id     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agency_key_staff_agency_id_idx ON public.agency_key_staff(agency_id);
CREATE INDEX agency_key_staff_user_profile_id_idx ON public.agency_key_staff(user_profile_id);

ALTER TABLE public.agency_key_staff ENABLE ROW LEVEL SECURITY;

-- Platform staff (admin + expert) have full access
CREATE POLICY "key_staff_platform"
  ON public.agency_key_staff
  FOR ALL
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());
