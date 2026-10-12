-- 020: PHI-minimized, auditable open-shift advertising for agency schedulers.
-- Apply to Development, verify, then apply to UAT before deploying the UI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '020 must not run against Supabase';
  END IF;
  IF to_regclass('public.scheduled_visits') IS NULL
     OR to_regclass('public.caregiver_members') IS NULL
     OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.schedule_assignment_requests') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '020 requires the Neon scheduling, identity, notification, and audit tables';
  END IF;
  IF to_regprocedure('public.visit_financial_manager_can_read(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Run migration 014 before migration 020';
  END IF;
END
$preflight$;

CREATE TABLE public.visit_shift_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  scheduled_visit_id uuid NOT NULL REFERENCES public.scheduled_visits(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  audience_mode text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_shift_offers_audience_mode_check
    CHECK (audience_mode IN ('selected', 'all_eligible')),
  CONSTRAINT visit_shift_offers_status_check
    CHECK (status IN ('open', 'closed', 'cancelled', 'expired'))
);

CREATE TABLE public.visit_shift_offer_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.visit_shift_offers(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  caregiver_member_id uuid NOT NULL REFERENCES public.caregiver_members(id),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'notified',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_shift_offer_recipients_status_check
    CHECK (status IN ('notified', 'interested', 'not_interested', 'expired')),
  CONSTRAINT visit_shift_offer_recipients_offer_caregiver_key
    UNIQUE (offer_id, caregiver_member_id)
);

ALTER TABLE public.schedule_assignment_requests
  ADD COLUMN IF NOT EXISTS shift_offer_recipient_id uuid;

DO $request_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule_assignment_requests'::regclass
      AND conname = 'schedule_assignment_requests_shift_offer_recipient_fkey'
  ) THEN
    ALTER TABLE public.schedule_assignment_requests
      ADD CONSTRAINT schedule_assignment_requests_shift_offer_recipient_fkey
      FOREIGN KEY (shift_offer_recipient_id)
      REFERENCES public.visit_shift_offer_recipients(id)
      ON DELETE SET NULL;
  END IF;
END
$request_fk$;

CREATE UNIQUE INDEX visit_shift_offers_one_open_per_visit_idx
  ON public.visit_shift_offers(scheduled_visit_id)
  WHERE status = 'open';
CREATE INDEX visit_shift_offers_agency_status_idx
  ON public.visit_shift_offers(agency_id, status, expires_at, scheduled_visit_id);
CREATE INDEX visit_shift_offer_recipients_user_status_idx
  ON public.visit_shift_offer_recipients(user_id, status, offer_id);
CREATE INDEX visit_shift_offer_recipients_offer_status_idx
  ON public.visit_shift_offer_recipients(offer_id, status, caregiver_member_id);
CREATE INDEX schedule_assignment_requests_shift_offer_recipient_idx
  ON public.schedule_assignment_requests(shift_offer_recipient_id)
  WHERE shift_offer_recipient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.close_visit_shift_offers_after_visit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  close_status text;
