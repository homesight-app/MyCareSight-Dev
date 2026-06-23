-- Migration 122: Add legal entity details and licensed office address to agencies
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS legal_entity_name        text,
  ADD COLUMN IF NOT EXISTS entity_type              text,
  ADD COLUMN IF NOT EXISTS state_of_incorporation   text,
  ADD COLUMN IF NOT EXISTS date_of_incorporation    date,
  ADD COLUMN IF NOT EXISTS licensed_office_street   text,
  ADD COLUMN IF NOT EXISTS licensed_office_city     text,
  ADD COLUMN IF NOT EXISTS licensed_office_state    text,
  ADD COLUMN IF NOT EXISTS licensed_office_zip      text,
  ADD COLUMN IF NOT EXISTS licensed_same_as_physical boolean NOT NULL DEFAULT false;
