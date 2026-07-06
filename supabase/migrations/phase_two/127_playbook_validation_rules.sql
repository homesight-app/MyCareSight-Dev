-- Migration 127: Playbook Validation Rules
-- Fixes the requirement_type CHECK constraint from migration 126 (removes 'conditional').
-- Adds: validation_rules library, playbook_item_validation_rules join table,
--       application_playbook_item_rule_checks live tracking table.

-- ─── Fix migration 126 CHECK constraints (dev DB already has old constraint) ──

DO $$
DECLARE
  c_name text;
BEGIN
  -- Fix playbook_items
  SELECT conname INTO c_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'playbook_items'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%conditional%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.playbook_items DROP CONSTRAINT %I', c_name);
    ALTER TABLE public.playbook_items
      ADD CONSTRAINT playbook_items_requirement_type_check
      CHECK (requirement_type IN ('required', 'optional'));
  END IF;

  -- Fix application_playbook_items
  SELECT conname INTO c_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'application_playbook_items'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%conditional%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.application_playbook_items DROP CONSTRAINT %I', c_name);
    ALTER TABLE public.application_playbook_items
      ADD CONSTRAINT application_playbook_items_requirement_type_check
      CHECK (requirement_type IN ('required', 'optional'));
  END IF;
END $$;

-- ─── System-level validation rule library ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.validation_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  field_key   text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.validation_rules (name, description, field_key, sort_order) VALUES
  ('Legal Entity Name',       'Verify the legal entity name on the document matches the agency record.',              'legal_entity_name', 1),
  ('DBA / Operating Name',    'Verify the operating or DBA name matches the agency record.',                         'agency_name',        2),
  ('Licensed Office Address', 'Verify the office address on the document matches the licensed address on file.',     'office_address',     3),
  ('State of Operation',      'Verify the state listed on the document matches the agency''s licensed state.',       'state',              4)
ON CONFLICT DO NOTHING;

-- ─── Join table: which rules are selected on a playbook document item ──────────

CREATE TABLE IF NOT EXISTS public.playbook_item_validation_rules (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_item_id   uuid        NOT NULL REFERENCES public.playbook_items(id) ON DELETE CASCADE,
  validation_rule_id uuid        NOT NULL REFERENCES public.validation_rules(id),
  rule_order         integer     NOT NULL,
  is_required        boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_item_id, validation_rule_id)
);

CREATE INDEX IF NOT EXISTS playbook_item_rules_item_idx
  ON public.playbook_item_validation_rules(playbook_item_id, rule_order);

-- ─── Live rule checks per application item ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.application_playbook_item_rule_checks (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_playbook_item_id uuid        NOT NULL REFERENCES public.application_playbook_items(id) ON DELETE CASCADE,
  validation_rule_id           uuid        REFERENCES public.validation_rules(id) ON DELETE SET NULL,
  -- Snapshot of rule content at copy time
  rule_name   text        NOT NULL,
  field_key   text        NOT NULL,
  description text,
  rule_order  integer     NOT NULL,
  is_required boolean     NOT NULL DEFAULT true,
  -- Expert check state
  is_checked  boolean     NOT NULL DEFAULT false,
  checked_by  uuid        REFERENCES public.user_profiles(id),
  checked_at  timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_rule_checks_item_idx
  ON public.application_playbook_item_rule_checks(application_playbook_item_id, rule_order);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_item_validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_playbook_item_rule_checks ENABLE ROW LEVEL SECURITY;

-- Library: all authenticated users can read; only platform staff can write
CREATE POLICY "authenticated_select_validation_rules"
  ON public.validation_rules FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "platform_staff_manage_validation_rules"
  ON public.validation_rules FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

-- Join table: platform staff only
CREATE POLICY "platform_staff_all_playbook_item_rules"
  ON public.playbook_item_validation_rules FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

-- Live checks: platform staff manage; agency can view their own application checks
CREATE POLICY "platform_staff_all_rule_checks"
  ON public.application_playbook_item_rule_checks FOR ALL
  USING (is_platform_staff()) WITH CHECK (is_platform_staff());

CREATE POLICY "agency_select_rule_checks"
  ON public.application_playbook_item_rule_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.application_playbook_items api
      JOIN public.applications a  ON a.id  = api.application_id
      JOIN public.agencies      ag ON ag.id = a.agency_id
      WHERE api.id = application_playbook_item_rule_checks.application_playbook_item_id
        AND is_agency_member(ag.id)
    )
  );
