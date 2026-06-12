-- Migration 117: Re-point lead_notes and lead_tasks user FKs to user_profiles
-- The initial migration pointed author_id/created_by/assigned_to at auth.users,
-- but PostgREST requires FKs to reference user_profiles for join hints to work
-- (matching the pattern used by internal_notes, care_coordinators, etc.)

ALTER TABLE public.lead_notes
  DROP CONSTRAINT lead_notes_author_id_fkey,
  ADD CONSTRAINT lead_notes_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.lead_tasks
  DROP CONSTRAINT lead_tasks_created_by_fkey,
  ADD CONSTRAINT lead_tasks_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.user_profiles(id);

ALTER TABLE public.lead_tasks
  DROP CONSTRAINT lead_tasks_assigned_to_fkey,
  ADD CONSTRAINT lead_tasks_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.user_profiles(id);
