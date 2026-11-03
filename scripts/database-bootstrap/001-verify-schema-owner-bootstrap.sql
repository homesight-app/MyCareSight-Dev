WITH migrator AS (
  SELECT * FROM pg_roles WHERE rolname='mycaresight_migrator'
), owner_role AS (
  SELECT * FROM pg_roles WHERE rolname='mycaresight_schema_owner'
), memberships AS (
  SELECT member.rolname AS member_name, granted.rolname AS granted_name
  FROM pg_auth_members am
  JOIN pg_roles member ON member.oid=am.member
  JOIN pg_roles granted ON granted.oid=am.roleid
), remaining_objects AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')
    AND pg_get_userbyid(c.relowner)='neondb_owner'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  UNION ALL
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)='neondb_owner'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
)
SELECT
  (SELECT count(*)=1 FROM migrator) AS migrator_exists,
  COALESCE((SELECT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls FROM migrator),false) AS migrator_is_restricted,
  NOT EXISTS (SELECT 1 FROM memberships WHERE member_name='mycaresight_migrator' AND granted_name='neon_superuser') AS migrator_not_neon_superuser,
  COALESCE((SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls FROM owner_role),false) AS owner_role_is_restricted,
  EXISTS (SELECT 1 FROM memberships WHERE member_name='mycaresight_migrator' AND granted_name='mycaresight_schema_owner') AS migrator_is_member,
  EXISTS (SELECT 1 FROM memberships WHERE member_name='neondb_owner' AND granted_name='mycaresight_schema_owner') AS emergency_owner_is_member,
  (SELECT count(*)=0 FROM remaining_objects) AS no_untransferred_application_objects,
  (SELECT pg_get_userbyid(datdba)='neondb_owner' FROM pg_database WHERE datname=current_database()) AS database_owner_unchanged,
  (SELECT pg_get_userbyid(nspowner)='pg_database_owner' FROM pg_namespace WHERE nspname='public') AS public_schema_owner_unchanged,
  NOT EXISTS (SELECT 1 FROM memberships WHERE member_name='mycaresight_app' AND granted_name='mycaresight_schema_owner') AS app_not_owner_member,
  NOT EXISTS (SELECT 1 FROM memberships WHERE member_name='mycaresight_jobs' AND granted_name='mycaresight_schema_owner') AS jobs_not_owner_member,
  NOT EXISTS (
    SELECT 1 FROM pg_depend d
    LEFT JOIN pg_class c ON d.classid='pg_class'::regclass AND c.oid=d.objid
    LEFT JOIN pg_proc p ON d.classid='pg_proc'::regclass AND p.oid=d.objid
    WHERE d.deptype='e' AND (
      pg_get_userbyid(c.relowner)='mycaresight_schema_owner'
      OR pg_get_userbyid(p.proowner)='mycaresight_schema_owner'
    )
  ) AS extension_objects_unchanged;
