-- Add demographic and POC contact fields to patient_lead_details.
-- All new columns are nullable — lead capture is progressive.
ALTER TABLE patient_lead_details
  ADD COLUMN IF NOT EXISTS gender      text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS poc_email   text;

-- Make date_of_birth optional on the patients table.
-- DOB can be captured at any point; it is no longer required at patient creation.
ALTER TABLE patients
  ALTER COLUMN date_of_birth DROP NOT NULL;
