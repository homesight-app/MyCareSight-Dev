-- 002: staged schema for seven missing application tables.
-- MANUAL EXECUTION: Neon dev first; verify before applying to uat. Never Supabase/prod.
-- Empty structure only. Runtime access remains CLOSED until a reviewed workflow/RLS migration.
-- One-time per branch: existing target objects cause a safe abort rather than alteration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE name text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '002 is for the Neon target, not the Supabase source';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_app'
      AND rolcanlogin AND NOT rolbypassrls AND NOT rolsuper
  ) THEN
    RAISE EXCEPTION '002 requires a non-superuser, non-BYPASSRLS mycaresight_app login role';
  END IF;
  IF pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '002 must run as an independent migration owner, not the runtime role or a role it inherits';
  END IF;
  FOREACH name IN ARRAY ARRAY['credential_catalog', 'caregiver_pay_rates', 'internal_notes', 'visit_time_entries', 'visit_adjustment_history', 'visit_approvals', 'visit_financials'] LOOP
    IF to_regclass(format('public.%I', name)) IS NOT NULL THEN
      RAISE EXCEPTION '002 target already exists: %. Stop and run 002 verification; do not drop it', name;
    END IF;
  END LOOP;
  IF to_regprocedure('public.app_migration_set_updated_at()') IS NOT NULL THEN
    RAISE EXCEPTION '002 timestamp helper already exists; inspect migration state';
  END IF;
  FOREACH name IN ARRAY ARRAY['agencies', 'caregiver_members', 'patients', 'user_profiles', 'scheduled_visits', 'billing_codes', 'patient_service_contracts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_constraint c ON c.conrelid = a.attrelid AND c.conkey = ARRAY[a.attnum]::smallint[]
      WHERE a.attrelid = to_regclass(format('public.%I', name))
        AND a.attname = 'id' AND NOT a.attisdropped AND a.attnotnull
        AND a.atttypid = 'uuid'::regtype AND c.contype IN ('p','u')
    ) THEN
      RAISE EXCEPTION '002 parent table % must have a non-null unique/primary UUID id', name;
    END IF;
  END LOOP;
END
$preflight$;

CREATE TABLE public."credential_catalog" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "credential_type" text NOT NULL,
  "service_type" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credential_catalog_code_key" UNIQUE (code),
  CONSTRAINT "credential_catalog_pkey" PRIMARY KEY (id),
  CONSTRAINT "credential_catalog_type_check" CHECK ((credential_type = ANY (ARRAY['license'::text, 'certification'::text, 'skill'::text, 'role'::text])))
);

CREATE TABLE public."caregiver_pay_rates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "caregiver_member_id" uuid NOT NULL,
  "pay_rate" numeric(10,2) NOT NULL,
  "effective_start" date NOT NULL,
  "effective_end" date,
  "unit_type" text DEFAULT 'hour'::text NOT NULL,
  "service_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "caregiver_pay_rates_pkey" PRIMARY KEY (id),
  CONSTRAINT "caregiver_pay_rates_unit_type_check" CHECK ((unit_type = ANY (ARRAY['hour'::text, 'visit'::text, '15_min_unit'::text])))
);

CREATE TABLE public."internal_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tagged_patient_id" uuid,
  "tagged_caregiver_id" uuid,
  CONSTRAINT "internal_notes_content_check" CHECK ((char_length(content) > 0)),
  CONSTRAINT "internal_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "internal_notes_subject_type_check" CHECK ((subject_type = ANY (ARRAY['patient'::text, 'caregiver'::text, 'visit'::text, 'application'::text, 'application_step'::text, 'application_document'::text, 'application_playbook_item'::text])))
);

