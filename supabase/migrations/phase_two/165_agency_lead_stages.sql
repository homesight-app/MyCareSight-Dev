CREATE TABLE agency_lead_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  key          text NOT NULL,
  label        text NOT NULL,
  color        text NOT NULL DEFAULT 'bg-gray-100 text-gray-600',
  sort_order   integer NOT NULL DEFAULT 0,
  is_entry     boolean NOT NULL DEFAULT false,
  is_won       boolean NOT NULL DEFAULT false,
  is_lost      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, key)
);

-- Enforce exactly one entry/won/lost stage per agency
CREATE UNIQUE INDEX agency_lead_stages_entry ON agency_lead_stages (agency_id) WHERE is_entry;
CREATE UNIQUE INDEX agency_lead_stages_won   ON agency_lead_stages (agency_id) WHERE is_won;
CREATE UNIQUE INDEX agency_lead_stages_lost  ON agency_lead_stages (agency_id) WHERE is_lost;

ALTER TABLE agency_lead_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read their stages"
  ON agency_lead_stages FOR SELECT
  USING (is_agency_member(agency_id));

CREATE POLICY "Agency owners can manage stages"
  ON agency_lead_stages FOR ALL
  USING (
    is_agency_member(agency_id)
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'company_owner'
  );

-- Seed default stages for all existing agencies that have patient leads
INSERT INTO agency_lead_stages (agency_id, key, label, color, sort_order, is_entry, is_won, is_lost)
SELECT DISTINCT l.agency_id, v.key, v.label, v.color, v.sort_order, v.is_entry, v.is_won, v.is_lost
FROM leads l
CROSS JOIN (VALUES
  ('new',         'New',           'bg-gray-100 text-gray-600',      0, true,  false, false),
  ('contacted',   'Contacted',     'bg-blue-100 text-blue-700',     10, false, false, false),
  ('quoted',      'Quoted',        'bg-indigo-100 text-indigo-700', 20, false, false, false),
  ('closed_won',  'Closed - Won',  'bg-green-100 text-green-700',   90, false, true,  false),
  ('closed_lost', 'Closed - Lost', 'bg-red-100 text-red-600',       91, false, false, true)
) AS v(key, label, color, sort_order, is_entry, is_won, is_lost)
WHERE l.lead_type = 'patient' AND l.agency_id IS NOT NULL
ON CONFLICT (agency_id, key) DO NOTHING;
