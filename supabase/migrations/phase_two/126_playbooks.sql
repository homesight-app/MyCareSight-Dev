-- Migration 126: Playbook Builder
-- Unified ordered checklist of steps + documents for a license requirement (Phase 1).
-- Generalizes in Phase 2 to standalone packages and per-application tracking.

-- ─── Template tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.playbooks (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  playbook_type           text        NOT NULL DEFAULT 'license_requirement'
                          CHECK (playbook_type IN ('license_requirement', 'package', 'onboarding', 'compliance')),
  description             text,
  license_requirement_id  uuid        REFERENCES public.license_requirements(id) ON DELETE CASCADE,
  is_active               boolean     NOT NULL DEFAULT true,
  created_by              uuid        REFERENCES public.user_profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One playbook per license requirement
CREATE UNIQUE INDEX IF NOT EXISTS playbooks_license_req_idx
  ON public.playbooks(license_requirement_id)
  WHERE license_requirement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.playbook_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id     uuid        NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  item_order      integer     NOT NULL,
  item_type       text        NOT NULL CHECK (item_type IN ('step', 'document')),

  -- Content stored inline so items are self-contained
  name            text        NOT NULL,
  description     text,
  instructions    text,
  estimated_days  integer,
  document_type   text,

  -- Generalized attributes (phase, assignment, requirement_type are now tags, not structure)
  phase               text,
  assignment          text    NOT NULL DEFAULT 'client'
                      CHECK (assignment IN ('client', 'expert', 'both')),
  requirement_type    text    NOT NULL DEFAULT 'required'
                      CHECK (requirement_type IN ('required', 'optional')),

  -- Traceability back to source tables (nullable; item survives source deletion)
  source_step_id      uuid    REFERENCES public.license_requirement_steps(id) ON DELETE SET NULL,
  source_document_id  uuid    REFERENCES public.license_requirement_documents(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playbook_items_playbook_idx
  ON public.playbook_items(playbook_id, item_order);

-- ─── Phase 2: per-application live tracking ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.application_playbook_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid        NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  playbook_item_id uuid        REFERENCES public.playbook_items(id) ON DELETE SET NULL,

  -- Snapshot of template content at time of copy
  item_order          integer NOT NULL,
  item_type           text    NOT NULL CHECK (item_type IN ('step', 'document')),
  name                text    NOT NULL,
  description         text,
  instructions        text,
  document_type       text,
  phase               text,
  assignment          text    NOT NULL DEFAULT 'client',
  requirement_type    text    NOT NULL DEFAULT 'required'
                      CHECK (requirement_type IN ('required', 'optional')),

  -- Live tracking (Phase 2)
  status      text    NOT NULL DEFAULT 'not_started'
              CHECK (status IN ('not_started', 'in_progress', 'review_needed', 'approved', 'not_applicable')),
  due_date    date,
  notes       text,
  updated_by  uuid    REFERENCES public.user_profiles(id),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_playbook_items_app_idx
  ON public.application_playbook_items(application_id, item_order);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_playbook_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_staff_all_playbooks"
  ON public.playbooks FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

CREATE POLICY "platform_staff_all_playbook_items"
  ON public.playbook_items FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

CREATE POLICY "platform_staff_all_app_playbook_items"
  ON public.application_playbook_items FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

CREATE POLICY "agency_select_app_playbook_items"
  ON public.application_playbook_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.agencies ag ON ag.id = a.agency_id
      WHERE a.id = application_playbook_items.application_id
        AND is_agency_member(ag.id)
    )
  );
