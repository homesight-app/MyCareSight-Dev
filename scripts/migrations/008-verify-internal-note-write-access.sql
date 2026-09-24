-- Read-only verification after 008.
WITH policies AS (
 SELECT array_agg(polname ORDER BY polname) AS names FROM pg_policy WHERE polrelid='public.internal_notes'::regclass
), checks AS (
 SELECT
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.internal_notes'::regclass) AS forced_rls,
  has_table_privilege('mycaresight_app','public.internal_notes','SELECT') AS runtime_select,
  has_table_privilege('mycaresight_app','public.internal_notes','DELETE') AS runtime_delete,
  has_table_privilege('mycaresight_app','public.internal_notes','TRUNCATE,REFERENCES,TRIGGER') AS forbidden_table_privilege,
  has_column_privilege('mycaresight_app','public.internal_notes','content','UPDATE') AS content_update,
  has_column_privilege('mycaresight_app','public.internal_notes','agency_id','UPDATE') AS agency_update,
  has_function_privilege('mycaresight_app','public.internal_note_write_allowed(uuid,text,uuid,uuid,uuid)','EXECUTE') AS helper_execute,
  names
 FROM policies
)
SELECT *,
 forced_rls AND runtime_select AND runtime_delete AND NOT forbidden_table_privilege
 AND content_update AND NOT agency_update AND helper_execute
 AND names=ARRAY['internal_notes_scoped_delete','internal_notes_scoped_insert','internal_notes_scoped_select','internal_notes_scoped_update']::name[]
 AS write_access_pass
FROM checks;
