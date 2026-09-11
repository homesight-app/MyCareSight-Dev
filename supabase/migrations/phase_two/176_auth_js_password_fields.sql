-- Auth.js v5 migration: add password hash and invite token fields to user_profiles.
-- password_hash: bcrypt hash of the user's password (NULL = user must reset on first login).
-- invite_token / invite_token_expires_at: for admin-initiated password reset / invitation flow.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ;
