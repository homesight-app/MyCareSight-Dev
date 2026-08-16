-- Migration 156: Generic Configuration Values Framework
-- Replaces playbook_categories + playbook_subcategories with two reusable tables:
--   configuration_types  — one row per dropdown type (e.g. PLAYBOOK_CATEGORY)
--   configuration_values — all values; parent_id enables cascading hierarchies
--
-- FK columns on playbooks/applications/licenses keep the same names (category_id,
-- subcategory_id) but are re-pointed at configuration_values(id).

BEGIN;

-- ── 1. Create configuration_types ────────────────────────────────────────────

CREATE TABLE configuration_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT        NOT NULL UNIQUE,
  name                TEXT        NOT NULL,
  description         TEXT,
  supports_hierarchy  BOOLEAN     NOT NULL DEFAULT false,
  is_admin_manageable BOOLEAN     NOT NULL DEFAULT true,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Create configuration_values ────────────────────────────────────────────

CREATE TABLE configuration_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id     UUID        NOT NULL REFERENCES configuration_types(id) ON DELETE RESTRICT,
  parent_id   UUID        REFERENCES configuration_values(id) ON DELETE RESTRICT,
  code        TEXT,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness: use partial indices because standard UNIQUE treats NULL != NULL,
-- which would allow duplicate top-level names under the same type.
CREATE UNIQUE INDEX idx_config_values_unique_root
  ON configuration_values(type_id, name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX idx_config_values_unique_child
  ON configuration_values(type_id, parent_id, name)
  WHERE parent_id IS NOT NULL;

-- Stable code is unique per type when set
CREATE UNIQUE INDEX idx_config_values_code_unique
  ON configuration_values(type_id, code)
  WHERE code IS NOT NULL;

CREATE INDEX idx_config_values_type   ON configuration_values(type_id);
CREATE INDEX idx_config_values_parent ON configuration_values(parent_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE configuration_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ct_select_authenticated" ON configuration_types  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ct_write_platform_staff" ON configuration_types  FOR ALL    USING (is_platform_staff());

CREATE POLICY "cv_select_authenticated" ON configuration_values FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cv_write_platform_staff" ON configuration_values FOR ALL    USING (is_platform_staff());

-- ── 4. Seed PLAYBOOK_CATEGORY type ───────────────────────────────────────────

INSERT INTO configuration_types (code, name, description, supports_hierarchy, is_admin_manageable)
VALUES (
  'PLAYBOOK_CATEGORY',
  'Playbook Category',
  'Categories and subcategories used to classify playbooks, programs, and certifications.',
  true,
  true
);

-- ── 5. Migrate playbook_categories → configuration_values (top-level) ─────────

INSERT INTO configuration_values
  (type_id, parent_id, code, name, description, is_active, sort_order, created_by, created_at, updated_at)
SELECT
  ct.id,
  NULL,
  NULL,
  pc.name,
  pc.description,
  pc.is_active,
  pc.sort_order,
  pc.created_by,
  pc.created_at,
  pc.updated_at
FROM playbook_categories pc
CROSS JOIN (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY') ct
ORDER BY pc.sort_order, pc.name;

-- ── 6. Migrate playbook_subcategories → configuration_values (children) ───────

INSERT INTO configuration_values
  (type_id, parent_id, code, name, description, is_active, sort_order, created_by, created_at, updated_at)
SELECT
  ct.id,
  cv_parent.id,
  NULL,
  psc.name,
  psc.description,
  psc.is_active,
  psc.sort_order,
  psc.created_by,
  psc.created_at,
  psc.updated_at
FROM playbook_subcategories psc
JOIN playbook_categories pc
  ON pc.id = psc.category_id
CROSS JOIN (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY') ct
JOIN configuration_values cv_parent
  ON cv_parent.type_id = ct.id
 AND cv_parent.parent_id IS NULL
 AND cv_parent.name = pc.name
ORDER BY psc.sort_order, psc.name;

-- ── 7. Re-target FK columns on playbooks, applications, licenses ──────────────
-- Strategy: drop old FKs → UPDATE values using name-match → add new FKs

-- 7a. Drop old FK constraints
ALTER TABLE playbooks
  DROP CONSTRAINT IF EXISTS playbooks_category_id_fkey,
  DROP CONSTRAINT IF EXISTS playbooks_subcategory_id_fkey;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_category_id_fkey,
  DROP CONSTRAINT IF EXISTS applications_subcategory_id_fkey;

ALTER TABLE licenses
  DROP CONSTRAINT IF EXISTS licenses_category_id_fkey,
  DROP CONSTRAINT IF EXISTS licenses_subcategory_id_fkey;

-- 7b. Remap category_id to new configuration_values UUIDs

UPDATE playbooks p
SET category_id = cv.id
FROM playbook_categories pc
JOIN configuration_values cv
  ON cv.name = pc.name
 AND cv.parent_id IS NULL
 AND cv.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
WHERE p.category_id = pc.id;

UPDATE applications a
SET category_id = cv.id
FROM playbook_categories pc
JOIN configuration_values cv
  ON cv.name = pc.name
 AND cv.parent_id IS NULL
 AND cv.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
WHERE a.category_id = pc.id;

UPDATE licenses l
SET category_id = cv.id
FROM playbook_categories pc
JOIN configuration_values cv
  ON cv.name = pc.name
 AND cv.parent_id IS NULL
 AND cv.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
WHERE l.category_id = pc.id;

-- 7c. Remap subcategory_id to new configuration_values UUIDs

UPDATE playbooks p
SET subcategory_id = cv_child.id
FROM playbook_subcategories psc
JOIN playbook_categories pc
  ON pc.id = psc.category_id
JOIN configuration_values cv_parent
  ON cv_parent.name = pc.name
 AND cv_parent.parent_id IS NULL
 AND cv_parent.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
JOIN configuration_values cv_child
  ON cv_child.parent_id = cv_parent.id
 AND cv_child.name = psc.name
WHERE p.subcategory_id = psc.id;

UPDATE applications a
SET subcategory_id = cv_child.id
FROM playbook_subcategories psc
JOIN playbook_categories pc
  ON pc.id = psc.category_id
JOIN configuration_values cv_parent
  ON cv_parent.name = pc.name
 AND cv_parent.parent_id IS NULL
 AND cv_parent.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
JOIN configuration_values cv_child
  ON cv_child.parent_id = cv_parent.id
 AND cv_child.name = psc.name
WHERE a.subcategory_id = psc.id;

UPDATE licenses l
SET subcategory_id = cv_child.id
FROM playbook_subcategories psc
JOIN playbook_categories pc
  ON pc.id = psc.category_id
JOIN configuration_values cv_parent
  ON cv_parent.name = pc.name
 AND cv_parent.parent_id IS NULL
 AND cv_parent.type_id = (SELECT id FROM configuration_types WHERE code = 'PLAYBOOK_CATEGORY')
JOIN configuration_values cv_child
  ON cv_child.parent_id = cv_parent.id
 AND cv_child.name = psc.name
WHERE l.subcategory_id = psc.id;

-- 7d. Add new FK constraints pointing at configuration_values

ALTER TABLE playbooks
  ADD CONSTRAINT playbooks_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES configuration_values(id) ON DELETE SET NULL,
  ADD CONSTRAINT playbooks_subcategory_id_fkey
    FOREIGN KEY (subcategory_id) REFERENCES configuration_values(id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD CONSTRAINT applications_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES configuration_values(id) ON DELETE SET NULL,
  ADD CONSTRAINT applications_subcategory_id_fkey
    FOREIGN KEY (subcategory_id) REFERENCES configuration_values(id) ON DELETE SET NULL;

ALTER TABLE licenses
  ADD CONSTRAINT licenses_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES configuration_values(id) ON DELETE SET NULL,
  ADD CONSTRAINT licenses_subcategory_id_fkey
    FOREIGN KEY (subcategory_id) REFERENCES configuration_values(id) ON DELETE SET NULL;

-- ── 8. Drop old tables ────────────────────────────────────────────────────────
-- Drop subcategories first (it FK-references categories)

DROP TABLE playbook_subcategories;
DROP TABLE playbook_categories;

COMMIT;
