-- Platform-level billing records (MyCareSight charges to agency clients).
-- Tracks monthly invoices: user license fees + application processing fees.
CREATE TABLE public.billing (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.agency_admins(id),
  billing_month         date NOT NULL,
  user_licenses_count   integer NOT NULL DEFAULT 0,
  user_license_rate     numeric(10,2) NOT NULL DEFAULT 50.00,
  applications_count    integer NOT NULL DEFAULT 0,
  application_rate      numeric(10,2) NOT NULL DEFAULT 500.00,
  total_amount          numeric(10,2) NOT NULL,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;

-- Only admin and expert (platform staff) can read or write billing records.
CREATE POLICY "Platform staff can manage billing"
  ON public.billing
  FOR ALL
  USING (is_platform_staff());
