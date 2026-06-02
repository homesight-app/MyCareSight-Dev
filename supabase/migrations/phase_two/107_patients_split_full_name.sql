-- Step 1: Add new columns (nullable during backfill)
ALTER TABLE public.patients
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

-- Step 2: Backfill from full_name
--   first_name = everything before the first space (or the whole value if no space)
--   last_name  = everything after the first space (empty string if no space)
--   e.g. "Mary Jane Smith" → first_name='Mary', last_name='Jane Smith'
UPDATE public.patients
SET
  first_name = CASE
    WHEN position(' ' IN full_name) > 0
    THEN left(full_name, position(' ' IN full_name) - 1)
    ELSE full_name
  END,
  last_name = CASE
    WHEN position(' ' IN full_name) > 0
    THEN trim(substring(full_name FROM position(' ' IN full_name) + 1))
    ELSE ''
  END
WHERE full_name IS NOT NULL;

-- Rows where full_name was NULL get empty strings
UPDATE public.patients
SET first_name = '', last_name = ''
WHERE full_name IS NULL;

-- Step 3: Enforce NOT NULL now that data is backfilled
ALTER TABLE public.patients
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN first_name SET DEFAULT '',
  ALTER COLUMN last_name  SET NOT NULL,
  ALTER COLUMN last_name  SET DEFAULT '';

-- Step 4: Drop the old column
ALTER TABLE public.patients DROP COLUMN full_name;
