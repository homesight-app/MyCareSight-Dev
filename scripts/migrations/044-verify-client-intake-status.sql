SELECT
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.patients'::regclass
      AND conname = 'patients_status_check'
      AND contype = 'c'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%active%'
      AND pg_get_constraintdef(oid) LIKE '%inactive%'
      AND pg_get_constraintdef(oid) LIKE '%pending%'
  ) AS intake_status_constraint_ok,
  NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE status IS NULL OR status NOT IN ('active', 'inactive', 'pending')
  ) AS patient_status_values_ok;
