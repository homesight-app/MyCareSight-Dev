-- Add service_states column to leads to capture which US states a lead is seeking service in.
-- Stored as a text array to support multiple states per lead.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS service_states text[];
