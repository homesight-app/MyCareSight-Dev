-- Migration 113: Add missing agency contact/profile fields from FL intake form
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS phone_number             text,
  ADD COLUMN IF NOT EXISTS email                    text,
  ADD COLUMN IF NOT EXISTS region_service_area      text,
  ADD COLUMN IF NOT EXISTS is_on_call               boolean,
  ADD COLUMN IF NOT EXISTS previously_licensed      boolean,
  ADD COLUMN IF NOT EXISTS prev_license_closed_date date;

-- phone_number: "Agency Telephone Number" on FL HHA form
-- email: "Agency Email address" on FL HHA form
-- region_service_area: "Region/Service Area" free-text geographic service area
-- is_on_call: "Is the Agency on Call?" Yes/No
-- previously_licensed: "Has the agency been licensed previously?"
-- prev_license_closed_date: "Expired/Closed Date" (if previously_licensed = true)
