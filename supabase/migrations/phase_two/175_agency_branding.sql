-- Platform-level key/value settings
-- category column supports future growth (notifications, billing, etc.)
-- updated_by supports audit trail ("who changed the logo on March 3rd?")
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT        NOT NULL,
  category   TEXT        NOT NULL DEFAULT 'branding',
  value      TEXT,
  updated_by UUID        REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category, key)
);

-- Seed platform branding defaults (idempotent)
INSERT INTO system_settings (category, key, value)
VALUES
  ('branding', 'platform_logo_path',      NULL),
  ('branding', 'platform_logo_icon_path', NULL),
  ('branding', 'platform_primary_color',  '#4F66E8'),
  ('branding', 'platform_sidebar_color',  '#0F172A')
ON CONFLICT (category, key) DO NOTHING;

-- Agency branding columns (no slug — pre-auth login branding deferred)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS logo_path       TEXT,
  ADD COLUMN IF NOT EXISTS logo_icon_path  TEXT,
  ADD COLUMN IF NOT EXISTS primary_color   TEXT,
  ADD COLUMN IF NOT EXISTS sidebar_color   TEXT;

-- RLS for system_settings
-- Public read (branding is intentionally public — logos and colors are not PHI)
-- Admin-only write
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_read"        ON system_settings;
DROP POLICY IF EXISTS "system_settings_admin_write" ON system_settings;

CREATE POLICY "system_settings_read"
  ON system_settings FOR SELECT
  USING (true);

CREATE POLICY "system_settings_admin_write"
  ON system_settings FOR ALL
  USING (is_platform_staff());

-- No storage RLS changes needed:
-- agency-public bucket is set to Public in Supabase dashboard
-- agency-documents bucket remains fully private and unchanged
