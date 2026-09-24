-- 001: indexes for the authorized Neon message read-state repository.
-- Apply manually to Neon dev first, then uat after local verification.
-- No application data is copied or modified. This does not restore missing tables.
-- Branch identity cannot be inferred from current_database(); select it in Neon.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preconditions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('user_agency_roles', 'user_id', 'uuid'),
      ('user_agency_roles', 'agency_id', 'uuid'),
      ('user_agency_roles', 'role', 'text'),
      ('user_agency_roles', 'status', 'text'),
      ('conversations', 'application_id', 'uuid'),
      ('conversations', 'client_id', 'uuid')
    ) AS required(table_name, column_name, udt_name)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
    WHERE actual.udt_name IS DISTINCT FROM required.udt_name
  ) THEN
    RAISE EXCEPTION '001 precondition failed: required message-scope columns are missing or have different types';
  END IF;
END
$preconditions$;

CREATE INDEX IF NOT EXISTS idx_user_agency_roles_active_message_scope
  ON public.user_agency_roles (user_id, agency_id, role)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_conversations_application_id
  ON public.conversations (application_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id
  ON public.conversations (client_id);

-- IF NOT EXISTS alone can hide a conflicting index definition. Fail atomically.
DO $verify$
DECLARE expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('idx_user_agency_roles_active_message_scope',
       'CREATE INDEX idx_user_agency_roles_active_message_scope ON public.user_agency_roles USING btree (user_id, agency_id, role) WHERE (status = ''active''::text)'),
      ('idx_conversations_application_id',
       'CREATE INDEX idx_conversations_application_id ON public.conversations USING btree (application_id)'),
      ('idx_conversations_client_id',
       'CREATE INDEX idx_conversations_client_id ON public.conversations USING btree (client_id)')
    ) AS definitions(name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = expected.name
        AND i.indisvalid AND i.indisready
        AND pg_catalog.pg_get_indexdef(c.oid) = expected.definition
    ) THEN
      RAISE EXCEPTION '001 index definition mismatch: %', expected.name;
    END IF;
  END LOOP;
END
$verify$;
COMMIT;
