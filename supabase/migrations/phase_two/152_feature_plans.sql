-- Migration 152: Feature Plans — agency access control
-- ─────────────────────────────────────────────────────

-- 1. Plans table
CREATE TABLE IF NOT EXISTS feature_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  description text,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff full access on feature_plans"
  ON feature_plans FOR ALL
  USING (is_platform_staff());

CREATE POLICY "authenticated users can read feature_plans"
  ON feature_plans FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Plan features (feature key per plan)
CREATE TABLE IF NOT EXISTS plan_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES feature_plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  UNIQUE (plan_id, feature_key)
);

ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff full access on plan_features"
  ON plan_features FOR ALL
  USING (is_platform_staff());

CREATE POLICY "authenticated users can read plan_features"
  ON plan_features FOR SELECT
  USING (auth.role() = 'authenticated');

-- 3. Assign plan to agency (null = unrestricted, all features accessible)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES feature_plans(id) ON DELETE SET NULL;
