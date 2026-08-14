-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE playbook_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE playbook_subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        NOT NULL REFERENCES playbook_categories(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, name)
);

-- ── 2. FK columns on existing tables ──────────────────────────────────────────

ALTER TABLE playbooks
  ADD COLUMN category_id    UUID REFERENCES playbook_categories(id)    ON DELETE SET NULL,
  ADD COLUMN subcategory_id UUID REFERENCES playbook_subcategories(id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN category_id    UUID REFERENCES playbook_categories(id)    ON DELETE SET NULL,
  ADD COLUMN subcategory_id UUID REFERENCES playbook_subcategories(id) ON DELETE SET NULL;

ALTER TABLE licenses
  ADD COLUMN category_id    UUID REFERENCES playbook_categories(id)    ON DELETE SET NULL,
  ADD COLUMN subcategory_id UUID REFERENCES playbook_subcategories(id) ON DELETE SET NULL;

-- ── 3. Seed from existing certification_category enum ─────────────────────────

INSERT INTO playbook_categories (name, sort_order) VALUES
  ('State License',  1),
  ('Medicare',       2),
  ('Medicaid',       3),
  ('Accreditation',  4),
  ('Bond',           5),
  ('Insurance',      6),
  ('Other',          7);

-- ── 4. Migrate existing licenses rows ─────────────────────────────────────────
-- Maps e.g. 'state_license' → 'State License', 'medicare' → 'Medicare', etc.

UPDATE licenses l
SET category_id = pc.id
FROM playbook_categories pc
WHERE l.certification_category IS NOT NULL
  AND lower(pc.name) = lower(replace(l.certification_category, '_', ' '));

-- ── 5. Drop replaced column ───────────────────────────────────────────────────

ALTER TABLE licenses DROP COLUMN certification_category;

-- ── 6. Performance indices ────────────────────────────────────────────────────

CREATE INDEX idx_playbooks_category        ON playbooks(category_id);
CREATE INDEX idx_applications_category     ON applications(category_id);
CREATE INDEX idx_licenses_category         ON licenses(category_id);
CREATE INDEX idx_playbook_subcats_category ON playbook_subcategories(category_id);

-- ── 7. RLS ────────────────────────────────────────────────────────────────────
-- SELECT: any authenticated user (all roles need to read for dropdowns)
-- INSERT/UPDATE/DELETE: platform staff only (admin + expert)

ALTER TABLE playbook_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select_authenticated"  ON playbook_categories    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pc_write_platform_staff"  ON playbook_categories    FOR ALL    USING (is_platform_staff());

CREATE POLICY "psc_select_authenticated" ON playbook_subcategories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "psc_write_platform_staff" ON playbook_subcategories FOR ALL    USING (is_platform_staff());