BEGIN
  IF NEW.caregiver_member_id IS NOT NULL THEN
    close_status := 'closed';
  ELSIF NEW.status IN ('missed', 'cancelled', 'voided', 'on_hold', 'completed') THEN
    close_status := 'cancelled';
  ELSIF OLD.visit_date IS DISTINCT FROM NEW.visit_date
     OR OLD.scheduled_start_time IS DISTINCT FROM NEW.scheduled_start_time
     OR OLD.scheduled_end_time IS DISTINCT FROM NEW.scheduled_end_time
     OR OLD.scheduled_end_date IS DISTINCT FROM NEW.scheduled_end_date
     OR OLD.service_type IS DISTINCT FROM NEW.service_type THEN
    -- Existing invitations contain the prior schedule. Require a fresh publish.
    close_status := 'cancelled';
  ELSE
    RETURN NEW;
  END IF;

  WITH closed AS (
    UPDATE public.visit_shift_offers
    SET status = close_status, closed_at = now(), updated_at = now()
    WHERE scheduled_visit_id = NEW.id AND status = 'open'
    RETURNING id, agency_id
  ), expired AS (
    UPDATE public.visit_shift_offer_recipients recipient
    SET status = 'expired', updated_at = now()
    FROM closed
    WHERE recipient.offer_id = closed.id
      AND recipient.status <> 'expired'
    RETURNING recipient.id
  ), resolved_requests AS (
    UPDATE public.schedule_assignment_requests request
    SET status = CASE
          WHEN NEW.caregiver_member_id IS NOT NULL
            AND request.caregiver_member_id = NEW.caregiver_member_id THEN 'approved'
          ELSE 'declined'
        END,
        decline_reason = CASE
          WHEN NEW.caregiver_member_id IS NOT NULL
            AND request.caregiver_member_id = NEW.caregiver_member_id THEN NULL
          WHEN NEW.caregiver_member_id IS NOT NULL THEN 'Shift filled by another caregiver'
          ELSE 'Shift closed'
        END,
        resolved_at = now(),
        resolved_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid,
        updated_at = now()
    FROM closed
    WHERE request.schedule_id = NEW.id
      AND request.status = 'pending'
    RETURNING request.id
  )
  INSERT INTO public.audit_log (
    agency_id, table_name, record_id, action, performed_by_user_id, details
  )
  SELECT closed.agency_id, 'visit_shift_offers', closed.id, 'CLOSE',
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    jsonb_build_object(
      'operation', 'close_open_shift_after_visit_change',
      'visit_id', NEW.id,
      'status', close_status
    )
  FROM closed;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.reset_shift_offer_recipient_after_request_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.shift_offer_recipient_id IS NOT NULL THEN
    UPDATE public.visit_shift_offer_recipients recipient
    SET status = 'notified', responded_at = NULL, updated_at = now()
    FROM public.visit_shift_offers offer
    WHERE recipient.id = OLD.shift_offer_recipient_id
      AND offer.id = recipient.offer_id
      AND offer.status = 'open'
      AND offer.expires_at > now()
      AND recipient.status = 'interested';
  END IF;
  RETURN OLD;
END
$function$;

REVOKE ALL ON FUNCTION public.close_visit_shift_offers_after_visit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_shift_offer_recipient_after_request_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS scheduled_visits_close_shift_offers ON public.scheduled_visits;
CREATE TRIGGER scheduled_visits_close_shift_offers
  AFTER UPDATE OF caregiver_member_id, status, visit_date, scheduled_start_time,
    scheduled_end_time, scheduled_end_date, service_type
  ON public.scheduled_visits
  FOR EACH ROW EXECUTE FUNCTION public.close_visit_shift_offers_after_visit_change();

DROP TRIGGER IF EXISTS schedule_assignment_requests_reset_shift_offer ON public.schedule_assignment_requests;
CREATE TRIGGER schedule_assignment_requests_reset_shift_offer
  AFTER DELETE ON public.schedule_assignment_requests
  FOR EACH ROW EXECUTE FUNCTION public.reset_shift_offer_recipient_after_request_delete();

ALTER TABLE public.visit_shift_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_shift_offer_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY visit_shift_offers_manager_select
  ON public.visit_shift_offers FOR SELECT TO mycaresight_app
  USING (public.visit_financial_manager_can_read(agency_id));
CREATE POLICY visit_shift_offers_caregiver_select
  ON public.visit_shift_offers FOR SELECT TO mycaresight_app
  USING (EXISTS (
    SELECT 1
    FROM public.visit_shift_offer_recipients recipient
    WHERE recipient.offer_id = visit_shift_offers.id
      AND recipient.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND recipient.agency_id = visit_shift_offers.agency_id
  ));
