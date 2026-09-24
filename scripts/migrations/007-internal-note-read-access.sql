-- 007: internal-note reads only. Manual Dev first, then UAT; never Production/Supabase.
-- Keeps application/platform notes separate from agency-only clinical/workforce notes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
DECLARE dependency text;
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN
  RAISE EXCEPTION '007 must not run against Supabase';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
  RAISE EXCEPTION '007 requires independent migration owner and restricted runtime role';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.internal_notes') AND relrowsecurity AND relforcerowsecurity) THEN
  RAISE EXCEPTION '007 requires staged internal_notes from 002';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.internal_notes'::regclass)
 OR has_table_privilege('mycaresight_app','public.internal_notes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege('mycaresight_app','public.internal_notes','SELECT,INSERT,UPDATE,REFERENCES') THEN
  RAISE EXCEPTION '007 requires untouched staging access; verify instead of rerunning';
 END IF;
 FOREACH dependency IN ARRAY ARRAY['user_profiles','user_agency_roles','patients','caregiver_members','scheduled_visits','applications','application_steps','application_documents','application_playbook_items']
 LOOP
  IF to_regclass(format('public.%I',dependency)) IS NULL THEN
   RAISE EXCEPTION '007 missing dependency: %',dependency;
  END IF;
  IF NOT has_table_privilege('mycaresight_app',format('public.%I',dependency),'SELECT') THEN
   RAISE EXCEPTION '007 runtime lacks SELECT: %',dependency;
  END IF;
 END LOOP;
 IF NOT has_table_privilege('mycaresight_app','public.audit_log','INSERT') THEN
  RAISE EXCEPTION '007 requires runtime audit INSERT';
 END IF;
END
$preflight$;

CREATE POLICY internal_notes_scoped_select ON public.internal_notes
FOR SELECT TO mycaresight_app
USING (EXISTS (
 SELECT 1 FROM public.user_profiles actor
 WHERE actor.id::text=NULLIF(current_setting('app.current_user_id',true),'')
 AND actor.is_active=true
 AND (
  (actor.role IN ('admin','expert')
   AND tagged_patient_id IS NULL AND tagged_caregiver_id IS NULL
   AND (
  (subject_type='application' AND EXISTS (SELECT 1 FROM public.applications a WHERE a.id=subject_id AND a.agency_id=internal_notes.agency_id))
  OR (subject_type='application_step' AND EXISTS (SELECT 1 FROM public.application_steps s JOIN public.applications a ON a.id=s.application_id WHERE s.id=subject_id AND a.agency_id=internal_notes.agency_id))
  OR (subject_type='application_document' AND EXISTS (SELECT 1 FROM public.application_documents s JOIN public.applications a ON a.id=s.application_id WHERE s.id=subject_id AND a.agency_id=internal_notes.agency_id))
  OR (subject_type='application_playbook_item' AND EXISTS (SELECT 1 FROM public.application_playbook_items s JOIN public.applications a ON a.id=s.application_id WHERE s.id=subject_id AND a.agency_id=internal_notes.agency_id))
))
  OR
  (actor.role IN ('company_owner','care_coordinator')
   AND EXISTS (SELECT 1 FROM public.user_agency_roles m WHERE m.user_id=actor.id
    AND m.agency_id=internal_notes.agency_id AND m.role=actor.role AND m.status='active')
   AND (
  (subject_type = 'patient' AND EXISTS (SELECT 1 FROM public.patients s WHERE s.id=subject_id AND s.agency_id=internal_notes.agency_id))
  OR (subject_type = 'caregiver' AND EXISTS (SELECT 1 FROM public.caregiver_members s WHERE s.id=subject_id AND s.agency_id=internal_notes.agency_id))
  OR (subject_type = 'visit' AND EXISTS (SELECT 1 FROM public.scheduled_visits s WHERE s.id=subject_id AND s.agency_id=internal_notes.agency_id))
)
   AND (tagged_patient_id IS NULL OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id=tagged_patient_id AND p.agency_id=internal_notes.agency_id))
   AND (tagged_caregiver_id IS NULL OR EXISTS (SELECT 1 FROM public.caregiver_members c WHERE c.id=tagged_caregiver_id AND c.agency_id=internal_notes.agency_id))
  )
 )
));
GRANT SELECT ON public.internal_notes TO mycaresight_app;
-- No writes, helper bypasses, source/data copies, or other-table access changes.
COMMIT;
