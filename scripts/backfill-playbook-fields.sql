-- Backfill playbook fields from license_requirements + license_types
-- Run this in the Supabase SQL editor (project dashboard → SQL Editor).
--
-- What it does: for every playbook that has a license_requirement_id,
-- it copies state + all display fields from the matching license_type row.
-- Existing manually-edited values are OVERWRITTEN — run only for testing/backfill.

UPDATE playbooks p
SET
  state                   = lr.state,
  description             = lt.description,
  cost_min                = lt.cost_min,
  cost_max                = lt.cost_max,
  cost_display            = lt.cost_display,
  service_fee             = lt.service_fee,
  service_fee_display     = lt.service_fee_display,
  processing_time_min     = lt.processing_time_min,
  processing_time_max     = lt.processing_time_max,
  processing_time_display = lt.processing_time_display,
  renewal_period_years    = lt.renewal_period_years,
  renewal_period_display  = lt.renewal_period_display,
  icon_type               = lt.icon_type,
  requirements            = lt.requirements,
  updated_at              = NOW()
FROM license_requirements lr
JOIN license_types lt ON lt.name = lr.license_type
WHERE p.license_requirement_id = lr.id;

-- Preview what was updated:
SELECT
  p.id,
  p.name,
  p.state,
  p.cost_display,
  p.service_fee_display,
  p.processing_time_display,
  p.renewal_period_display,
  p.icon_type
FROM playbooks p
WHERE p.license_requirement_id IS NOT NULL
ORDER BY p.name;
