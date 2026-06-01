-- 102_patient_addresses.sql
-- Adds multi-address support for care recipients (patients).
-- Each patient can have N addresses; exactly one must be marked is_primary.
-- The primary address is the default for new visits; coordinators can select
-- a different address per visit. The visit address drives caregiver proximity
-- scoring and mileage reimbursement calculation.

-- 1. patient_addresses table
CREATE TABLE IF NOT EXISTS patient_addresses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agency_id      UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  label          TEXT NOT NULL DEFAULT 'Home',
  street_address TEXT NOT NULL,
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  zip_code       TEXT NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce exactly one primary per patient
CREATE UNIQUE INDEX patient_addresses_one_primary
  ON patient_addresses (patient_id)
  WHERE is_primary = true;

-- updated_at auto-maintenance
CREATE OR REPLACE FUNCTION set_patient_addresses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patient_addresses_updated_at
  BEFORE UPDATE ON patient_addresses
  FOR EACH ROW EXECUTE FUNCTION set_patient_addresses_updated_at();

-- 2. Add visit address FK to scheduled_visits
ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS patient_address_id UUID
    REFERENCES patient_addresses(id) ON DELETE SET NULL;

-- 3. RLS
ALTER TABLE patient_addresses ENABLE ROW LEVEL SECURITY;

-- Agency members (company_owner, care_coordinator) can read/write their agency's addresses
CREATE POLICY "agency members can manage patient_addresses"
  ON patient_addresses FOR ALL
  USING (is_agency_member(agency_id))
  WITH CHECK (is_agency_member(agency_id));

-- Platform staff (admin, expert) can read all
CREATE POLICY "platform staff can read patient_addresses"
  ON patient_addresses FOR SELECT
  USING (is_platform_staff());

-- 4. Backfill — migrate each patient's existing address as their primary
INSERT INTO patient_addresses (patient_id, agency_id, label, street_address, city, state, zip_code, is_primary)
SELECT
  p.id,
  p.agency_id,
  'Home',
  p.street_address,
  p.city,
  p.state,
  p.zip_code,
  true
FROM patients p
WHERE p.street_address IS NOT NULL
  AND p.street_address <> ''
  AND NOT EXISTS (
    SELECT 1 FROM patient_addresses pa WHERE pa.patient_id = p.id
  );
