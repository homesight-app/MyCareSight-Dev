-- Read-only verification for migration 039. Expect every value to be true.
WITH trigger_definitions AS (
  SELECT tgname, lower(pg_catalog.pg_get_triggerdef(oid)) AS definition
  FROM pg_catalog.pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN (
      'agency_admins_sync_role',
      'care_coordinators_sync_role',
      'caregiver_members_sync_role',
      'user_agency_roles_revoke_auth_sessions'
    )
), function_definitions AS (
  SELECT
    lower(pg_catalog.pg_get_functiondef(
      'public.sync_user_agency_role()'::regprocedure
    )) AS sync_definition,
    lower(pg_catalog.pg_get_functiondef(
      'public.revoke_auth_sessions_after_identity_change()'::regprocedure
    )) AS revocation_definition
)
SELECT
  (
    SELECT count(*) = 3
      AND bool_and(definition LIKE '%update of user_id, agency_id, status%')
    FROM trigger_definitions
    WHERE tgname IN (
      'agency_admins_sync_role',
      'care_coordinators_sync_role',
      'caregiver_members_sync_role'
    )
  ) AS source_triggers_are_scoped,
  COALESCE((
    SELECT definition LIKE '%update of user_id, agency_id, role, status%'
    FROM trigger_definitions
    WHERE tgname = 'user_agency_roles_revoke_auth_sessions'
  ), false) AS revocation_trigger_is_scoped,
  position(
    'where user_agency_roles.status is distinct from excluded.status'
    IN sync_definition
  ) > 0 AS membership_upsert_skips_noop,
  position('new.user_id is not distinct from old.user_id' IN revocation_definition) > 0
    AND position('new.agency_id is not distinct from old.agency_id' IN revocation_definition) > 0
    AND position('new.role is not distinct from old.role' IN revocation_definition) > 0
    AND position('new.status is not distinct from old.status' IN revocation_definition) > 0
    AS revocation_function_skips_noop,
  NOT has_function_privilege('public', 'public.sync_user_agency_role()', 'EXECUTE')
    AND NOT has_function_privilege(
      'public',
      'public.revoke_auth_sessions_after_identity_change()',
      'EXECUTE'
    ) AS public_execute_remains_blocked
FROM function_definitions;

