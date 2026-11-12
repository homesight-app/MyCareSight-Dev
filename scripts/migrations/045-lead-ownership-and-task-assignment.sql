-- Add durable ownership integrity and assignment lookup support for lead collaboration.
-- The migration runner owns the surrounding transaction and ledger insert.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $migration$
BEGIN
  IF to_regclass('public.leads') IS NULL
     OR to_regclass('public.lead_tasks') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'leads, lead_tasks, and user_profiles are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_lead_owner_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_lead_owner_id_fkey
      FOREIGN KEY (lead_owner_id) REFERENCES public.user_profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lead_tasks'::regclass
      AND conname = 'lead_tasks_assigned_to_fkey'
  ) THEN
    ALTER TABLE public.lead_tasks
      ADD CONSTRAINT lead_tasks_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES public.user_profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END
$migration$;

-- Preserve legacy intent by using the creator only when that creator is still an
-- active, eligible owner in the same scope. Never select an arbitrary owner.
UPDATE public.leads lead
SET lead_owner_id = lead.created_by,
    updated_at = clock_timestamp()
FROM public.user_profiles creator
WHERE lead.lead_owner_id IS NULL
  AND lead.status = 'active'
  AND lead.converted_at IS NULL
  AND creator.id = lead.created_by
  AND creator.is_active = true
  AND (
    (
      lead.lead_type = 'agency'
      AND creator.role IN ('admin', 'expert')
    )
    OR (
      lead.lead_type = 'patient'
      AND lead.agency_id IS NOT NULL
      AND creator.agency_id = lead.agency_id
      AND creator.role IN ('company_owner', 'care_coordinator')
      AND EXISTS (
        SELECT 1
        FROM public.user_agency_roles membership
        WHERE membership.user_id = creator.id
          AND membership.agency_id = lead.agency_id
          AND membership.role = creator.role
          AND membership.status = 'active'
      )
    )
  );

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.leads
    WHERE status = 'active'
      AND converted_at IS NULL
      AND lead_owner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Active unconverted leads remain ownerless; assign an eligible owner before retrying migration 045';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_active_owner_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_active_owner_check
      CHECK (status <> 'active' OR converted_at IS NOT NULL OR lead_owner_id IS NOT NULL)
      NOT VALID;
  END IF;

  ALTER TABLE public.leads VALIDATE CONSTRAINT leads_lead_owner_id_fkey;
  ALTER TABLE public.lead_tasks VALIDATE CONSTRAINT lead_tasks_assigned_to_fkey;
  ALTER TABLE public.leads VALIDATE CONSTRAINT leads_active_owner_check;
END
$migration$;

CREATE INDEX IF NOT EXISTS leads_lead_owner_id_idx
  ON public.leads (lead_owner_id)
  WHERE lead_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_tasks_assigned_pending_idx
  ON public.lead_tasks (assigned_to, due_date, id)
  WHERE completed_at IS NULL;

COMMENT ON COLUMN public.leads.lead_owner_id IS
  'Active accountable owner for the lead; eligibility is validated by the server against role and tenant scope.';
COMMENT ON COLUMN public.lead_tasks.assigned_to IS
  'Optional collaborator responsible for the task; eligibility is validated against the parent lead scope.';
