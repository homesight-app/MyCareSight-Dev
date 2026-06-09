-- Migration 112: Extend agencies table for onboarding + FL regulatory fields
-- Adds fields captured by the FL agency intake form.
-- agency_configurations (overtime, mileage, holidays) is a separate table — not touched here.

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS dba_name            text,
  ADD COLUMN IF NOT EXISTS hours_of_operation  text,
  ADD COLUMN IF NOT EXISTS fax_number          text,
  ADD COLUMN IF NOT EXISTS date_of_formation   date,
  ADD COLUMN IF NOT EXISTS npi                 text,
  ADD COLUMN IF NOT EXISTS onboarding_status   text NOT NULL DEFAULT 'shell',
  ADD COLUMN IF NOT EXISTS state_specific_data jsonb NOT NULL DEFAULT '{}';

-- onboarding_status values: 'shell' | 'link_sent' | 'partial' | 'completed'
-- state_specific_data stores state-specific regulatory fields as JSON, e.g.:
--   FL: { "ahca_region": "Region 5", "is_on_cap": false }
-- physical_state on the agencies row drives which state config to apply.
-- Existing tax_id column = EIN (no rename needed).

-- Backfill onboarding_status for existing agencies that already have data
UPDATE public.agencies
SET onboarding_status = 'completed'
WHERE physical_street_address IS NOT NULL
  AND physical_city IS NOT NULL
  AND physical_state IS NOT NULL
  AND physical_zip_code IS NOT NULL;
