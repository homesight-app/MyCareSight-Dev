-- Patch for dev databases that already ran the original 166.
-- Prod databases will run clean 166 + this 167 in sequence.

-- 1. Replace the two original RLS policies with the single consolidated one
DROP POLICY IF EXISTS "Agency members can read patient lead details" ON patient_lead_details;
DROP POLICY IF EXISTS "Agency members can manage patient lead details" ON patient_lead_details;

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

-- 2. Add the updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_lead_details_updated_at ON patient_lead_details;

CREATE TRIGGER patient_lead_details_updated_at
  BEFORE UPDATE ON patient_lead_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
