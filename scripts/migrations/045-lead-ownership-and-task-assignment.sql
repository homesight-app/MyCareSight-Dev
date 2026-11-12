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

-- Preserve historical accountability by assigning every unowned lead to its
-- recorded creator. Historical ownership is evidence, so it does not depend on
-- whether the creator is still active or currently eligible for reassignment.
UPDATE public.leads lead
SET lead_owner_id = lead.created_by,
    updated_at = clock_timestamp()
FROM public.user_profiles creator
WHERE lead.lead_owner_id IS NULL
  AND creator.id = lead.created_by;

-- Assign existing unassigned tasks to their recorded creator.
UPDATE public.lead_tasks task
SET assigned_to = creator.id,
    updated_at = clock_timestamp()
FROM public.user_profiles creator
WHERE task.assigned_to IS NULL
  AND creator.id = task.created_by;

-- Legacy tasks can outlive a deleted creator profile. In that exceptional case,
-- inherit the accountable parent lead owner instead of choosing another user.
UPDATE public.lead_tasks task
SET assigned_to = lead.lead_owner_id,
    updated_at = clock_timestamp()
FROM public.leads lead
WHERE task.assigned_to IS NULL
  AND lead.id = task.lead_id
  AND lead.lead_owner_id IS NOT NULL;

DO $migration$
BEGIN
  -- Ownership is intentionally optional so system-created inbound leads can
  -- enter an explicit unassigned queue. Remove a pre-release test constraint
  -- if this migration was exercised manually before ledger-controlled rollout.
  ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_active_owner_check;
  ALTER TABLE public.leads VALIDATE CONSTRAINT leads_lead_owner_id_fkey;
  ALTER TABLE public.lead_tasks VALIDATE CONSTRAINT lead_tasks_assigned_to_fkey;
END
$migration$;

CREATE INDEX IF NOT EXISTS leads_lead_owner_id_idx
  ON public.leads (lead_owner_id)
  WHERE lead_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_tasks_assigned_pending_idx
  ON public.lead_tasks (assigned_to, due_date, id)
  WHERE completed_at IS NULL;

COMMENT ON COLUMN public.leads.lead_owner_id IS
  'Optional accountable owner for the lead; eligibility is validated by the server against role and tenant scope.';
COMMENT ON COLUMN public.lead_tasks.assigned_to IS
  'Optional collaborator responsible for the task; eligibility is validated against the parent lead scope.';
