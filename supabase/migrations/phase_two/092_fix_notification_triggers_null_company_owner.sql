-- Fix: three notification triggers assumed company_owner_id is always set,
-- but admin/expert-created applications have company_owner_id = NULL.
-- Adding NULL guards before each INSERT into notifications prevents
-- "null value in column user_id violates not-null constraint" errors.

-- ── auto_review_on_100_percent ─────────────────────────────────────────────
-- Fires BEFORE UPDATE on applications when progress hits 100%.
-- Notifies the expert AND the owner. Owner notification guarded with NULL check.
CREATE OR REPLACE FUNCTION auto_review_on_100_percent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application_name TEXT;
  app_state TEXT;
BEGIN
  IF NEW.progress_percentage = 100
     AND OLD.progress_percentage < 100
     AND OLD.status = 'in_progress'
     AND NEW.assigned_expert_id IS NOT NULL THEN

    NEW.status := 'under_review';
    NEW.submitted_date := CURRENT_DATE;

    application_name := NEW.application_name;
    app_state := NEW.state;

    -- Notify the assigned expert
    INSERT INTO notifications (user_id, title, message, type, icon_type)
    VALUES (
      NEW.assigned_expert_id,
      'Application Ready for Review',
      'Application "' || application_name || '" (' || app_state || ') has reached 100% completion and is ready for your review.',
      'application_update',
      'document'
    );

    -- Notify the company owner only when one exists (admin/expert-created apps have none)
    IF NEW.company_owner_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, icon_type)
      VALUES (
        NEW.company_owner_id,
        'Application Submitted for Review',
        'Your application "' || application_name || '" (' || app_state || ') has been submitted for expert review.',
        'application_update',
        'check'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── notify_owner_on_application_approval ──────────────────────────────────
-- Fires AFTER UPDATE on applications when status moves requested → in_progress.
CREATE OR REPLACE FUNCTION notify_owner_on_application_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'requested'
     AND NEW.assigned_expert_id IS NOT NULL
     AND NEW.company_owner_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, icon_type)
    VALUES (
      NEW.company_owner_id,
      'Application Approved',
      'Your application "' || NEW.application_name || '" (' || NEW.state || ') has been approved and is now in progress.',
      'application_update',
      'check'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── notify_owner_on_revision_needed ───────────────────────────────────────
-- Fires AFTER UPDATE on applications when status moves under_review → needs_revision.
CREATE OR REPLACE FUNCTION notify_owner_on_revision_needed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'needs_revision' AND OLD.status = 'under_review'
     AND NEW.revision_reason IS NOT NULL
     AND NEW.company_owner_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, icon_type)
    VALUES (
      NEW.company_owner_id,
      'Application Needs Revision',
      'Your application "' || NEW.application_name || '" (' || NEW.state || ') needs revision. Reason: ' || NEW.revision_reason,
      'application_update',
      'warning'
    );
  END IF;

  RETURN NEW;
END;
$$;
