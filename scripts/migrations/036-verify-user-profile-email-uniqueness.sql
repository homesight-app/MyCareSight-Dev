SELECT
  to_regclass('public.user_profiles_email_lower_unique') IS NOT NULL AS index_exists,
  COALESCE((
    SELECT i.indisunique
    FROM pg_catalog.pg_index AS i
    WHERE i.indexrelid = to_regclass('public.user_profiles_email_lower_unique')
  ), false) AS index_is_unique,
  COALESCE((
    SELECT pg_catalog.pg_get_indexdef(i.indexrelid) ILIKE '%lower(email)%'
    FROM pg_catalog.pg_index AS i
    WHERE i.indexrelid = to_regclass('public.user_profiles_email_lower_unique')
  ), false) AS index_is_case_insensitive,
  NOT EXISTS (
    SELECT 1
    FROM public.user_profiles
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) AS no_case_insensitive_duplicates;
