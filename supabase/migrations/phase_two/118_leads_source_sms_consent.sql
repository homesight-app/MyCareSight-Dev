-- Add source tracking and SMS consent to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_consent boolean;
