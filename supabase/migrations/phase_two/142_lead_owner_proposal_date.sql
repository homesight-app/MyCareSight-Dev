-- Migration 142: Lead Owner + Proposal Sent Date
-- lead_owner_id: staff member who owns the lead and earns commission on close
-- proposal_sent_date: auto-stamped when stage first moves to 'proposal_sent'; also manually editable

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_owner_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_sent_date date;
