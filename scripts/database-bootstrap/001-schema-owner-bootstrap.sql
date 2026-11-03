-- One-time owner-run bootstrap. Rehearse and verify in Development first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $bootstrap$
DECLARE item record; command text;
BEGIN
  IF session_user <> 'neondb_owner' THEN RAISE EXCEPTION 'bootstrap must be run as neondb_owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_migrator') THEN RAISE EXCEPTION 'mycaresight_migrator must already exist'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_migrator' AND (rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'mycaresight_migrator has prohibited attributes';
  END IF;
  IF pg_has_role('mycaresight_migrator','neon_superuser','MEMBER') THEN RAISE EXCEPTION 'mycaresight_migrator must not inherit neon_superuser'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mycaresight_schema_owner') THEN
    CREATE ROLE mycaresight_schema_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT mycaresight_schema_owner TO neondb_owner;
  GRANT mycaresight_schema_owner TO mycaresight_migrator;
  GRANT USAGE, CREATE ON SCHEMA public TO mycaresight_schema_owner;

  FOR item IN SELECT c.relkind,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)='neondb_owner' AND c.relkind IN ('r','p','S','v','m','f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
      AND NOT (c.relkind='S' AND EXISTS (
        SELECT 1 FROM pg_depend linked
        WHERE linked.classid='pg_class'::regclass AND linked.objid=c.oid
          AND linked.refclassid='pg_class'::regclass AND linked.deptype IN ('a','i')
      ))
  LOOP
    command := CASE item.relkind WHEN 'S' THEN 'ALTER SEQUENCE' WHEN 'v' THEN 'ALTER VIEW' WHEN 'm' THEN 'ALTER MATERIALIZED VIEW' WHEN 'f' THEN 'ALTER FOREIGN TABLE' ELSE 'ALTER TABLE' END;
    EXECUTE format('%s %I.%I OWNER TO mycaresight_schema_owner',command,item.nspname,item.relname);
  END LOOP;

  FOR item IN SELECT p.prokind,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)='neondb_owner'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    command := CASE item.prokind WHEN 'p' THEN 'ALTER PROCEDURE' WHEN 'a' THEN 'ALTER AGGREGATE' ELSE 'ALTER FUNCTION' END;
    EXECUTE format('%s %I.%I(%s) OWNER TO mycaresight_schema_owner',command,item.nspname,item.proname,item.args);
  END LOOP;
END
$bootstrap$;
COMMIT;
