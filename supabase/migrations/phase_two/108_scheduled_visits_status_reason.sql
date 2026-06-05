-- Add a dedicated column to capture why a visit was marked missed, cancelled, or on hold.
-- Separate from `notes` (general visit notes) so it can be indexed and queried independently.
ALTER TABLE public.scheduled_visits
  ADD COLUMN IF NOT EXISTS status_reason text;
