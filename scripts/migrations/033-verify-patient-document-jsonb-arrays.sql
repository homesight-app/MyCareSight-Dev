-- Read-only check after 033. Expected: non_array_rows = 0.
SELECT
  count(*) FILTER (WHERE documents IS NOT NULL AND jsonb_typeof(documents) <> 'array') AS non_array_rows,
  count(*) FILTER (WHERE jsonb_typeof(documents) = 'array') AS array_rows,
  count(*) FILTER (WHERE documents IS NULL) AS null_rows
FROM public.patients;
