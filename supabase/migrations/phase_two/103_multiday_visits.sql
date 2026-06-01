-- Multi-day visits: a single scheduled_visit row spans from visit_date (start day)
-- to scheduled_end_date (last day). NULL means same-day (existing behavior preserved).
ALTER TABLE scheduled_visits
  ADD COLUMN IF NOT EXISTS scheduled_end_date DATE;

-- For recurring series: each instance ends this many calendar days after its start date.
-- 0 = same-day (default, existing behavior preserved).
ALTER TABLE visit_series
  ADD COLUMN IF NOT EXISTS end_day_offset SMALLINT NOT NULL DEFAULT 0;
