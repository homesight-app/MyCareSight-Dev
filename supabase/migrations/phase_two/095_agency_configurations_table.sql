-- New table for agency-specific payroll configuration.
-- Stores work week, overtime rules, weekend rates, and holidays.
-- Used by reports to split caregiver hours/pay into REG and OT.

CREATE TABLE public.agency_configurations (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id                 UUID NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
  work_week_start           INTEGER NOT NULL DEFAULT 0,      -- 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  allow_weekends            BOOLEAN NOT NULL DEFAULT true,
  weekend_rate_multiplier   NUMERIC(4,2),                    -- NULL = no premium; 1.25 = 25% more
  full_time_hours_per_week  NUMERIC(5,2) NOT NULL DEFAULT 40,
  overtime_threshold_weekly NUMERIC(5,2) NOT NULL DEFAULT 40, -- OT after X hrs/week
  overtime_threshold_daily  NUMERIC(5,2),                    -- OT after X hrs/day (optional; e.g. 8)
  overtime_rate_multiplier  NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  holidays                  JSONB NOT NULL DEFAULT '[]',
  -- holidays: [{"name":"Christmas","date":"2026-12-25","rate_multiplier":1.5}, ...]
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agency_configurations_agency_id ON public.agency_configurations(agency_id);

ALTER TABLE public.agency_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view their configuration"
  ON public.agency_configurations FOR SELECT
  USING (public.is_agency_member(agency_id));

CREATE POLICY "Agency members can insert their configuration"
  ON public.agency_configurations FOR INSERT
  WITH CHECK (public.is_agency_member(agency_id));

CREATE POLICY "Agency members can update their configuration"
  ON public.agency_configurations FOR UPDATE
  USING (public.is_agency_member(agency_id));

CREATE POLICY "Platform staff can manage all agency configurations"
  ON public.agency_configurations FOR ALL
  USING (public.is_platform_staff());
