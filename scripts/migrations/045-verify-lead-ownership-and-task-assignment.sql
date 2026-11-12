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
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_active_owner_check'
  ) AS lead_owner_is_optional,
  to_regclass('public.leads_lead_owner_id_idx') IS NOT NULL AS lead_owner_index_ok,
  to_regclass('public.lead_tasks_assigned_pending_idx') IS NOT NULL AS pending_task_assignee_index_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.leads lead
    JOIN public.user_profiles creator ON creator.id = lead.created_by
    WHERE lead.lead_owner_id IS NULL
  ) AS all_leads_with_valid_creators_are_owned,
  NOT EXISTS (
    SELECT 1
    FROM public.lead_tasks task
    JOIN public.leads lead ON lead.id = task.lead_id
    LEFT JOIN public.user_profiles creator ON creator.id = task.created_by
    WHERE task.assigned_to IS NULL
      AND COALESCE(creator.id, lead.lead_owner_id) IS NOT NULL
  ) AS all_assignable_tasks_have_default_assignees,
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
