-- Add lifecycle metadata to playbooks so they can fully replace license_types.
-- All columns nullable — existing playbooks are unaffected.
ALTER TABLE public.playbooks
  ADD COLUMN IF NOT EXISTS state                    text,
  ADD COLUMN IF NOT EXISTS cost_min                 numeric,
  ADD COLUMN IF NOT EXISTS cost_max                 numeric,
  ADD COLUMN IF NOT EXISTS cost_display             text,
  ADD COLUMN IF NOT EXISTS service_fee              numeric,
  ADD COLUMN IF NOT EXISTS service_fee_display      text,
  ADD COLUMN IF NOT EXISTS processing_time_min      integer,
  ADD COLUMN IF NOT EXISTS processing_time_max      integer,
  ADD COLUMN IF NOT EXISTS processing_time_display  text,
  ADD COLUMN IF NOT EXISTS renewal_period_years     integer,
  ADD COLUMN IF NOT EXISTS renewal_period_display   text,
  ADD COLUMN IF NOT EXISTS icon_type                text,
  ADD COLUMN IF NOT EXISTS requirements             jsonb;
