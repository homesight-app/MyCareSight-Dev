-- Manual rollback after a successful Development bootstrap rehearsal.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $rollback$
DECLARE item record; command text;
BEGIN
  IF session_user <> 'neondb_owner' THEN RAISE EXCEPTION 'rollback must be run as neondb_owner'; END IF;

  FOR item IN SELECT c.relkind,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)='mycaresight_schema_owner' AND c.relkind IN ('r','p','S','v','m','f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
      AND NOT (c.relkind='S' AND EXISTS (
        SELECT 1 FROM pg_depend linked
        WHERE linked.classid='pg_class'::regclass AND linked.objid=c.oid
          AND linked.refclassid='pg_class'::regclass AND linked.deptype IN ('a','i')
      ))
  LOOP
    command := CASE item.relkind WHEN 'S' THEN 'ALTER SEQUENCE' WHEN 'v' THEN 'ALTER VIEW' WHEN 'm' THEN 'ALTER MATERIALIZED VIEW' WHEN 'f' THEN 'ALTER FOREIGN TABLE' ELSE 'ALTER TABLE' END;
    EXECUTE format('%s %I.%I OWNER TO neondb_owner',command,item.nspname,item.relname);
  END LOOP;

  FOR item IN SELECT p.prokind,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)='mycaresight_schema_owner'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    command := CASE item.prokind WHEN 'p' THEN 'ALTER PROCEDURE' WHEN 'a' THEN 'ALTER AGGREGATE' ELSE 'ALTER FUNCTION' END;
    EXECUTE format('%s %I.%I(%s) OWNER TO neondb_owner',command,item.nspname,item.proname,item.args);
  END LOOP;

  REVOKE USAGE, CREATE ON SCHEMA public FROM mycaresight_schema_owner;
  REVOKE mycaresight_schema_owner FROM mycaresight_migrator;
  -- Keep neondb_owner membership so the inert NOLOGIN role remains recoverable.
END
$rollback$;
COMMIT;
