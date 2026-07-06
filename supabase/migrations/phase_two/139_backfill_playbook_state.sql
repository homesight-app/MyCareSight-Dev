-- Backfill state on playbooks that are linked to a license requirement but
-- have state = NULL. Derives state from license_requirements → license_types.
-- This allows a single .eq('state', state) filter to find all playbooks for a
-- state regardless of whether they are standalone or license-linked.
UPDATE public.playbooks p
SET state = lr.state
FROM public.license_requirements lr
WHERE p.license_requirement_id = lr.id
  AND p.state IS NULL;
