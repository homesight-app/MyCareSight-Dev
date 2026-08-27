CREATE TABLE patient_lead_details (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 uuid NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,

  -- Secondary contact (family/representative)
  poc_name                text,
  poc_phone               text,
  poc_relationship        text,

  -- Care & Medical (PHI)
  reason_for_care         text,
  mobility_status         text,
  cognitive_status        text,
  medical_conditions      text,

  -- Logistics
  start_date              date,
  schedule_type           text,
  living_situation        text,

  -- Financial & Insurance (PHI)
  payment_method          text,
  insurance_carrier       text,
  insurance_policy_number text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER patient_lead_details_updated_at
  BEFORE UPDATE ON patient_lead_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE patient_lead_details ENABLE ROW LEVEL SECURITY;

-- Agency members can read and manage their own patient lead details only.
-- Platform staff (admin/expert) are intentionally excluded per HIPAA Minimum Necessary (§ 164.514(d)).
CREATE POLICY "Agency members can manage patient lead details"
  ON patient_lead_details FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_id
        AND l.lead_type = 'patient'
        AND is_agency_member(l.agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_id
        AND l.lead_type = 'patient'
        AND is_agency_member(l.agency_id)
    )
  );
