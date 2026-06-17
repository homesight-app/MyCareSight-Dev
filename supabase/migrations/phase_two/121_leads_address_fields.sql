ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contact_address1 text,
  ADD COLUMN IF NOT EXISTS contact_address2 text,
  ADD COLUMN IF NOT EXISTS contact_city     text,
  ADD COLUMN IF NOT EXISTS contact_state    text,
  ADD COLUMN IF NOT EXISTS contact_zip      text;
