SELECT
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_lead_owner_id_fkey'
      AND contype = 'f' AND convalidated
  ) AS lead_owner_foreign_key_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lead_tasks'::regclass
      AND conname = 'lead_tasks_assigned_to_fkey'
      AND contype = 'f' AND convalidated
  ) AS task_assignee_foreign_key_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_active_owner_check'
      AND contype = 'c' AND convalidated
  ) AS active_owner_constraint_ok,
  to_regclass('public.leads_lead_owner_id_idx') IS NOT NULL AS lead_owner_index_ok,
  to_regclass('public.lead_tasks_assigned_pending_idx') IS NOT NULL AS pending_task_assignee_index_ok,
  NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE status = 'active' AND converted_at IS NULL AND lead_owner_id IS NULL
  ) AS no_active_ownerless_leads,
  NOT EXISTS (
    SELECT 1
    FROM public.leads lead
    LEFT JOIN public.user_profiles profile ON profile.id = lead.lead_owner_id
    WHERE lead.lead_owner_id IS NOT NULL AND profile.id IS NULL
  ) AS no_orphaned_lead_owners,
  NOT EXISTS (
    SELECT 1
    FROM public.lead_tasks task
    LEFT JOIN public.user_profiles profile ON profile.id = task.assigned_to
    WHERE task.assigned_to IS NOT NULL AND profile.id IS NULL
  ) AS no_orphaned_task_assignees;
