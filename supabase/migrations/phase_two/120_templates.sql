CREATE TABLE templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  type          text        NOT NULL CHECK (type IN ('document', 'email')),
  category      text        NOT NULL CHECK (category IN ('invoice', 'contract', 'hr', 'communication', 'onboarding', 'other')),
  description   text,
  subject       text,
  content       text        NOT NULL DEFAULT '',
  variables_used text[]     DEFAULT '{}',
  is_global     boolean     NOT NULL DEFAULT false,
  agency_id     uuid        REFERENCES agencies(id) ON DELETE CASCADE,
  created_by    uuid        REFERENCES user_profiles(id),
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff full access" ON templates
  FOR ALL USING (is_platform_staff());

CREATE POLICY "agency read" ON templates
  FOR SELECT USING (
    is_global = true
    OR is_agency_member(agency_id)
  );

CREATE POLICY "agency owner write" ON templates
  FOR INSERT WITH CHECK (
    is_agency_member(agency_id) AND is_global = false
  );

CREATE POLICY "agency owner update" ON templates
  FOR UPDATE USING (
    is_agency_member(agency_id) AND is_global = false
  );

CREATE POLICY "agency owner delete" ON templates
  FOR DELETE USING (
    is_agency_member(agency_id) AND is_global = false
  );
