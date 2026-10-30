-- Verify migration 037's reviewed, non-PHI staging reference baseline.
WITH task_counts AS (
  SELECT
    count(*) FILTER (WHERE category.service_type = 'non_skilled') AS non_skilled_tasks,
    count(*) FILTER (WHERE category.service_type = 'skilled') AS skilled_tasks
  FROM public.task_catalog task
  JOIN public.task_categories category ON category.id = task.category_id
), category_counts AS (
  SELECT
    count(*) FILTER (WHERE service_type = 'non_skilled') AS non_skilled_categories,
    count(*) FILTER (WHERE service_type = 'skilled') AS skilled_categories
  FROM public.task_categories
), configuration_counts AS (
  SELECT
    count(DISTINCT type.id) AS type_count,
    count(value.id) AS value_count,
    count(value.id) FILTER (WHERE type.code = 'CAREGIVER_SKILL_CATEGORY') AS caregiver_skill_categories,
    count(value.id) FILTER (WHERE type.code = 'CERTIFICATION_TYPE') AS certification_types,
    count(value.id) FILTER (WHERE type.code = 'PLAYBOOK_CATEGORY') AS playbook_categories,
    count(value.id) FILTER (WHERE type.code = 'STAFF_ROLE') AS staff_roles
  FROM public.configuration_types type
  LEFT JOIN public.configuration_values value ON value.type_id = type.id
), orphan_counts AS (
  SELECT
    (SELECT count(*) FROM public.task_catalog task
      LEFT JOIN public.task_categories category ON category.id = task.category_id
      WHERE category.id IS NULL)
    + (SELECT count(*) FROM public.configuration_values value
      LEFT JOIN public.configuration_types type ON type.id = value.type_id
      WHERE type.id IS NULL)
    + (SELECT count(*) FROM public.configuration_values value
      LEFT JOIN public.configuration_values parent ON parent.id = value.parent_id
      WHERE value.parent_id IS NOT NULL AND parent.id IS NULL)
    + (SELECT count(*) FROM public.credential_catalog credential
      LEFT JOIN public.configuration_values category ON category.id = credential.category_id
      WHERE credential.category_id IS NOT NULL AND category.id IS NULL)
    + (SELECT count(*) FROM public.task_required_credentials requirement
      LEFT JOIN public.task_catalog task ON task.id = requirement.task_id
      LEFT JOIN public.credential_catalog credential ON credential.id = requirement.credential_id
      WHERE task.id IS NULL OR credential.id IS NULL) AS orphan_count
), runtime_reads AS (
  SELECT bool_and(has_table_privilege('mycaresight_app', table_name, 'SELECT')) AS allowed
  FROM unnest(ARRAY[
    'public.task_categories',
    'public.task_catalog',
    'public.configuration_types',
    'public.configuration_values',
    'public.credential_catalog',
    'public.license_types',
    'public.pricing',
    'public.billing_codes',
    'public.validation_rules'
  ]) AS tables(table_name)
)
SELECT
  category_counts.non_skilled_categories = 2
    AND category_counts.skilled_categories = 13 AS task_categories_ok,
  task_counts.non_skilled_tasks = 15
    AND task_counts.skilled_tasks = 65 AS task_catalog_ok,
  configuration_counts.type_count = 4
    AND configuration_counts.value_count = 35
    AND configuration_counts.caregiver_skill_categories = 7
    AND configuration_counts.certification_types = 9
    AND configuration_counts.playbook_categories = 11
    AND configuration_counts.staff_roles = 8 AS configuration_catalog_ok,
  (SELECT count(*) = 27 FROM public.credential_catalog
    WHERE scope = 'system' AND credential_type = 'skill'
      AND code NOT LIKE 'TEST\_%' ESCAPE '\') AS credential_catalog_ok,
  (SELECT count(*) = 0 FROM public.credential_catalog
    WHERE code LIKE 'TEST\_%' ESCAPE '\') AS test_credentials_excluded,
  (SELECT count(*) = 4 AND count(*) FILTER (WHERE is_active) = 3
    FROM public.license_types) AS license_types_ok,
  (SELECT count(*) = 1 FROM public.pricing) AS pricing_ok,
  (SELECT count(*) = 10 FROM public.billing_codes) AS billing_codes_ok,
  (SELECT count(*) = 6 FROM public.validation_rules) AS validation_rules_ok,
  orphan_counts.orphan_count = 0 AS foreign_keys_ok,
  runtime_reads.allowed AS app_reference_reads_granted
FROM task_counts, category_counts, configuration_counts, orphan_counts, runtime_reads;