CREATE POLICY visit_shift_offers_manager_insert
  ON public.visit_shift_offers FOR INSERT TO mycaresight_app
  WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND created_by_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.scheduled_visits visit
      WHERE visit.id = scheduled_visit_id AND visit.agency_id = visit_shift_offers.agency_id
    )
  );
CREATE POLICY visit_shift_offers_manager_update
  ON public.visit_shift_offers FOR UPDATE TO mycaresight_app
  USING (public.visit_financial_manager_can_read(agency_id))
  WITH CHECK (public.visit_financial_manager_can_read(agency_id));

CREATE POLICY visit_shift_offer_recipients_manager_select
  ON public.visit_shift_offer_recipients FOR SELECT TO mycaresight_app
  USING (public.visit_financial_manager_can_read(agency_id));
CREATE POLICY visit_shift_offer_recipients_caregiver_select
  ON public.visit_shift_offer_recipients FOR SELECT TO mycaresight_app
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.user_agency_roles membership
      WHERE membership.user_id = visit_shift_offer_recipients.user_id
        AND membership.agency_id = visit_shift_offer_recipients.agency_id
        AND membership.role = 'staff_member'
        AND membership.status = 'active'
    )
  );
CREATE POLICY visit_shift_offer_recipients_manager_insert
  ON public.visit_shift_offer_recipients FOR INSERT TO mycaresight_app
  WITH CHECK (
    public.visit_financial_manager_can_read(agency_id)
    AND EXISTS (
      SELECT 1 FROM public.caregiver_members caregiver
      JOIN public.user_profiles profile ON profile.id = caregiver.user_id
      JOIN public.user_agency_roles membership
        ON membership.user_id = profile.id
       AND membership.agency_id = caregiver.agency_id
       AND membership.role = 'staff_member'
       AND membership.status = 'active'
      WHERE caregiver.id = caregiver_member_id
        AND caregiver.user_id = visit_shift_offer_recipients.user_id
        AND caregiver.agency_id = visit_shift_offer_recipients.agency_id
        AND caregiver.status = 'active'
        AND profile.is_active = true
    )
  );
CREATE POLICY visit_shift_offer_recipients_manager_update
  ON public.visit_shift_offer_recipients FOR UPDATE TO mycaresight_app
  USING (public.visit_financial_manager_can_read(agency_id))
  WITH CHECK (public.visit_financial_manager_can_read(agency_id));
CREATE POLICY visit_shift_offer_recipients_caregiver_update
  ON public.visit_shift_offer_recipients FOR UPDATE TO mycaresight_app
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND status IN ('notified', 'interested', 'not_interested')
  );

REVOKE ALL ON public.visit_shift_offers, public.visit_shift_offer_recipients FROM PUBLIC, mycaresight_app;
GRANT SELECT ON public.visit_shift_offers TO mycaresight_app;
GRANT INSERT (agency_id, scheduled_visit_id, created_by_user_id, audience_mode, status, expires_at)
  ON public.visit_shift_offers TO mycaresight_app;
GRANT UPDATE (audience_mode, status, closed_at, updated_at)
  ON public.visit_shift_offers TO mycaresight_app;
GRANT SELECT ON public.visit_shift_offer_recipients TO mycaresight_app;
GRANT INSERT (offer_id, agency_id, caregiver_member_id, user_id, status)
  ON public.visit_shift_offer_recipients TO mycaresight_app;
GRANT UPDATE (status, responded_at, updated_at)
  ON public.visit_shift_offer_recipients TO mycaresight_app;

DO $jobs_access$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.visit_shift_offers, public.visit_shift_offer_recipients FROM mycaresight_jobs;
  END IF;
END
$jobs_access$;

COMMENT ON TABLE public.visit_shift_offers IS
  'Agency-scoped open-shift outreach campaigns; notification content must remain PHI-minimized.';
COMMENT ON TABLE public.visit_shift_offer_recipients IS
  'Caregivers selected for an open-shift campaign and their response state.';

COMMIT;
