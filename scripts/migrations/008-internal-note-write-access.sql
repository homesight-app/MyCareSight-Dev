-- 008: controlled internal-note writes. Manual Dev first, then UAT; never Production/Supabase.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION '008 must not run against Supabase'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR pg_has_role('mycaresight_app',current_user,'MEMBER') THEN
  RAISE EXCEPTION '008 requires independent migration owner and restricted runtime role';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.internal_notes'::regclass AND polname='internal_notes_scoped_select')
 OR NOT has_table_privilege('mycaresight_app','public.internal_notes','SELECT')
 OR has_table_privilege('mycaresight_app','public.internal_notes','INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION '008 requires verified 007 read-only state';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.internal_note_write_allowed(uuid,text,uuid,uuid,uuid)'))
 OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.internal_notes'::regclass AND polname LIKE 'internal_notes_scoped_%' AND polname<>'internal_notes_scoped_select') THEN
  RAISE EXCEPTION '008 objects already exist; verify instead of rerunning';
 END IF;
END
$preflight$;

CREATE FUNCTION public.internal_note_write_allowed(
  note_agency uuid,note_type text,note_subject uuid,patient_tag uuid,caregiver_tag uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.user_profiles actor
  WHERE actor.id::text=NULLIF(current_setting('app.current_user_id',true),'')
    AND actor.is_active=true
    AND (
      (actor.role IN ('admin','expert')
       AND patient_tag IS NULL AND caregiver_tag IS NULL
       AND (
         (note_type='application' AND EXISTS (SELECT 1 FROM public.applications a WHERE a.id=note_subject AND a.agency_id=note_agency))
         OR (note_type='application_step' AND EXISTS (SELECT 1 FROM public.application_steps s JOIN public.applications a ON a.id=s.application_id WHERE s.id=note_subject AND a.agency_id=note_agency))
         OR (note_type='application_document' AND EXISTS (SELECT 1 FROM public.application_documents s JOIN public.applications a ON a.id=s.application_id WHERE s.id=note_subject AND a.agency_id=note_agency))
         OR (note_type='application_playbook_item' AND EXISTS (SELECT 1 FROM public.application_playbook_items s JOIN public.applications a ON a.id=s.application_id WHERE s.id=note_subject AND a.agency_id=note_agency))
       ))
      OR
      (actor.role IN ('company_owner','care_coordinator')
       AND EXISTS (SELECT 1 FROM public.user_agency_roles m WHERE m.user_id=actor.id AND m.agency_id=note_agency AND m.role=actor.role AND m.status='active')
       AND (
         (note_type='patient' AND EXISTS (SELECT 1 FROM public.patients s WHERE s.id=note_subject AND s.agency_id=note_agency))
         OR (note_type='caregiver' AND EXISTS (SELECT 1 FROM public.caregiver_members s WHERE s.id=note_subject AND s.agency_id=note_agency))
         OR (note_type='visit' AND EXISTS (SELECT 1 FROM public.scheduled_visits s WHERE s.id=note_subject AND s.agency_id=note_agency))
       )
       AND (patient_tag IS NULL OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id=patient_tag AND p.agency_id=note_agency))
       AND (caregiver_tag IS NULL OR EXISTS (SELECT 1 FROM public.caregiver_members c WHERE c.id=caregiver_tag AND c.agency_id=note_agency))
      )
    )
 )
$$;
REVOKE ALL ON FUNCTION public.internal_note_write_allowed(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_note_write_allowed(uuid,text,uuid,uuid,uuid) TO mycaresight_app;

CREATE POLICY internal_notes_scoped_insert ON public.internal_notes FOR INSERT TO mycaresight_app
WITH CHECK (
 created_by::text=NULLIF(current_setting('app.current_user_id',true),'') AND updated_by IS NULL
 AND length(btrim(content)) BETWEEN 1 AND 10000
 AND public.internal_note_write_allowed(agency_id,subject_type,subject_id,tagged_patient_id,tagged_caregiver_id)
);
CREATE POLICY internal_notes_scoped_update ON public.internal_notes FOR UPDATE TO mycaresight_app
USING (public.internal_note_write_allowed(agency_id,subject_type,subject_id,tagged_patient_id,tagged_caregiver_id))
WITH CHECK (
 updated_by::text=NULLIF(current_setting('app.current_user_id',true),'')
 AND length(btrim(content)) BETWEEN 1 AND 10000
 AND public.internal_note_write_allowed(agency_id,subject_type,subject_id,tagged_patient_id,tagged_caregiver_id)
);
CREATE POLICY internal_notes_scoped_delete ON public.internal_notes FOR DELETE TO mycaresight_app
USING (public.internal_note_write_allowed(agency_id,subject_type,subject_id,tagged_patient_id,tagged_caregiver_id));

GRANT INSERT (agency_id,subject_type,subject_id,content,created_by,tagged_patient_id,tagged_caregiver_id)
 ON public.internal_notes TO mycaresight_app;
GRANT UPDATE (content,updated_by,updated_at,tagged_patient_id,tagged_caregiver_id)
 ON public.internal_notes TO mycaresight_app;
GRANT DELETE ON public.internal_notes TO mycaresight_app;
COMMIT;
