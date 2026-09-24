-- 015: provider-neutral Auth.js session, password-reset, and rate-limit storage.
-- Apply manually to Neon Dev first, verify, then apply to unused UAT.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE table_name text;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '015 must not run against Supabase';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '015 requires an independent migration owner and restricted runtime role';
  END IF;

  IF to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.user_agency_roles') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '015 requires user_profiles, user_agency_roles, and audit_log';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'auth_sessions', 'password_reset_tokens', 'auth_rate_limit_events'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      RAISE EXCEPTION '015 expected % to be absent', table_name;
    END IF;
  END LOOP;
END $preflight$;

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_ip_hash text CHECK (created_ip_hash IS NULL OR length(created_ip_hash) = 64),
  user_agent_hash text CHECK (user_agent_hash IS NULL OR length(user_agent_hash) = 64),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX auth_sessions_active_user_idx
  ON public.auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx
  ON public.auth_sessions (expires_at);

CREATE TABLE public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_ip_hash text CHECK (request_ip_hash IS NULL OR length(request_ip_hash) = 64),
  CHECK (expires_at > requested_at),
  CHECK (used_at IS NULL OR used_at >= requested_at)
);

CREATE INDEX password_reset_tokens_active_user_idx
  ON public.password_reset_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX password_reset_tokens_expiry_idx
  ON public.password_reset_tokens (expires_at);

CREATE TABLE public.auth_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('login_account', 'login_ip', 'reset_account', 'reset_ip')),
  subject_hash text NOT NULL CHECK (length(subject_hash) = 64),
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_rate_limit_events_lookup_idx
  ON public.auth_rate_limit_events (scope, subject_hash, created_at DESC);
CREATE INDEX auth_rate_limit_events_expiry_idx
  ON public.auth_rate_limit_events (created_at);

REVOKE ALL ON public.auth_sessions, public.password_reset_tokens,
  public.auth_rate_limit_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.auth_rate_limit_events_id_seq FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_sessions TO mycaresight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_tokens TO mycaresight_app;
GRANT SELECT, INSERT, DELETE ON public.auth_rate_limit_events TO mycaresight_app;
GRANT USAGE, SELECT ON SEQUENCE public.auth_rate_limit_events_id_seq TO mycaresight_app;

CREATE FUNCTION public.revoke_auth_sessions_after_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  target_user_id uuid;
  prior_user_id uuid;
  reason text;
  actor_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_profiles' THEN
    target_user_id := NEW.id;
    IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active
       AND NEW.role IS NOT DISTINCT FROM OLD.role
       AND NEW.agency_id IS NOT DISTINCT FROM OLD.agency_id
       AND NEW.email IS NOT DISTINCT FROM OLD.email
       AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
      RETURN NEW;
    END IF;
    reason := 'identity_changed';
  ELSE
    target_user_id := COALESCE(NEW.user_id, OLD.user_id);
    prior_user_id := CASE WHEN TG_OP = 'INSERT' THEN target_user_id ELSE OLD.user_id END;
    reason := 'membership_changed';
  END IF;

  UPDATE public.auth_sessions
  SET revoked_at = COALESCE(revoked_at, now()),
      revoke_reason = COALESCE(revoke_reason, reason)
  WHERE user_id IN (target_user_id, COALESCE(prior_user_id, target_user_id))
    AND revoked_at IS NULL;

  actor_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  INSERT INTO public.audit_log (
    table_name, record_id, action, performed_by_user_id, details
  ) VALUES (
    'auth_sessions', target_user_id, 'REVOKE', actor_id,
    jsonb_build_object('reason', reason)
  );

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.revoke_auth_sessions_after_identity_change() FROM PUBLIC;

CREATE TRIGGER user_profiles_revoke_auth_sessions
AFTER UPDATE OF is_active, role, agency_id, email, password_hash
ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.revoke_auth_sessions_after_identity_change();

CREATE TRIGGER user_agency_roles_revoke_auth_sessions
AFTER INSERT OR UPDATE OR DELETE
ON public.user_agency_roles
FOR EACH ROW
EXECUTE FUNCTION public.revoke_auth_sessions_after_identity_change();

COMMIT;
