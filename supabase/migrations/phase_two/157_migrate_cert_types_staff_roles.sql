BEGIN;

-- Seed CERTIFICATION_TYPE and STAFF_ROLE configuration types
INSERT INTO configuration_types (code, name, description, supports_hierarchy, is_admin_manageable, is_active)
VALUES
  ('CERTIFICATION_TYPE', 'Certification Type', 'Certification types for caregiver credentials', false, true, true),
  ('STAFF_ROLE', 'Staff Role', 'Staff roles for caregiver members', false, true, true);

-- Migrate certification_types → configuration_values
INSERT INTO configuration_values (type_id, parent_id, name, is_active, sort_order, created_at, updated_at)
SELECT
  (SELECT id FROM configuration_types WHERE code = 'CERTIFICATION_TYPE'),
  NULL,
  certification_type,
  true,
  0,
  now(),
  now()
FROM certification_types
ORDER BY certification_type;

-- Migrate caregiver_roles → configuration_values
INSERT INTO configuration_values (type_id, parent_id, name, is_active, sort_order, created_at, updated_at)
SELECT
  (SELECT id FROM configuration_types WHERE code = 'STAFF_ROLE'),
  NULL,
  name,
  true,
  0,
  now(),
  now()
FROM caregiver_roles
ORDER BY name;

DROP TABLE certification_types;
DROP TABLE caregiver_roles;

COMMIT;
