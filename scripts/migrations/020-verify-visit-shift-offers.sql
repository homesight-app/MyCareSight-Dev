-- Read-only verification for migration 020. Expect every boolean to be true
-- and every *_count value to be zero.
WITH objects AS (
  SELECT
    to_regclass('public.visit_shift_offers') IS NOT NULL AS offers_table_ok,
    to_regclass('public.visit_shift_offer_recipients') IS NOT NULL AS recipients_table_ok,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schedule_assignment_requests'
        AND column_name = 'shift_offer_recipient_id'
    ) AS request_link_ok,
    to_regprocedure('public.close_visit_shift_offers_after_visit_change()') IS NOT NULL AS close_function_ok,
    to_regprocedure('public.reset_shift_offer_recipient_after_request_delete()') IS NOT NULL AS reset_function_ok
), triggers AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.scheduled_visits'::regclass
        AND tgname = 'scheduled_visits_close_shift_offers'
        AND NOT tgisinternal
    ) AS close_trigger_ok,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.schedule_assignment_requests'::regclass
        AND tgname = 'schedule_assignment_requests_reset_shift_offer'
        AND NOT tgisinternal
    ) AS reset_trigger_ok
), security AS (
  SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.visit_shift_offers'::regclass) AS offers_rls_ok,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.visit_shift_offer_recipients'::regclass) AS recipients_rls_ok,
    (SELECT count(*) = 4 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'visit_shift_offers') AS offer_policies_ok,
    (SELECT count(*) = 5 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'visit_shift_offer_recipients') AS recipient_policies_ok,
    has_table_privilege('mycaresight_app', 'public.visit_shift_offers', 'SELECT') AS app_can_read_offers,
    has_table_privilege('mycaresight_app', 'public.visit_shift_offer_recipients', 'SELECT') AS app_can_read_recipients,
    NOT has_table_privilege('public', 'public.visit_shift_offers', 'SELECT')
      AND NOT has_table_privilege('public', 'public.visit_shift_offer_recipients', 'SELECT') AS public_access_blocked,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs')
      THEN NOT has_table_privilege('mycaresight_jobs', 'public.visit_shift_offers', 'SELECT')
        AND NOT has_table_privilege('mycaresight_jobs', 'public.visit_shift_offer_recipients', 'SELECT')
      ELSE true
    END AS jobs_access_blocked
), integrity AS (
  SELECT
    (SELECT count(*)::integer FROM (
      SELECT scheduled_visit_id
      FROM public.visit_shift_offers
      WHERE status = 'open'
      GROUP BY scheduled_visit_id HAVING count(*) > 1
    ) duplicate_open) AS duplicate_open_offer_count,
    (SELECT count(*)::integer
      FROM public.visit_shift_offer_recipients recipient
      JOIN public.visit_shift_offers offer ON offer.id = recipient.offer_id
      JOIN public.caregiver_members caregiver ON caregiver.id = recipient.caregiver_member_id
      WHERE recipient.agency_id <> offer.agency_id
         OR recipient.agency_id <> caregiver.agency_id
         OR recipient.user_id IS DISTINCT FROM caregiver.user_id) AS cross_agency_recipient_count
)
SELECT *
FROM objects
CROSS JOIN triggers
CROSS JOIN security
CROSS JOIN integrity;
