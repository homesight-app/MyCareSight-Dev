-- Extends migration 092: adds agency admin loop notifications when
-- company_owner_id is null (admin/expert-created applications).
-- All three functions use CREATE OR REPLACE — run each block separately
-- in the Supabase SQL editor if the multi-statement script fails.

CREATE OR REPLACE FUNCTION auto_review_on_100_percent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application_name TEXT;
  app_state TEXT;
  agency_admin_rec RECORD;
BEGIN
  IF NEW.progress_percentage = 100
     AND OLD.progress_percentage < 100
     AND OLD.status = 'in_progress' THEN

    application_name := NEW.application_name;
    app_state := NEW.state;

    -- Cases A & B: expert assigned → auto-submit for review and notify expert
    IF NEW.assigned_expert_id IS NOT NULL THEN
      NEW.status := 'under_review';
      NEW.submitted_date := CURRENT_DATE;

      INSERT INTO notifications (user_id, title, message, type, icon_type)
      VALUES (
        NEW.assigned_expert_id,
        'Application Ready for Review',
        'Application "' || application_name || '" (' || app_state ||
          ') has reached 100% completion and is ready for your review.',
        'application_update', 'document'
      );
    END IF;

    -- Notify company owner (Case A) or agency admins (Cases B & C)
    IF NEW.company_owner_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, icon_type)
      VALUES (
        NEW.company_owner_id,
        'Application Submitted for Review',
        'Your application "' || application_name || '" (' || app_state ||
          ') has been submitted for expert review.',
        'application_update', 'check'
      );
    ELSIF NEW.agency_id IS NOT NULL THEN
      FOR agency_admin_rec IN
        SELECT user_id FROM public.agency_admins
        WHERE agency_id = NEW.agency_id
          AND user_id IS NOT NULL
          AND COALESCE(status, 'active') IN ('active', 'invited')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, icon_type)
        VALUES (
          agency_admin_rec.user_id,
          CASE WHEN NEW.assigned_expert_id IS NOT NULL
               THEN 'Application Submitted for Review'
               ELSE 'Application Complete' END,
          'Application "' || application_name || '" (' || app_state ||
            ') has reached 100% completion.',
          'application_update', 'check'
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_owner_on_application_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_admin_rec RECORD;
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'requested'
     AND NEW.assigned_expert_id IS NOT NULL THEN

    IF NEW.company_owner_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, icon_type)
      VALUES (
        NEW.company_owner_id,
        'Application Approved',
        'Your application "' || NEW.application_name || '" (' || NEW.state ||
          ') has been approved and is now in progress.',
        'application_update', 'check'
      );
    ELSIF NEW.agency_id IS NOT NULL THEN
      FOR agency_admin_rec IN
        SELECT user_id FROM public.agency_admins
        WHERE agency_id = NEW.agency_id
          AND user_id IS NOT NULL
          AND COALESCE(status, 'active') IN ('active', 'invited')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, icon_type)
        VALUES (
          agency_admin_rec.user_id,
          'Application Approved',
          'Application "' || NEW.application_name || '" (' || NEW.state ||
            ') has been approved and is now in progress.',
          'application_update', 'check'
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_owner_on_revision_needed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_admin_rec RECORD;
BEGIN
  IF NEW.status = 'needs_revision' AND OLD.status = 'under_review'
     AND NEW.revision_reason IS NOT NULL THEN

    IF NEW.company_owner_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, icon_type)
      VALUES (
        NEW.company_owner_id,
        'Application Needs Revision',
        'Your application "' || NEW.application_name || '" (' || NEW.state ||
          ') needs revision. Reason: ' || NEW.revision_reason,
        'application_update', 'warning'
      );
    ELSIF NEW.agency_id IS NOT NULL THEN
      FOR agency_admin_rec IN
        SELECT user_id FROM public.agency_admins
        WHERE agency_id = NEW.agency_id
          AND user_id IS NOT NULL
          AND COALESCE(status, 'active') IN ('active', 'invited')
      LOOP
        INSERT INTO notifications (user_id, title, message, type, icon_type)
        VALUES (
          agency_admin_rec.user_id,
          'Application Needs Revision',
          'Application "' || NEW.application_name || '" (' || NEW.state ||
            ') needs revision. Reason: ' || NEW.revision_reason,
          'application_update', 'warning'
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
