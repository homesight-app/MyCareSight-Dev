-- Add mileage reimbursement policy to agency_configurations.
-- Agencies can opt in, set an effective date, and define a rate per mile.

ALTER TABLE public.agency_configurations
  ADD COLUMN mileage_reimbursement_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mileage_reimbursement_start_date DATE,        -- policy effective date (nullable)
  ADD COLUMN mileage_rate_per_mile            NUMERIC(6,4); -- e.g. 0.6700 = $0.67/mile (nullable)

-- Add mileage per visit to scheduled_visits.
-- Entered by admin in Time & Billing; used by Payroll Report for reimbursement calculation.

ALTER TABLE public.scheduled_visits
  ADD COLUMN mileage_miles NUMERIC(6,2);   -- miles driven for this visit (nullable = not recorded)