CREATE TABLE public."visit_time_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "scheduled_visit_id" uuid NOT NULL,
  "patient_id" uuid NOT NULL,
  "caregiver_member_id" uuid NOT NULL,
  "clock_in_time" timestamp with time zone,
  "clock_out_time" timestamp with time zone,
  "adjusted_start_time" timestamp with time zone,
  "adjusted_end_time" timestamp with time zone,
  "actual_hours" numeric(10,2),
  "billable_hours" numeric(10,2),
  "entry_status" text DEFAULT 'pending_review'::text NOT NULL,
  "adjustment_comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "clock_in_latitude" double precision,
  "clock_in_longitude" double precision,
  "clock_out_latitude" double precision,
  "clock_out_longitude" double precision,
  "caregiver_notes" text,
  CONSTRAINT "visit_time_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "visit_time_entries_scheduled_visit_id_key" UNIQUE (scheduled_visit_id),
  CONSTRAINT "visit_time_entries_status_check" CHECK ((entry_status = ANY (ARRAY['pending_review'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public."visit_adjustment_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "visit_time_entry_id" uuid NOT NULL,
  "changed_by_user_id" uuid NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "previous_actual_hours" numeric,
  "current_actual_hours" numeric,
  "previous_billable_hours" numeric,
  "current_billable_hours" numeric,
  "note" text,
  CONSTRAINT "visit_adjustment_history_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."visit_approvals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "scheduled_visit_id" uuid NOT NULL,
  "visit_time_entry_id" uuid NOT NULL,
  "patient_id" uuid NOT NULL,
  "caregiver_member_id" uuid NOT NULL,
  "approved_by_user_id" uuid NOT NULL,
  "approval_status" text NOT NULL,
  "approved_actual_hours" numeric(10,2),
  "approved_billable_hours" numeric(10,2),
  "approval_comment" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pay_rate" numeric(10,2),
  "bill_rate" numeric(10,2),
  CONSTRAINT "visit_approvals_pkey" PRIMARY KEY (id),
  CONSTRAINT "visit_approvals_status_check" CHECK ((approval_status = ANY (ARRAY['approved'::text, 'rejected'::text, 'needs_update'::text]))),
  CONSTRAINT "visit_approvals_visit_time_entry_id_key" UNIQUE (visit_time_entry_id)
);

CREATE TABLE public."visit_financials" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL,
  "scheduled_visit_id" uuid NOT NULL,
  "visit_time_entry_id" uuid NOT NULL,
  "visit_approval_id" uuid,
  "patient_id" uuid NOT NULL,
  "caregiver_member_id" uuid NOT NULL,
  "contract_id" uuid,
  "billing_code_id" uuid,
  "pay_rate" numeric(10,2) DEFAULT 0 NOT NULL,
  "pay_unit_type" text DEFAULT 'hour'::text NOT NULL,
  "pay_amount" numeric(10,2) DEFAULT 0 NOT NULL,
  "bill_rate" numeric(10,2) DEFAULT 0 NOT NULL,
  "bill_unit_type" text DEFAULT 'hour'::text NOT NULL,
  "bill_amount" numeric(10,2) DEFAULT 0 NOT NULL,
  "approved_actual_hours" numeric(10,2),
  "approved_billable_hours" numeric(10,2),
  "calculation_basis" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "service_type" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "coordinator_note" text,
  CONSTRAINT "visit_financials_bill_unit_type_check" CHECK ((bill_unit_type = ANY (ARRAY['hour'::text, 'visit'::text, '15_min_unit'::text]))),
  CONSTRAINT "visit_financials_pay_unit_type_check" CHECK ((pay_unit_type = ANY (ARRAY['hour'::text, 'visit'::text, '15_min_unit'::text]))),
  CONSTRAINT "visit_financials_pkey" PRIMARY KEY (id),
  CONSTRAINT "visit_financials_scheduled_visit_id_key" UNIQUE (scheduled_visit_id),
  CONSTRAINT "visit_financials_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'voided'::text]))),
  CONSTRAINT "visit_financials_visit_time_entry_id_key" UNIQUE (visit_time_entry_id)
);

-- Foreign keys reference the verified Neon identity/parent tables.
ALTER TABLE public."caregiver_pay_rates" ADD CONSTRAINT "caregiver_pay_rates_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public."caregiver_pay_rates" ADD CONSTRAINT "caregiver_pay_rates_caregiver_member_id_fkey" FOREIGN KEY (caregiver_member_id) REFERENCES public.caregiver_members(id) ON DELETE CASCADE;
ALTER TABLE public."internal_notes" ADD CONSTRAINT "internal_notes_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public."internal_notes" ADD CONSTRAINT "internal_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public."internal_notes" ADD CONSTRAINT "internal_notes_tagged_caregiver_id_fkey" FOREIGN KEY (tagged_caregiver_id) REFERENCES public.caregiver_members(id) ON DELETE SET NULL;
ALTER TABLE public."internal_notes" ADD CONSTRAINT "internal_notes_tagged_patient_id_fkey" FOREIGN KEY (tagged_patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;
ALTER TABLE public."internal_notes" ADD CONSTRAINT "internal_notes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."visit_adjustment_history" ADD CONSTRAINT "visit_adjustment_history_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_adjustment_history" ADD CONSTRAINT "visit_adjustment_history_changed_by_user_id_fkey" FOREIGN KEY (changed_by_user_id) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_adjustment_history" ADD CONSTRAINT "visit_adjustment_history_visit_time_entry_id_fkey" FOREIGN KEY (visit_time_entry_id) REFERENCES public.visit_time_entries(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_scheduled_visit_id_fkey" FOREIGN KEY (scheduled_visit_id) REFERENCES public.scheduled_visits(id) ON DELETE CASCADE;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_staff_member_id_fkey" FOREIGN KEY (caregiver_member_id) REFERENCES public.caregiver_members(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_approvals" ADD CONSTRAINT "visit_approvals_visit_time_entry_id_fkey" FOREIGN KEY (visit_time_entry_id) REFERENCES public.visit_time_entries(id) ON DELETE CASCADE;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_billing_code_id_fkey" FOREIGN KEY (billing_code_id) REFERENCES public.billing_codes(id) ON DELETE SET NULL;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES public.patient_service_contracts(id) ON DELETE SET NULL;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_scheduled_visit_id_fkey" FOREIGN KEY (scheduled_visit_id) REFERENCES public.scheduled_visits(id) ON DELETE CASCADE;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_staff_member_id_fkey" FOREIGN KEY (caregiver_member_id) REFERENCES public.caregiver_members(id) ON DELETE RESTRICT;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_visit_approval_id_fkey" FOREIGN KEY (visit_approval_id) REFERENCES public.visit_approvals(id) ON DELETE SET NULL;
ALTER TABLE public."visit_financials" ADD CONSTRAINT "visit_financials_visit_time_entry_id_fkey" FOREIGN KEY (visit_time_entry_id) REFERENCES public.visit_time_entries(id) ON DELETE CASCADE;
ALTER TABLE public."visit_time_entries" ADD CONSTRAINT "visit_time_entries_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public."visit_time_entries" ADD CONSTRAINT "visit_time_entries_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
ALTER TABLE public."visit_time_entries" ADD CONSTRAINT "visit_time_entries_scheduled_visit_id_fkey" FOREIGN KEY (scheduled_visit_id) REFERENCES public.scheduled_visits(id) ON DELETE CASCADE;
ALTER TABLE public."visit_time_entries" ADD CONSTRAINT "visit_time_entries_staff_member_id_fkey" FOREIGN KEY (caregiver_member_id) REFERENCES public.caregiver_members(id) ON DELETE RESTRICT;

-- Source lookup indexes; primary/unique constraints already create their indexes.
CREATE INDEX idx_caregiver_pay_rates_agency_id ON public.caregiver_pay_rates USING btree (agency_id);
CREATE INDEX idx_caregiver_pay_rates_caregiver_member_id ON public.caregiver_pay_rates USING btree (caregiver_member_id);
CREATE INDEX idx_caregiver_pay_rates_effective ON public.caregiver_pay_rates USING btree (caregiver_member_id, effective_start);
CREATE INDEX idx_internal_notes_subject ON public.internal_notes USING btree (agency_id, subject_type, subject_id);
CREATE INDEX idx_internal_notes_tagged_caregiver ON public.internal_notes USING btree (tagged_caregiver_id) WHERE (tagged_caregiver_id IS NOT NULL);
CREATE INDEX idx_internal_notes_tagged_patient ON public.internal_notes USING btree (tagged_patient_id) WHERE (tagged_patient_id IS NOT NULL);
CREATE INDEX idx_visit_adjustment_history_entry_id ON public.visit_adjustment_history USING btree (visit_time_entry_id);
CREATE INDEX idx_visit_approvals_agency_id ON public.visit_approvals USING btree (agency_id);
CREATE INDEX idx_visit_approvals_scheduled_visit_id ON public.visit_approvals USING btree (scheduled_visit_id);
CREATE INDEX idx_visit_financials_agency_id ON public.visit_financials USING btree (agency_id);
CREATE INDEX idx_visit_financials_status ON public.visit_financials USING btree (status);
CREATE INDEX idx_visit_time_entries_agency_id ON public.visit_time_entries USING btree (agency_id);

-- Portable, invoker-only timestamp helper; never calls Supabase auth functions.
CREATE FUNCTION public.app_migration_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.app_migration_set_updated_at() FROM PUBLIC, mycaresight_app;

CREATE TRIGGER "trg_caregiver_pay_rates_updated_at" BEFORE UPDATE ON public."caregiver_pay_rates" FOR EACH ROW EXECUTE FUNCTION public.app_migration_set_updated_at();
CREATE TRIGGER "trg_credential_catalog_updated_at" BEFORE UPDATE ON public."credential_catalog" FOR EACH ROW EXECUTE FUNCTION public.app_migration_set_updated_at();
CREATE TRIGGER "trg_visit_approvals_updated_at" BEFORE UPDATE ON public."visit_approvals" FOR EACH ROW EXECUTE FUNCTION public.app_migration_set_updated_at();
CREATE TRIGGER "trg_visit_financials_updated_at" BEFORE UPDATE ON public."visit_financials" FOR EACH ROW EXECUTE FUNCTION public.app_migration_set_updated_at();
CREATE TRIGGER "trg_visit_time_entries_updated_at" BEFORE UPDATE ON public."visit_time_entries" FOR EACH ROW EXECUTE FUNCTION public.app_migration_set_updated_at();

-- Do not inherit the existing broad default table grants for the runtime role.
-- No permissive policies are created in this staging migration.
ALTER TABLE public."credential_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."credential_catalog" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."credential_catalog" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."caregiver_pay_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."caregiver_pay_rates" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."caregiver_pay_rates" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."internal_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_notes" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."internal_notes" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."visit_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."visit_time_entries" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."visit_time_entries" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."visit_adjustment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."visit_adjustment_history" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."visit_adjustment_history" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."visit_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."visit_approvals" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."visit_approvals" FROM PUBLIC, mycaresight_app;
ALTER TABLE public."visit_financials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."visit_financials" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."visit_financials" FROM PUBLIC, mycaresight_app;

DO $verify$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['credential_catalog', 'caregiver_pay_rates', 'internal_notes', 'visit_time_entries', 'visit_adjustment_history', 'visit_approvals', 'visit_financials'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = to_regclass(format('public.%I', name))
        AND c.relrowsecurity AND c.relforcerowsecurity
    ) OR has_table_privilege('mycaresight_app', format('public.%I', name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = to_regclass(format('public.%I', name))
    ) THEN
      RAISE EXCEPTION '002 staging access check failed for %', name;
    END IF;
  END LOOP;
END
$verify$;
COMMIT;
