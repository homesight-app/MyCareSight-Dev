-- Stores each completed validation run for a document requirement item.
-- Results are snapshotted as JSONB so history is self-contained without joining back.

CREATE TABLE public.validation_runs (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_playbook_item_id uuid NOT NULL
    REFERENCES public.application_playbook_items(id) ON DELETE CASCADE,
  run_number                   integer NOT NULL,
  extraction_status            text NOT NULL
    CHECK (extraction_status IN ('success', 'partial', 'failed', 'no_document')),
  completed_at                 timestamptz NOT NULL DEFAULT now(),
  completed_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  passed_count                 integer NOT NULL DEFAULT 0,
  failed_count                 integer NOT NULL DEFAULT 0,
  needs_review_count           integer NOT NULL DEFAULT 0,
  results                      jsonb NOT NULL DEFAULT '[]',
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX validation_runs_item_idx
  ON public.validation_runs(application_playbook_item_id);

-- RLS
ALTER TABLE public.validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY vr_select ON public.validation_runs
  FOR SELECT USING (is_platform_staff());

CREATE POLICY vr_insert ON public.validation_runs
  FOR INSERT WITH CHECK (is_platform_staff());
