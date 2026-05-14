-- Add mileage billing configuration to patient service contracts.
-- bill_mileage: whether to include mileage reimbursement on client invoices for this contract.
-- mileage_bill_rate_per_mile: custom rate for this contract; NULL = fall back to agency config rate.

ALTER TABLE public.patient_service_contracts
  ADD COLUMN bill_mileage              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mileage_bill_rate_per_mile NUMERIC(6,4);
