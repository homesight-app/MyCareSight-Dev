-- Align licensing_experts with every other role-specific table by adding
-- a FK to user_profiles instead of auth.users directly.
-- Since user_profiles.id = auth.users.id, the backfill is a direct copy.

ALTER TABLE licensing_experts
  ADD COLUMN IF NOT EXISTS user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Backfill for existing experts (only where a user_profiles row exists)
UPDATE licensing_experts le
  SET user_profile_id = le.user_id
  WHERE EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = le.user_id);

-- Index for cross-role joins on user_profiles.id
CREATE INDEX IF NOT EXISTS idx_licensing_experts_user_profile_id
  ON licensing_experts(user_profile_id);
