ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS primary_contact_first_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_last_name  text;
